import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';

import { supabase } from '../../lib/supabase';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';

export default function AppLayout() {
  const { session, loading: authLoading } = useSupabaseAuth();
  const pathname = usePathname();
  const router = useRouter();

  const [checking, setChecking] = useState(false);
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);
  const [investmentComplete, setInvestmentComplete] = useState<boolean | null>(null);

  // 1) Pobierz status profilu/inwestycji (tylko gdy jest sesja)
  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (authLoading) return;

      if (!session?.user?.id) {
        if (!alive) return;
        setChecking(false);
        setProfileComplete(null);
        setInvestmentComplete(null);
        return;
      }

      if (!alive) return;
      setChecking(true);

      try {
        const userId = session.user.id;

        const [profileRes, invRes] = await Promise.all([
          supabase.from('profiles').select('profil_wypelniony').eq('user_id', userId).maybeSingle(),
          supabase.from('inwestycje').select('inwestycja_wypelniona').eq('user_id', userId).maybeSingle(),
        ]);

        if (!alive) return;

        setProfileComplete(Boolean(profileRes.data?.profil_wypelniony));
        setInvestmentComplete(Boolean(invRes.data?.inwestycja_wypelniona));
      } catch {
        if (!alive) return;
        // jeœli coœ nie gra / brak rekordu -> traktuj jako niewype³nione
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

  // 2) Wylicz gdzie user powinien trafiæ (profil/inwestycja). Gdy OK -> null
  const gateTarget = useMemo(() => {
    if (!session) return null; // auth layout powinien przej¹æ
    if (profileComplete === false) return '/(app)/profil';
    if (profileComplete === true && investmentComplete === false) return '/(app)/inwestycja';
    return null; // wszystko OK albo jeszcze nie wiemy
  }, [session, profileComplete, investmentComplete]);

  // 3) Routing imperatywny (bez <Redirect/> w renderze)
  useEffect(() => {
    // a) jeœli trzeba gate'owaæ na profil/inwestycjê
    if (gateTarget) {
      if (pathname !== gateTarget) router.replace(gateTarget);
      return;
    }

    // b) jeœli wszystko OK i jesteœ na /(app) -> przerzuæ do tabsów (¿eby nie by³o bia³ego ekranu)
    if (
      session &&
      profileComplete === true &&
      investmentComplete === true &&
      pathname === '/(app)'
    ) {
      router.replace('/(app)/(tabs)/dashboard')
    }
  }, [gateTarget, pathname, router, session, profileComplete, investmentComplete]);

  // 4) Overlay loader (Stack zawsze istnieje)
  const showOverlay =
    authLoading ||
    checking ||
    (session && (profileComplete === null || investmentComplete === null));

  return (
    <View style={{ flex: 1, backgroundColor: '#050915' }}>
      <Stack screenOptions={{ headerShown: false }} />

      {showOverlay ? (
        <View
          pointerEvents="auto"
          style={{
            position: 'absolute',
            inset: 0,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: '#050915',
          }}
        >
          <ActivityIndicator />
        </View>
      ) : null}
    </View>
  );
}
