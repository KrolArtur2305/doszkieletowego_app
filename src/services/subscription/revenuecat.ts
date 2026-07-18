import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import type { CustomerInfo, PurchasesOfferings, PurchasesPackage } from 'react-native-purchases';
import { publicConfig } from '../../../lib/supabase';
import { isLaunchPaymentsDisabled } from './launchMode';
import type { RevenueCatSupportStatus } from './types';

type RevenueCatPlatformConfig = {
  platform: 'ios' | 'android';
  apiKey: string | null;
};

export type PurchasePackageResult = {
  customerInfo: CustomerInfo | null;
  cancelled: boolean;
  error: unknown | null;
};

let configuredApiKey: string | null = null;
let configuredPlatform: RevenueCatPlatformConfig['platform'] | null = null;
const warnedStatuses = new Set<string>();
let lastOfferingsDiagnostics: RevenueCatOfferingsDiagnostics | null = null;

const EXPECTED_ANDROID_PACKAGE_NAME = 'com.buildiq.app';
const EXPECTED_PRODUCT_IDS = [
  'buildiq_pro_monthly',
  'buildiq_pro_yearly',
  'buildiq_expert_monthly',
  'buildiq_expert_yearly',
];

type StoreEnvironmentDiagnostics = {
  platform: typeof Platform.OS;
  packageName: string | null;
  expectedAndroidPackageName: string | null;
  packageNameMatchesExpected: boolean | null;
  installReferrer: string | null;
  installReferrerAvailable: boolean | null;
  supportStatus: RevenueCatSupportStatus;
  apiKey: string;
  apiKeyPrefix: string | null;
};

type RevenueCatOfferingsDiagnostics = StoreEnvironmentDiagnostics & {
  offeringsReturned: boolean;
  currentOffering: string | null;
  offeringIdentifiers: string[];
  currentPackageCount: number;
  products: Array<{
    packageIdentifier: string;
    packageType: string | null;
    productIdentifier: string;
    priceString: string | null;
    title: string | null;
    subscriptionPeriod: string | null;
  }>;
  expectedProductIds: string[];
  missingExpectedProductIds: string[];
  error: ReturnType<typeof getErrorDiagnostics> | null;
};

function maskApiKey(apiKey: string | null): string {
  if (!apiKey) return 'missing';
  if (apiKey.length <= 10) return `${apiKey.slice(0, 3)}...${apiKey.slice(-2)}`;
  return `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`;
}

function getErrorDiagnostics(error: any) {
  return {
    code: error?.code ?? error?.errorCode ?? null,
    message: error?.message ?? String(error ?? 'unknown'),
    underlyingErrorMessage: error?.underlyingErrorMessage ?? null,
    readableErrorCode: error?.readableErrorCode ?? null,
    userCancelled: error?.userCancelled ?? null,
  };
}

function logDevelopment(message: string, data?: Record<string, unknown>) {
  console.log(message, data ?? {});
}

function warnOnce(key: string, message: string) {
  if (warnedStatuses.has(key)) return;
  warnedStatuses.add(key);
  console.warn(message);
}

function isExpoGo(): boolean {
  const executionEnvironment = (Constants as any).executionEnvironment;
  const appOwnership = (Constants as any).appOwnership;
  return executionEnvironment === 'storeClient' || appOwnership === 'expo';
}

function getRevenueCatPlatformConfig(): RevenueCatPlatformConfig | null {
  if (Platform.OS === 'ios') {
    return {
      platform: 'ios',
      apiKey: publicConfig.revenueCat.iosApiKey,
    };
  }

  if (Platform.OS === 'android') {
    return {
      platform: 'android',
      apiKey: publicConfig.revenueCat.androidApiKey,
    };
  }

  return null;
}

export function getRevenueCatSupportStatus(): RevenueCatSupportStatus {
  if (isLaunchPaymentsDisabled()) {
    return 'payments-disabled';
  }

  const platformConfig = getRevenueCatPlatformConfig();
  if (!platformConfig) {
    return 'unsupported-platform';
  }

  if (isExpoGo()) {
    return 'expo-go';
  }

  if (!platformConfig.apiKey) {
    return 'missing-api-key';
  }

  return 'ready';
}

