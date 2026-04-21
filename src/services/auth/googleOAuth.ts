import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../../../lib/supabase';
import { completeAuthSessionFromUrl, getAuthCallbackRedirectUri } from './deepLinkAuth';

WebBrowser.maybeCompleteAuthSession();

export async function signInWithGoogleMobile(): Promise<boolean> {
  const redirectTo = getAuthCallbackRedirectUri();

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

  await completeAuthSessionFromUrl(result.url);
  return true;
}
