import 'react-native-gesture-handler';

import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { initI18n } from '../lib/i18n';
import { usePushNotifications } from '../hooks/usePushNotifications';
import {
  configurePurchases,
  logInPurchasesUser,
  logOutPurchasesUser,
} from '../src/services/subscription/revenuecat';


export default function RootLayout() {
  const { session, loading } = useSupabaseAuth();
  const [i18nReady, setI18nReady] = useState(false);

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

  const showLoader = loading || !i18nReady;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" translucent />

        <SafeAreaView style={{ flex: 1, backgroundColor: '#000000' }}>
          {showLoader ? (
            <View
              style={{
                flex: 1,
                backgroundColor: '#000000',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ActivityIndicator />
            </View>
          ) : !session ? (
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(auth)" />
            </Stack>
          ) : (
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(app)" />
            </Stack>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
