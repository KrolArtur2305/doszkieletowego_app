import 'react-native-gesture-handler';

import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { Image, Text, View } from 'react-native';
import { useFonts, Rubik_700Bold, Rubik_800ExtraBold } from '@expo-google-fonts/rubik';
import { Syne_800ExtraBold } from '@expo-google-fonts/syne';
import { useTranslation } from 'react-i18next';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { initI18n } from '../lib/i18n';
import { isSupabaseConfigured, supabaseConfigError } from '../lib/supabase';
import { usePushNotifications } from '../hooks/usePushNotifications';
import {
  configurePurchases,
  logInPurchasesUser,
  logOutPurchasesUser,
} from '../src/services/subscription/revenuecat';

const APP_LOGO = require('../assets/logo.png');

export default function RootLayout() {
  const { session, loading } = useSupabaseAuth();
  const [i18nReady, setI18nReady] = useState(false);
  const [fontsLoaded] = useFonts({ Rubik_700Bold, Rubik_800ExtraBold, Syne_800ExtraBold });
  const { t } = useTranslation('common');

  usePushNotifications();

  useEffect(() => {
    let mounted = true;

    initI18n()
      .catch(() => {
        // nawet jeśli coś pójdzie nie tak, nie blokujemy apki w nieskończoność
      })
      .finally(() => {
        if (mounted) setI18nReady(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    configurePurchases().catch(() => {
      // RevenueCat is optional during local setup; do not block app boot.
    });
  }, []);

  useEffect(() => {
    const appUserId = session?.user?.id;

    if (!appUserId) {
      logOutPurchasesUser().catch(() => {
        // Keep auth flow resilient if RevenueCat is unavailable in this environment.
      });
      return;
    }

    logInPurchasesUser(appUserId).catch(() => {
      // Keep auth flow resilient if RevenueCat is unavailable in this environment.
    });
  }, [session?.user?.id]);

  const showLoader = loading || !i18nReady || !fontsLoaded;
  const configErrorScreen = !isSupabaseConfigured ? (
    <View
      style={{
        flex: 1,
        backgroundColor: '#000000',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '700', marginBottom: 10, textAlign: 'center' }}>
        {t('configErrorTitle')}
      </Text>
      <Text style={{ color: '#b8c0cc', fontSize: 14, lineHeight: 20, textAlign: 'center' }}>
        {supabaseConfigError ?? t('supabaseConfigMissing')}
      </Text>
    </View>
  ) : null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" translucent />

        <SafeAreaView style={{ flex: 1, backgroundColor: '#000000' }}>
          {configErrorScreen ?? (showLoader ? (
            <View
              style={{
                flex: 1,
                backgroundColor: '#000000',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 40,
              }}
            >
              <Image
                source={APP_LOGO}
                resizeMode="contain"
                style={{ width: '72%', maxWidth: 260, height: 120 }}
              />
            </View>
          ) : (
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(app)" />
              <Stack.Screen name="auth/callback" />
              <Stack.Screen name="auth-callback" />
              <Stack.Screen name="reset-password" />
            </Stack>
          ))}
        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
