import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export function useSupabaseAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!alive) return;
        if (error) console.error('[auth] getSession error:', error.message);
        const nextSession = data.session ?? null;

        if (nextSession?.access_token) {
          const { data: userData, error: userError } = await supabase.auth.getUser();
          if (!alive) return;

          if (userError || !userData?.user) {
            console.warn('[auth] stale session detected, signing out');
            await supabase.auth.signOut();
            if (!alive) return;
            setSession(null);
            return;
          }
        }

        setSession(nextSession);
      } catch (e: any) {
        if (!alive) return;
        console.error('[auth] getSession exception:', e?.message ?? e);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!alive) return;
      setSession(newSession ?? null);
      setLoading(false);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}
