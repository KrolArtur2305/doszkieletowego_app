import Constants from 'expo-constants';
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
    const ready = await ensureConfigured();
    if (!ready) return null;

    const Purchases = await getPurchasesModule();
    return await Purchases.getOfferings();
  } catch (error) {
    console.warn('[RevenueCat] getOfferingsSafe failed:', error);
    return null;
  }
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

    console.warn('[RevenueCat] purchasePackageSafe failed:', error);
    return { customerInfo: null, cancelled: false, error };
  }
}
