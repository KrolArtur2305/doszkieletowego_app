import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import {
  clearSupabaseAuthStorage,
  isSupabaseConfigured,
  supabase,
  triggerLocalSupabaseSignOut,
} from '../lib/supabase';

const AUTH_REQUEST_TIMEOUT_MS = 20000;

type AuthSnapshot = {
  session: Session | null;
  loading: boolean;
};

const authSnapshot: AuthSnapshot = {
  session: null,
  loading: true,
};

const authListeners = new Set<() => void>();
let bootstrapPromise: Promise<void> | null = null;
let authSubscriptionStarted = false;
let bootstrapCompleted = false;

function emitAuthChange() {
  for (const listener of authListeners) {
    listener();
  }
}

function setAuthSnapshot(next: Partial<AuthSnapshot>) {
  authSnapshot.session = next.session ?? authSnapshot.session;
  authSnapshot.loading = typeof next.loading === 'boolean' ? next.loading : authSnapshot.loading;
  emitAuthChange();
}

export function forceLoggedOutAuthSnapshot() {
  authSnapshot.session = null;
  authSnapshot.loading = false;
  bootstrapPromise = null;
  bootstrapCompleted = true;
  emitAuthChange();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(label)), timeoutMs);

    Promise.resolve(promise)
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

async function loadInitialSession(): Promise<Session | null> {
  const { data, error } = await withTimeout(
    supabase.auth.getSession(),
    AUTH_REQUEST_TIMEOUT_MS,
    'Auth session load timed out',
  );

  if (error) console.error('[auth] getSession error:', error.message);

  const nextSession = data.session ?? null;
  if (!nextSession?.access_token) return nextSession;

  const { data: userData, error: userError } = await withTimeout(
    supabase.auth.getUser(),
    AUTH_REQUEST_TIMEOUT_MS,
    'Auth user load timed out',
  );

  if (userError || !userData?.user) {
    console.warn('[auth] stale session detected, clearing local auth');
    await clearSupabaseAuthStorage();
    triggerLocalSupabaseSignOut();
    return null;
  }

  return nextSession;
}

async function ensureAuthBootstrap() {
  if (!isSupabaseConfigured) {
    setAuthSnapshot({ session: null, loading: false });
    return;
  }

  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      try {
        const nextSession = await loadInitialSession();
        setAuthSnapshot({ session: nextSession, loading: false });
      } catch (error: any) {
        const message = String(error?.message ?? error ?? '').toLowerCase();
        if (message.includes('timed out') || message.includes('stale session')) {
          await clearSupabaseAuthStorage();
          triggerLocalSupabaseSignOut();
          setAuthSnapshot({ session: null, loading: false });
          return;
        }

        console.warn('[auth] auth bootstrap fallback:', error?.message ?? error);
        setAuthSnapshot({ session: null, loading: false });
      } finally {
        bootstrapPromise = null;
        bootstrapCompleted = true;
      }
    })();
  }

  return bootstrapPromise;
}

function ensureAuthSubscription() {
  if (authSubscriptionStarted) return;
  authSubscriptionStarted = true;

  supabase.auth.onAuthStateChange((_event, newSession) => {
    if (!bootstrapCompleted) return;
    setAuthSnapshot({ session: newSession ?? null, loading: false });
  });
}

export function useSupabaseAuth() {
  const [state, setState] = useState<AuthSnapshot>(authSnapshot);

  useEffect(() => {
    let alive = true;
    authListeners.add(onStoreChange);

    function onStoreChange() {
      if (!alive) return;
      setState({ ...authSnapshot });
    }

    ensureAuthSubscription();
    void ensureAuthBootstrap();

    // Sync immediately with current snapshot so late subscribers do not flash.
    setState({ ...authSnapshot });

    return () => {
      alive = false;
      authListeners.delete(onStoreChange);
    };
  }, []);

  return state;
}
