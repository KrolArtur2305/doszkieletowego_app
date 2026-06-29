import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export const PENDING_INVITE_CODE_KEY = 'pending_build_invite_code';
let pendingInviteCodeCache: string | null = null;

export async function getPendingInviteCode(): Promise<string | null> {
  if (pendingInviteCodeCache) return pendingInviteCodeCache;
  const raw = await AsyncStorage.getItem(PENDING_INVITE_CODE_KEY);
  const code = String(raw ?? '').trim().replace(/\s+/g, '').toUpperCase();
  pendingInviteCodeCache = code || null;
  return code || null;
}

export async function clearPendingInviteCode(): Promise<void> {
  pendingInviteCodeCache = null;
  await AsyncStorage.removeItem(PENDING_INVITE_CODE_KEY);
}

export async function setPendingInviteCode(code: string): Promise<void> {
  const cleaned = String(code ?? '').trim().replace(/\s+/g, '').toUpperCase();
  pendingInviteCodeCache = cleaned || null;
  if (cleaned) {
    await AsyncStorage.setItem(PENDING_INVITE_CODE_KEY, cleaned);
  } else {
    await AsyncStorage.removeItem(PENDING_INVITE_CODE_KEY);
  }
}

export async function resolvePostAuthLandingPath(): Promise<'/(app)' | '/(auth)/invite-join'> {
  try {
    const code = await getPendingInviteCode();
    return code ? '/(auth)/invite-join' : '/(app)';
  } catch (error) {
    console.warn('[Invite] failed to resolve post-auth landing path:', error);
    return '/(app)';
  }
}

function isNonRetryableInviteError(error: any): boolean {
  const message = String(error?.message ?? '').toLowerCase();
  return [
    'invalid_or_expired_invite',
    'not_investment_owner',
    'expert_plan_required',
  ].some((token) => message.includes(token));
}

export async function acceptPendingInvestmentInvite(): Promise<boolean> {
  const code = await getPendingInviteCode();
  if (!code) return false;

  const { error } = await supabase.rpc('accept_investment_invite', {
    p_invite_code: code,
  });

  if (error) {
    if (isNonRetryableInviteError(error)) {
      await clearPendingInviteCode();
    }
    throw error;
  }

  await clearPendingInviteCode();
  return true;
}

export async function convertBuildOwnerToPartner(inviteCode: string): Promise<void> {
  const code = String(inviteCode ?? '').trim().replace(/\s+/g, '').toUpperCase();
  if (!code) {
    throw new Error('invalid_or_expired_invite');
  }

  const { error, data } = await supabase.functions.invoke('convert-to-partner', {
    body: { inviteCode: code },
  });

  if (error) {
    throw error;
  }

  if ((data as any)?.error) {
    throw new Error(String((data as any).error));
  }

  if ((data as any)?.cleanup_incomplete) {
    const warnings = Array.isArray((data as any)?.warnings)
      ? (data as any).warnings.filter(Boolean).join('; ')
      : '';
    throw new Error(warnings ? `partner_conversion_cleanup_incomplete: ${warnings}` : 'partner_conversion_cleanup_incomplete');
  }
}

export async function leavePartnerRole(): Promise<void> {
  const { error, data } = await supabase.functions.invoke('leave-partner', {
    body: {},
  });

  if (error) {
    throw error;
  }

  if ((data as any)?.error) {
    throw new Error(String((data as any).error));
  }
}

export async function removePartnerMember(memberId: string): Promise<void> {
  const id = String(memberId ?? '').trim();
  if (!id) {
    throw new Error('partner_not_found');
  }

  const { error, data } = await supabase.functions.invoke('remove-partner', {
    body: { memberId: id },
  });

  if (error) {
    throw error;
  }

  if ((data as any)?.error) {
    throw new Error(String((data as any).error));
  }
}
