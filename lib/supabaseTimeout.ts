import type { Session, User } from '@supabase/supabase-js';

import { supabase } from './supabase';

const DEFAULT_TIMEOUT_MS = 20000;

export function withTimeout<T>(promise: PromiseLike<T>, timeoutMs = DEFAULT_TIMEOUT_MS, label = 'Supabase request timed out'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(label));
    }, timeoutMs);

    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

export async function getSessionWithTimeout(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Session | null> {
  const { data, error } = await withTimeout(
    supabase.auth.getSession(),
    timeoutMs,
    'Auth session load timed out',
  );

  if (error) throw error;
  return data.session ?? null;
}

export async function getUserWithTimeout(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<User | null> {
  const { data, error } = await withTimeout(
    supabase.auth.getUser(),
    timeoutMs,
    'Auth user load timed out',
  );

  if (error) throw error;
  return data.user ?? null;
}
