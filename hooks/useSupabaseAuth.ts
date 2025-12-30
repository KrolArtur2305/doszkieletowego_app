import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export function useSupabaseAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    // bezpiecznik: nie pozwól wisieć w nieskończoność
    const timer = setTimeout(() => {
      if (alive) setLoading(false);
    }, 2000);

    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!alive) return;
        if (error) console.log('[auth] getSession error:', error.message);
        setSession(data.session ?? null);
      } catch (e: any) {
        if (!alive) return;
        console.log('[auth] getSession exception:', e?.message ?? e);
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
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}
