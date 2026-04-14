import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import {
  completeGoogleOAuthFromUrl,
} from '../src/services/auth/googleOAuth';

export default function AuthCallbackScreen() {
  const handledRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handle(url: string | null) {
      if (!url || handledRef.current) return;
      handledRef.current = true;

      try {
        const completed = await completeGoogleOAuthFromUrl(url);
        if (!completed) {
          throw new Error('Brak danych sesji w callbacku Google OAuth');
        }

        router.replace('/(app)');
      } catch (nextError: any) {
        setError(nextError?.message ?? 'Nie udało się dokończyć logowania Google');
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

      setError('Brak danych callbacku Google OAuth');
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
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator />
      <Text style={styles.text}>
        {error ?? 'Kończę logowanie Google...'}
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
