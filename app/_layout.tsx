import 'react-native-gesture-handler';

import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { Image, Platform, Text, useColorScheme, View } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { useFonts, Rubik_700Bold, Rubik_800ExtraBold } from '@expo-google-fonts/rubik';
import { Syne_800ExtraBold } from '@expo-google-fonts/syne';
import { useTranslation } from 'react-i18next';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { initI18n } from '../lib/i18n';
import { isSupabaseConfigured, supabaseConfigError } from '../lib/supabase';
import {
  clearRuntimeDiagnostics,
  installRuntimeDiagnostics,
  readRuntimeDiagnostics,
  recordCheckpoint,
  type RuntimeDiagnosticSnapshot,
} from '../lib/runtimeDiagnostics';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { RuntimeCrashReport } from '../components/RuntimeCrashReport';
import { PushLifecycleModal } from '../components/PushLifecycleModal';
import { AppErrorBoundary } from '../components/AppErrorBoundary';
import {
  clearErrorReportingUser,
  initErrorReporting,
  reportError,
  setErrorReportingUser,
} from '../lib/errorReporting';
import { fetchCurrentBuildAccess } from '../lib/buildAccess';
import { logInPurchasesUser } from '../src/services/subscription/revenuecat';

const APP_LOGO = require('../assets/logo.png');

export default function RootLayout() {
  const { session, loading } = useSupabaseAuth();
  const [i18nReady, setI18nReady] = useState(false);
  const [diagnosticsReady, setDiagnosticsReady] = useState(false);
  const [crashSnapshot, setCrashSnapshot] = useState<RuntimeDiagnosticSnapshot | null>(null);
  const [fontsLoaded] = useFonts({ Rubik_700Bold, Rubik_800ExtraBold, Syne_800ExtraBold });
  const colorScheme = useColorScheme();
  const { t } = useTranslation('common');
  const androidSystemBarBg = colorScheme === 'light' ? '#FFFFFF' : '#000000';

  const {
    lifecycleModal,
    dismissLifecycleModal,
    confirmLifecycleModal,
  } = usePushNotifications();

  useEffect(() => {
    installRuntimeDiagnostics();
    initErrorReporting();
    void recordCheckpoint('root-layout');
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    NavigationBar.setStyle(colorScheme === 'light' ? 'light' : 'dark');
    void NavigationBar.setButtonStyleAsync(colorScheme === 'light' ? 'dark' : 'light').catch(() => {
      // Navigation bar styling is best-effort and must not affect app startup.
    });
  }, [colorScheme]);

  useEffect(() => {
    let mounted = true;

    initI18n()
      .catch((error) => {
        void reportError(error, { feature: 'boot', action: 'init_i18n' });
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
    let mounted = true;

    readRuntimeDiagnostics()
      .then((snapshot) => {
        if (!mounted) return;
        setCrashSnapshot(snapshot?.lastError ? snapshot : null);
      })
      .finally(() => {
        if (mounted) setDiagnosticsReady(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const userId = session?.user?.id ?? null;

    if (!userId) {
      clearErrorReportingUser();
      return;
    }

    let alive = true;

    fetchCurrentBuildAccess(userId)
      .then((access) => {
        if (!alive) return;
        setErrorReportingUser(userId, access?.investmentId ?? null);
      })
      .catch((error) => {
        setErrorReportingUser(userId, null);
        void reportError(error, { feature: 'boot', action: 'load_error_reporting_context' });
      });

    return () => {
      alive = false;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    const appUserId = session?.user?.id;

    if (!appUserId) return;

    logInPurchasesUser(appUserId).catch(() => {
      // Keep auth flow resilient if RevenueCat is unavailable in this environment.
    });
  }, [session?.user?.id]);

  const showLoader = loading || !i18nReady || !fontsLoaded;
  const showCrashReport = diagnosticsReady && !!crashSnapshot?.lastError;
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

        <SafeAreaView style={{ flex: 1, backgroundColor: Platform.OS === 'android' ? androidSystemBarBg : '#000000' }}>
          <AppErrorBoundary>
            {configErrorScreen ?? (showCrashReport ? (
              <RuntimeCrashReport
                title="Aplikacja się wyłączyła"
                subtitle="Zapisaliśmy ostatni błąd. Skopiuj go i podeślij, wtedy będziemy wiedzieć dokładnie, co padło."
                snapshot={crashSnapshot}
                onDismiss={async () => {
                  await clearRuntimeDiagnostics();
                  setCrashSnapshot(null);
                }}
              />
            ) : showLoader ? (
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
          </AppErrorBoundary>
          <PushLifecycleModal
            state={lifecycleModal}
            onDismiss={dismissLifecycleModal}
            onConfirm={confirmLifecycleModal}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
