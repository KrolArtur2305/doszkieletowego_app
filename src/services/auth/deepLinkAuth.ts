import * as Linking from 'expo-linking';
import { supabase } from '../../../lib/supabase';

const AUTH_CALLBACK_PATH = 'auth-callback';
const AUTH_CALLBACK_SCHEME = 'buildiq';

export type AuthCallbackType = 'recovery' | 'oauth' | 'unknown';

export function getAuthCallbackRedirectUri(): string {
  return Linking.createURL(AUTH_CALLBACK_PATH, {
    scheme: AUTH_CALLBACK_SCHEME,
  });
}

export function getAuthParamsFromUrl(url: string): URLSearchParams {
  const [beforeHash, hash = ''] = url.split('#');
  const query = beforeHash.includes('?') ? beforeHash.split('?')[1] : '';
  const params = new URLSearchParams(query);
  const hashParams = new URLSearchParams(hash);

  hashParams.forEach((value, key) => {
    params.set(key, value);
  });

  return params;
}

export function getAuthCallbackType(url: string): AuthCallbackType {
  const params = getAuthParamsFromUrl(url);
  const type = params.get('type');

  if (type === 'recovery') return 'recovery';
  if (type === 'signup' || type === 'magiclink' || params.get('provider_token') || params.get('access_token')) {
    return 'oauth';
  }

  return 'unknown';
}

export async function completeAuthSessionFromUrl(url: string): Promise<AuthCallbackType> {
  const params = getAuthParamsFromUrl(url);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const errorCode = params.get('error');
  const errorDescription = params.get('error_description');
  const callbackType = getAuthCallbackType(url);

  if (errorCode || errorDescription) {
    throw new Error(errorDescription ?? errorCode ?? 'Auth callback error');
  }

  if (!accessToken || !refreshToken) {
    throw new Error('Missing session data in auth callback');
  }

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    throw error;
  }

  return callbackType;
}
