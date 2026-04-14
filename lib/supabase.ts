import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    `Supabase ENV missing: url=${String(supabaseUrl)} key=${supabaseAnonKey ? 'set' : 'missing'}`
  );
}

export const publicConfig = {
  supabaseUrl,
  supabaseAnonKey,
  aiChatEndpoint: `${supabaseUrl}/functions/v1/ai-chat`,
  revenueCat: {
    iosApiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? null,
    androidApiKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? null,
    entitlements: {
      standard: process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_STANDARD ?? null,
      pro: process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_PRO ?? null,
    },
  },
} as const;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: {
      getItem: (key: string) => SecureStore.getItemAsync(key),
      setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
      removeItem: (key: string) => SecureStore.deleteItemAsync(key),
    },
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
