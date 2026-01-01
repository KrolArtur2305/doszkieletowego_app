import { useEffect, useMemo, useRef, useState } from 'react';
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

  // chroni przed spamowaniem fetchy przy drobnych zmianach
  const lastCheckKeyRef = useRef<string>('');

  // 1) Pobierz status profilu/inwestycji:
  //    - gdy jest sesja
  //    - gdy zmieni się pathname (np. po zapisie i router.replace)
  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (authLoading) return;

      const userId = session?.user?.id;
      if (!userId) {
        if (!alive) return;
        setChecking(false);
        setProfileComplete(null);
        setInvestmentComplete(null);
        return;
      }

      // ✅ klucz: user + pathname (żeby po zapisie odświeżało)
      const checkKey = `${userId}::${pathname}`;
      if (lastCheckKeyRef.current === checkKey) return;
      lastCheckKeyRef.current = checkKey;

      if (!alive) return;
      setChecking(true);

      try {
        const [profileRes, invRes] = await Promise.all([
          supabase.from('profiles').select('profil_wypelniony').eq('user_id', userId).maybeSingle(),
          supabase.from('inwestycje').select('inwestycja_wypelniona').eq('user_id', userId).maybeSingle(),
        ]);

        if (!alive) return;

        setProfileComplete(Boolean(profileRes.data?.profil_wypelniony));
        setInvestmentComplete(Boolean(invRes.data?.inwestycja_wypelniona));
      } catch {
        if (!alive) return;
        // jeśli coś nie gra -> traktuj jako niewypełnione
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
  }, [authLoading, session?.user?.id, pathname]);

  // 2) Wylicz gdzie user powinien trafić (profil/inwestycja). Gdy OK -> null
  const gateTarget = useMemo(() => {
    if (!session) return null;
    if (profileComplete === false) return '/(app)/profil';
    if (profileComplete === true && investmentComplete === false) return '/(app)/inwestycja';
    return null;
  }, [session, profileComplete, investmentComplete]);

  // 3) Routing imperatywny (bez <Redirect/> w renderze)
  useEffect(() => {
    // a) jeśli trzeba gate'ować na profil/inwestycję
    if (gateTarget) {
      if (pathname !== gateTarget) router.replace(gateTarget);
      return;
    }

    // b) jeśli wszystko OK i jesteś na /(app) -> przerzuć do tabsów
    if (
      session &&
      profileComplete === true &&
      investmentComplete === true &&
      pathname === '/(app)'
    ) {
      router.replace('/(app)/(tabs)/dashboard');
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
