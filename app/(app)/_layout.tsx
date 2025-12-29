import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';

import { supabase } from '../../lib/supabase';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';

export default function AppLayout() {
  const { session, initialised } = useSupabaseAuth();
  const router = useRouter();
  const segments = useSegments();

  const [checking, setChecking] = useState(true);
  const [profileComplete, setProfileComplete] = useState(false);
  const [investmentComplete, setInvestmentComplete] = useState(false);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (!initialised) return;

      try {
        if (!session?.user?.id) {
          if (alive) {
            setProfileComplete(false);
            setInvestmentComplete(false);
          }
          return;
        }

        const userId = session.user.id;

        const [profileRes, invRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('profil_wypelniony')
            .eq('user_id', userId)
            .maybeSingle(),
          supabase
            .from('inwestycje')
            .select('inwestycja_wypelniona')
            .eq('user_id', userId)
            .maybeSingle(),
        ]);

        if (!alive) return;

        setProfileComplete(Boolean(profileRes.data?.profil_wypelniony));
        setInvestmentComplete(Boolean(invRes.data?.inwestycja_wypelniona));
      } finally {
        if (alive) setChecking(false);
      }
    };

    run();

    return () => {
      alive = false;
    };
  }, [initialised, session?.user?.id]);

  useEffect(() => {
    if (!initialised) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inAppGroup = segments[0] === '(app)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
      return;
    }

    if (session && !inAppGroup) {
      router.replace('/(app)');
      return;
    }

    // opcjonalny flow: profil -> inwestycja -> tabs
    if (session) {
      if (!profileComplete) {
        router.replace('/(app)/profil');
        return;
      }
      if (!investmentComplete) {
        router.replace('/(app)/inwestycja');
        return;
      }
    }
  }, [initialised, session, segments, router, profileComplete, investmentComplete]);

  if (!initialised || checking) {
    return (
      <View style={{ flex: 1, backgroundColor: '#050915', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}