async function getPurchasesModule() {
  const module = await import('react-native-purchases');
  return module.default;
}

async function getInstallReferrer(): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  try {
    return await Application.getInstallReferrerAsync();
  } catch (error) {
    console.warn('[RevenueCat] Google Play install referrer lookup failed:', getErrorDiagnostics(error));
    return null;
  }
}

async function getStoreEnvironmentDiagnostics(): Promise<StoreEnvironmentDiagnostics> {
  const platformConfig = getRevenueCatPlatformConfig();
  const installReferrer = await getInstallReferrer();
  const packageName = Application.applicationId ?? null;

  return {
    platform: Platform.OS,
    packageName,
    expectedAndroidPackageName: Platform.OS === 'android' ? EXPECTED_ANDROID_PACKAGE_NAME : null,
    packageNameMatchesExpected:
      Platform.OS === 'android' ? packageName === EXPECTED_ANDROID_PACKAGE_NAME : null,
    installReferrer,
    installReferrerAvailable: Platform.OS === 'android' ? installReferrer !== null : null,
    supportStatus: getRevenueCatSupportStatus(),
    apiKey: maskApiKey(platformConfig?.apiKey ?? null),
    apiKeyPrefix: platformConfig?.apiKey ? platformConfig.apiKey.slice(0, 5) : null,
  };
}

function summarizePackage(pkg: PurchasesPackage) {
  return {
    packageIdentifier: pkg.identifier,
    packageType: pkg.packageType ? String(pkg.packageType) : null,
    productIdentifier: pkg.product.identifier,
    priceString: pkg.product.priceString ?? null,
    title: pkg.product.title ?? null,
    subscriptionPeriod: (pkg.product as any)?.subscriptionPeriod ?? null,
  };
}

function getMissingExpectedProductIds(packages: PurchasesPackage[]) {
  const productIds = new Set(packages.map((pkg) => pkg.product.identifier.toLowerCase()));
  return EXPECTED_PRODUCT_IDS.filter((productId) => !productIds.has(productId));
}

async function ensureConfigured(): Promise<boolean> {
  if (isLaunchPaymentsDisabled()) {
    warnOnce(
      'payments-disabled',
      '[RevenueCat] Payments are disabled for this build. Skipping SDK configuration.'
    );
    return false;
  }

  const status = getRevenueCatSupportStatus();
  if (status === 'unsupported-platform') return false;

  if (status === 'expo-go') {
    warnOnce(
      status,
      '[RevenueCat] Expo Go does not support the native purchases module. Use a dev build or store build.'
    );
    return false;
  }

  if (status === 'missing-api-key') {
    const platform = Platform.OS === 'ios' ? 'IOS' : Platform.OS === 'android' ? 'ANDROID' : 'UNKNOWN';
    warnOnce(
      status,
      `[RevenueCat] Missing EXPO_PUBLIC_REVENUECAT_${platform}_API_KEY for the current platform.`
    );
    return false;
  }

  const platformConfig = getRevenueCatPlatformConfig();
  const apiKey = platformConfig?.apiKey;
  if (!platformConfig || !apiKey) return false;
  if (configuredApiKey === apiKey && configuredPlatform === platformConfig.platform) return true;

  const Purchases = await getPurchasesModule();
  const environment = await getStoreEnvironmentDiagnostics();
  logDevelopment('[RevenueCat] configure', {
    ...environment,
    configuredPlatform: platformConfig.platform,
    apiKey: maskApiKey(apiKey),
  });
  Purchases.configure({ apiKey });
  configuredApiKey = apiKey;
  configuredPlatform = platformConfig.platform;

  return true;
}

export async function configurePurchases(): Promise<boolean> {
  try {
    return await ensureConfigured();
  } catch (error) {
    console.warn('[RevenueCat] configurePurchases failed:', error);
    return false;
  }
}

export async function logInPurchasesUser(appUserId: string): Promise<boolean> {
  if (!appUserId) return false;

  try {
    const ready = await ensureConfigured();
    if (!ready) return false;

    const Purchases = await getPurchasesModule();
    await Purchases.logIn(appUserId);
    return true;
  } catch (error) {
    console.warn('[RevenueCat] logInPurchasesUser failed:', error);
    return false;
  }
}

