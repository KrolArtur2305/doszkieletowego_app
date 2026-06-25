import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const supabaseConfigError = isSupabaseConfigured
  ? null
  : `Supabase ENV missing: url=${String(supabaseUrl)} key=${supabaseAnonKey ? 'set' : 'missing'}`;

const resolvedSupabaseUrl = supabaseUrl ?? 'https://placeholder.supabase.co';
const resolvedSupabaseAnonKey = supabaseAnonKey ?? 'placeholder-anon-key';
const resolvedSupabaseStorageKey = `sb-${new URL(resolvedSupabaseUrl).hostname.split('.')[0]}-auth-token`;

export const publicConfig = {
  supabaseUrl: resolvedSupabaseUrl,
  supabaseAnonKey: resolvedSupabaseAnonKey,
  aiChatEndpoint: `${resolvedSupabaseUrl}/functions/v1/ai-chat`,
  budgetScanOcrEndpoint: `${resolvedSupabaseUrl}/functions/v1/budget-scan-ocr`,
  revenueCat: {
    iosApiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? null,
    androidApiKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? null,
    entitlements: {
      pro: process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_PRO ?? null,
      expert: process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_EXPERT ?? null,
    },
  },
} as const;

export const supabase = createClient(resolvedSupabaseUrl, resolvedSupabaseAnonKey, {
  auth: {
    storage: {
      getItem: (key: string) => AsyncStorage.getItem(key),
      setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
      removeItem: (key: string) => AsyncStorage.removeItem(key),
    },
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export async function clearSupabaseAuthStorage(): Promise<void> {
  await Promise.allSettled([
    AsyncStorage.removeItem(resolvedSupabaseStorageKey),
    AsyncStorage.removeItem(`${resolvedSupabaseStorageKey}-user`),
    AsyncStorage.removeItem(`${resolvedSupabaseStorageKey}-code-verifier`),
  ]);
}

export function triggerLocalSupabaseSignOut(): void {
  setTimeout(() => {
    void supabase.auth.signOut({ scope: 'local' }).catch((error) => {
      console.warn('[auth] local signOut after storage clear failed:', (error as any)?.message ?? error);
    });
  }, 0);
}
