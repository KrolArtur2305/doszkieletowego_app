import { useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { supabase } from '../src/lib/supabase';

interface ProfileData {
  imie?: string | null;
}

export default function ProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const loadProfile = async () => {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        if (!user) {
          router.replace('/login');
          return;
        }

        if (!isActive) {
          return;
        }

        setUserEmail(user.email ?? null);
        setUserId(user.id);

        const { data: prof, error: profileError } = await supabase
          .from('profiles')
          .select('imie')
          .eq('user_id', user.id)
          .single<ProfileData>();

        if (profileError && profileError.code !== 'PGRST116') {
          throw profileError;
        }

        if (!isActive) {
          return;
        }

        const fallbackName = user.email ? user.email.split('@')[0] : '';
        setDisplayName(prof?.imie ?? fallbackName);
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Wystąpił nieoczekiwany błąd');
        }
        router.replace('/login');
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      isActive = false;
    };
  }, [router]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Profil' }} />
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Profil' }} />
      <Text style={styles.heading}>Witaj, {displayName}</Text>
      <View style={styles.infoRow}>
        <Text style={styles.label}>Twój email:</Text>
        <Text style={styles.value}>{userEmail}</Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.label}>Twój user_id:</Text>
        <Text style={styles.value}>{userId}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  heading: {
    fontSize: 26,
    fontWeight: '600',
    marginBottom: 32,
    textAlign: 'center',
  },
  infoRow: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    color: '#374151',
    marginBottom: 4,
  },
  value: {
    fontSize: 18,
    fontWeight: '500',
  },
  error: {
    color: '#c1121f',
    fontSize: 16,
    textAlign: 'center',
  },
});
