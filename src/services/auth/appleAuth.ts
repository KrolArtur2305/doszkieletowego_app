import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';

import { supabase } from '../../../lib/supabase';

type AuthUserLike = {
  app_metadata?: Record<string, any> | null;
  identities?: Array<{ provider?: string | null }> | null;
};

function isExpoGo(): boolean {
  const executionEnvironment = (Constants as any).executionEnvironment;
  const appOwnership = (Constants as any).appOwnership;
  return executionEnvironment === 'storeClient' || appOwnership === 'expo';
}

export function isAppleAuthUser(user?: AuthUserLike | null): boolean {
  const provider = String(user?.app_metadata?.provider ?? '').toLowerCase();
  const providers = Array.isArray(user?.app_metadata?.providers)
    ? user?.app_metadata?.providers
    : [];
  const identities = Array.isArray(user?.identities) ? user?.identities : [];

  return (
    provider === 'apple' ||
    providers.some((item) => String(item).toLowerCase() === 'apple') ||
    identities.some((identity) => String(identity?.provider ?? '').toLowerCase() === 'apple')
  );
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

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });

  if (error) throw error;

  const user = data.user ?? (await supabase.auth.getUser()).data.user;
  if (user) {
    const givenName = credential.fullName?.givenName?.trim() ?? '';
    const familyName = credential.fullName?.familyName?.trim() ?? '';
    const email = credential.email ?? user.email ?? null;

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('onboarding_step')
      .eq('user_id', user.id)
      .maybeSingle();

    const profilePatch: Record<string, any> = {
      user_id: user.id,
      profil_wypelniony: true,
    };

    if (givenName) profilePatch.imie = givenName;
    if (familyName) profilePatch.nazwisko = familyName;
    if (email) profilePatch.email = email;
    if (existingProfile?.onboarding_step === 'profile') {
      profilePatch.onboarding_step = 'investment';
      profilePatch.onboarding_completed = false;
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(profilePatch, { onConflict: 'user_id' });

    if (profileError) {
      console.warn('Apple profile sync error:', profileError);
    }
  }

  return true;
}
