import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { completeGoogleOAuthFromUrl } from '../src/services/auth/googleOAuth';

export default function AuthCallbackScreen() {
  const { t } = useTranslation('auth');
  const handledRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handle(url: string | null) {
      if (!url || handledRef.current) return;
      handledRef.current = true;

      try {
        const completed = await completeGoogleOAuthFromUrl(url);
        if (!completed) {
          throw new Error(t('callback.errors.noSessionData'));
        }

        router.replace('/(app)');
      } catch (nextError: any) {
        setError(nextError?.message ?? t('callback.errors.completeFailed'));
        setTimeout(() => {
          router.replace('/(auth)/login');
        }, 1200);
      }
    }

    Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl) {
        handle(initialUrl);
        return;
      }

      setError(t('callback.errors.noCallbackData'));
      setTimeout(() => {
        router.replace('/(auth)/login');
      }, 1200);
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handle(url);
    });

    return () => {
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
