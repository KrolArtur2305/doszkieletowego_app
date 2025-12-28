import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';

export default function AppLayout() {
  const { session, initialised } = useSupabaseAuth();
  const router = useRouter();
  const segments = useSegments();

  const [checking, setChecking] = useState(true);
  const [profileComplete, setProfileComplete] = useState(false);
  const [investmentComplete, setInvestmentComplete] = useState(false);

  const userId = session?.user?.id;
  const currentPath = useMemo(() => segments.join('/'), [segments]);

  useEffect(() => {
    if (!initialised || !userId) return;

    let isMounted = true;

    const fetchStatus = async () => {
      setChecking(true);
      try {
        const [{ data: profileData }, { data: investmentData }] = await Promise.all([
          supabase
            .from('profiles')
            .select('profil_wypelniony')
            .eq('user_id', userId)
            .limit(1)
            .maybeSingle(),
          supabase
            .from('inwestycje')
            .select('inwestycja_wypelniona')
            .eq('user_id', userId)
            .limit(1)
            .maybeSingle(),
        ]);

        if (!isMounted) return;

        setProfileComplete(Boolean(profileData?.profil_wypelniony));
        setInvestmentComplete(Boolean(investmentData?.inwestycja_wypelniona));
      } finally {
        if (isMounted) setChecking(false);
      }
    };

    fetchStatus();

    return () => {
      isMounted = false;
    };
  }, [initialised, userId, currentPath]);

  useEffect(() => {
    if (!initialised || !userId || checking) return;

    // 1) Profil
    if (!profileComplete) {
      if (currentPath !== '(app)/profil') router.replace('/(app)/profil');
      return;
    }

    // 2) Inwestycja
    if (!investmentComplete) {
      if (currentPath !== '(app)/inwestycja') router.replace('/(app)/inwestycja');
      return;
    }

    // 3) Wszystko gotowe -> dashboard w tabs
    if (currentPath === '(app)/profil' || currentPath === '(app)/inwestycja') {
      router.replace('/(app)/(tabs)/dashboard');
    }
  }, [initialised, userId, checking, profileComplete, investmentComplete, currentPath, router]);

  // jeśli user nie jest zalogowany, nie renderujemy app layoutu (auth layout przejmie)
  if (!initialised || !session) return null;

  return (
    <>
      {checking && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(5,9,21,0.75)',
            zIndex: 10,
          }}
        >
          <ActivityIndicator size="large" color="#5EEAD4" />
        </View>
      )}

      <Stack screenOptions={{ headerShown: false }}>
        {/* Tabs */}
        <Stack.Screen name="(tabs)" />

        {/* Onboarding / gating */}
        <Stack.Screen name="profil/index" />
        <Stack.Screen name="inwestycja/index" />
      </Stack>
    </>
  );
}

