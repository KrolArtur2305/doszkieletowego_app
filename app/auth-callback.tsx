import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { getFriendlyErrorMessage } from '../lib/errorMessages';
import { resolvePostAuthLandingPath } from '../lib/investmentInvite';
import { completeAuthSessionFromUrl, getAuthCallbackType } from '../src/services/auth/deepLinkAuth';

export default function AuthCallbackScreen() {
  const { t } = useTranslation('auth');
  const handledRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];

    async function handle(url: string | null) {
      if (!alive || !url || handledRef.current) return;
      handledRef.current = true;

      try {
        const callbackType = getAuthCallbackType(url);
        const completedType = await completeAuthSessionFromUrl(url);

        if (completedType === 'recovery' || callbackType === 'recovery') {
          router.replace('/reset-password');
          return;
        }

        const landingPath = await resolvePostAuthLandingPath();
        if (!alive) return;
        router.replace(landingPath);
      } catch (nextError: any) {
        if (!alive) return;
        const callbackType = url ? getAuthCallbackType(url) : 'unknown';
        const fallbackMessage =
          callbackType === 'recovery'
            ? t('callback.errors.recoveryFailed')
            : t('callback.errors.completeFailed');

        setError(getFriendlyErrorMessage(nextError, t, fallbackMessage));
        const timer = setTimeout(() => {
          if (!alive) return;
          router.replace(
            callbackType === 'recovery'
              ? '/reset-password?status=invalid'
              : '/(auth)/login'
          );
        }, 1200);
        timers.push(timer);
      }
    }

    Linking.getInitialURL()
      .then((initialUrl) => {
        if (initialUrl) {
          handle(initialUrl);
          return;
        }

        if (!alive) return;
        setError(t('callback.errors.noCallbackData'));
        const timer = setTimeout(() => {
          if (!alive) return;
          router.replace('/(auth)/login');
        }, 1200);
        timers.push(timer);
      })
      .catch(() => {
        if (!alive) return;
        setError(t('callback.errors.noCallbackData'));
        const timer = setTimeout(() => {
          if (!alive) return;
          router.replace('/(auth)/login');
        }, 1200);
        timers.push(timer);
      });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handle(url);
    });

    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      subscription.remove();
    };
  }, [t]);

  return (
    <View style={styles.container}>
      <ActivityIndicator />
      <Text style={styles.text}>
        {error ?? t('callback.loading')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#050915',
    paddingHorizontal: 24,
  },
  text: {
    marginTop: 12,
    color: '#FFFFFF',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
  },
});
