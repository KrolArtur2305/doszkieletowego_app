import { useEffect, useState } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { supabase } from '../supabase';

export function useSupabaseAuth() {
  const [session, setSession] = useState<any | null>(null);
  const [initialised, setInitialised] = useState(false);

  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      setSession(session);
      setInitialised(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!isMounted) return;
      setSession(newSession);
    });

    return () => {
      isMounted = false;
      subscription?.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!initialised) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inAppGroup = segments[0] === '(app)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && !inAppGroup) {
      router.replace('/(app)');
    }
  }, [session, initialised, segments, router]);

  // KLUCZ: to było brakujące
  return { session, initialised };
}
