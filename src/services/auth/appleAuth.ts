import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';

import { supabase } from '../../../lib/supabase';

function isExpoGo(): boolean {
  const executionEnvironment = (Constants as any).executionEnvironment;
  const appOwnership = (Constants as any).appOwnership;
  return executionEnvironment === 'storeClient' || appOwnership === 'expo';
}

export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  if (isExpoGo()) return false;
  return AppleAuthentication.isAvailableAsync();
}

export async function signInWithAppleMobile(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  if (isExpoGo()) return false;

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error('Missing Apple identity token');
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });

  if (error) throw error;
  return true;
}
