import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

const AUTH_REQUEST_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(label));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

export function useSupabaseAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    if (!isSupabaseConfigured) {
      setSession(null);
      setLoading(false);
      return () => {
        alive = false;
      };
    }

    (async () => {
      try {
        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_REQUEST_TIMEOUT_MS,
          'Auth session load timed out',
        );
        if (!alive) return;
        if (error) console.error('[auth] getSession error:', error.message);
        const nextSession = data.session ?? null;

        if (nextSession?.access_token) {
          const { data: userData, error: userError } = await withTimeout(
            supabase.auth.getUser(),
            AUTH_REQUEST_TIMEOUT_MS,
            'Auth user load timed out',
          );
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
        console.warn('[auth] auth bootstrap fallback:', e?.message ?? e);
        setSession(null);
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
