import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { CustomerInfo, PurchasesOfferings } from 'react-native-purchases';
import { publicConfig } from '../../../lib/supabase';
import { isLaunchPaymentsDisabled } from './launchMode';
import type { RevenueCatSupportStatus } from './types';

let configuredApiKey: string | null = null;
const warnedStatuses = new Set<string>();

function warnOnce(status: RevenueCatSupportStatus, message: string) {
  if (warnedStatuses.has(status)) return;
  warnedStatuses.add(status);
  console.warn(message);
}

function isExpoGo(): boolean {
  const executionEnvironment = (Constants as any).executionEnvironment;
  const appOwnership = (Constants as any).appOwnership;
  return executionEnvironment === 'storeClient' || appOwnership === 'expo';
}

function getRevenueCatApiKey(): string | null {
  if (Platform.OS === 'ios') return publicConfig.revenueCat.iosApiKey;
  if (Platform.OS === 'android') return publicConfig.revenueCat.androidApiKey;
  return null;
}

export function getRevenueCatSupportStatus(): RevenueCatSupportStatus {
  if (isLaunchPaymentsDisabled()) {
    return 'missing-api-key';
  }

  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return 'unsupported-platform';
  }

  if (isExpoGo()) {
    return 'expo-go';
  }

  if (!getRevenueCatApiKey()) {
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
    warnOnce(
      status,
      '[RevenueCat] Missing EXPO_PUBLIC_REVENUECAT_* API key for the current platform.'
    );
    return false;
  }

  const apiKey = getRevenueCatApiKey();
  if (!apiKey) return false;
  if (configuredApiKey === apiKey) return true;

  const Purchases = await getPurchasesModule();
  Purchases.configure({ apiKey });
  configuredApiKey = apiKey;

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