export async function logOutPurchasesUser(): Promise<boolean> {
  try {
    const ready = await ensureConfigured();
    if (!ready) return false;

    const Purchases = await getPurchasesModule();
    await Purchases.logOut();
    return true;
  } catch (error) {
    console.warn('[RevenueCat] logOutPurchasesUser failed:', error);
    return false;
  }
}

export async function getCustomerInfoSafe(): Promise<CustomerInfo | null> {
  try {
    const ready = await ensureConfigured();
    if (!ready) return null;

    const Purchases = await getPurchasesModule();
    return await Purchases.getCustomerInfo();
  } catch (error) {
    console.warn('[RevenueCat] getCustomerInfoSafe failed:', error);
    return null;
  }
}

export async function getOfferingsSafe(): Promise<PurchasesOfferings | null> {
  try {
    const environment = await getStoreEnvironmentDiagnostics();
    const ready = await ensureConfigured();
    if (!ready) {
      lastOfferingsDiagnostics = {
        ...environment,
        supportStatus: getRevenueCatSupportStatus(),
        offeringsReturned: false,
        currentOffering: null,
        offeringIdentifiers: [],
        currentPackageCount: 0,
        products: [],
        expectedProductIds: EXPECTED_PRODUCT_IDS,
        missingExpectedProductIds: EXPECTED_PRODUCT_IDS,
        error: null,
      };
      logDevelopment('[RevenueCat] offerings skipped', {
        ...lastOfferingsDiagnostics,
      });
      return null;
    }

    const Purchases = await getPurchasesModule();
    const offerings = await Purchases.getOfferings();
    const packages = offerings.current?.availablePackages ?? [];
    lastOfferingsDiagnostics = {
      ...environment,
      supportStatus: getRevenueCatSupportStatus(),
      offeringsReturned: true,
      currentOffering: offerings.current?.identifier ?? null,
      offeringIdentifiers: Object.keys(offerings.all ?? {}),
      currentPackageCount: packages.length,
      products: packages.map(summarizePackage),
      expectedProductIds: EXPECTED_PRODUCT_IDS,
      missingExpectedProductIds: getMissingExpectedProductIds(packages),
      error: null,
    };
    logDevelopment('[RevenueCat] getOfferings() result', lastOfferingsDiagnostics);
    return offerings;
  } catch (error: any) {
    const diagnostics = getErrorDiagnostics(error);
    lastOfferingsDiagnostics = {
      ...(await getStoreEnvironmentDiagnostics()),
      offeringsReturned: false,
      currentOffering: null,
      offeringIdentifiers: [],
      currentPackageCount: 0,
      products: [],
      expectedProductIds: EXPECTED_PRODUCT_IDS,
      missingExpectedProductIds: EXPECTED_PRODUCT_IDS,
      error: diagnostics,
    };
    console.warn('[RevenueCat] getOfferingsSafe failed:', lastOfferingsDiagnostics);
    return null;
  }
}

export function getLastOfferingsDiagnostics(): RevenueCatOfferingsDiagnostics | null {
  return lastOfferingsDiagnostics;
}

export async function restorePurchasesSafe(): Promise<CustomerInfo | null> {
  try {
    const ready = await ensureConfigured();
    if (!ready) return null;

    const Purchases = await getPurchasesModule();
    return await Purchases.restorePurchases();
  } catch (error) {
    console.warn('[RevenueCat] restorePurchasesSafe failed:', error);
    return null;
  }
}

export async function purchasePackageSafe(pkg: PurchasesPackage): Promise<PurchasePackageResult> {
  try {
    const ready = await ensureConfigured();
    if (!ready) {
      return { customerInfo: null, cancelled: false, error: new Error('RevenueCat is not ready.') };
    }

    const Purchases = await getPurchasesModule();
    const result = await Purchases.purchasePackage(pkg);
    return { customerInfo: result.customerInfo ?? null, cancelled: false, error: null };
  } catch (error: any) {
    if (error?.userCancelled) {
      return { customerInfo: null, cancelled: true, error: null };
    }

    console.warn('[RevenueCat] purchasePackageSafe failed:', getErrorDiagnostics(error));
    return { customerInfo: null, cancelled: false, error };
  }
}
