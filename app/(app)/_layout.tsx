import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, Redirect, usePathname } from 'expo-router';

import { supabase } from '../../lib/supabase';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';

export default function AppLayout() {
  const { session, loading: authLoading } = useSupabaseAuth();
  const pathname = usePathname();

  const [checking, setChecking] = useState(false);
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);
  const [investmentComplete, setInvestmentComplete] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (authLoading || !session?.user?.id) {
        if (alive) {
          setChecking(false);
          setProfileComplete(null);
          setInvestmentComplete(null);
        }
        return;
      }

      setChecking(true);

      try {
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

        setProfileComplete(!!profileRes.data?.profil_wypelniony);
        setInvestmentComplete(!!invRes.data?.inwestycja_wypelniona);
      } catch {
        if (!alive) return;
        setProfileComplete(false);
        setInvestmentComplete(false);
      } finally {
        if (alive) setChecking(false);
      }
    };

    run();

    return () => {
      alive = false;
    };
  }, [authLoading, session?.user?.id]);

  if (authLoading || checking) {
    return (
      <View style={{ flex: 1, backgroundColor: '#050915', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: '#050915', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  // ✅ KLUCZ: nie redirectuj na tę samą trasę
  if (profileComplete === false && pathname !== '/(app)/profil') {
    return <Redirect href="/(app)/profil" />;
  }

  if (profileComplete !== false && investmentComplete === false && pathname !== '/(app)/inwestycja') {
    return <Redirect href="/(app)/inwestycja" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
