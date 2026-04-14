import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../../../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CALLBACK_PATH = 'auth-callback';
const GOOGLE_CALLBACK_SCHEME = 'buildiq';

export function getGoogleOAuthRedirectUri(): string {
  return Linking.createURL(GOOGLE_CALLBACK_PATH, {
    scheme: GOOGLE_CALLBACK_SCHEME,
  });
}

function getParamsFromUrl(url: string): URLSearchParams {
  const [beforeHash, hash = ''] = url.split('#');
  const query = beforeHash.includes('?') ? beforeHash.split('?')[1] : '';
  const params = new URLSearchParams(query);
  const hashParams = new URLSearchParams(hash);

  hashParams.forEach((value, key) => {
    params.set(key, value);
  });

  return params;
}

export async function completeGoogleOAuthFromUrl(url: string): Promise<boolean> {
  const params = getParamsFromUrl(url);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const errorCode = params.get('error');
  const errorDescription = params.get('error_description');

  if (errorCode || errorDescription) {
    throw new Error(errorDescription ?? errorCode ?? 'OAuth callback error');
  }

  if (!accessToken || !refreshToken) {
    return false;
  }

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    throw error;
  }

  return true;
}

export async function signInWithGoogleMobile(): Promise<boolean> {
  const redirectTo = getGoogleOAuthRedirectUri();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    throw error;
  }

  if (!data?.url) {
    throw new Error('Missing Google OAuth URL');
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type !== 'success' || !result.url) {
    return false;
  }

  return completeGoogleOAuthFromUrl(result.url);
}
