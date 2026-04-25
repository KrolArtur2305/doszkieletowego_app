import type { ImageSourcePropType } from 'react-native';
import { supabase } from '../../../lib/supabase';

export type BuddyAvatarId = 'avatar1' | 'avatar2' | 'avatar3';

export const DEFAULT_BUDDY_AVATAR_ID: BuddyAvatarId = 'avatar1';

export const BUDDY_AVATAR_OPTIONS: Array<{ id: BuddyAvatarId; source: ImageSourcePropType }> = [
  { id: 'avatar1', source: require('../../../app/assets/buddy_avatar.png') },
  { id: 'avatar2', source: require('../../../app/assets/buddy_avatar2.png') },
  { id: 'avatar3', source: require('../../../app/assets/buddy_avatar3.png') },
];

function isBuddyAvatarId(value: string | null | undefined): value is BuddyAvatarId {
  return value === 'avatar1' || value === 'avatar2' || value === 'avatar3';
}

export function getBuddyAvatarSource(avatarId?: string | null) {
  const normalizedId = isBuddyAvatarId(avatarId) ? avatarId : DEFAULT_BUDDY_AVATAR_ID;
  return BUDDY_AVATAR_OPTIONS.find((option) => option.id === normalizedId)?.source ?? BUDDY_AVATAR_OPTIONS[0].source;
}

export async function loadBuddyAvatarId(userId?: string | null): Promise<BuddyAvatarId> {
  if (!userId) return DEFAULT_BUDDY_AVATAR_ID;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('ai_buddy_avatar')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) return DEFAULT_BUDDY_AVATAR_ID;
    return isBuddyAvatarId(data?.ai_buddy_avatar) ? data.ai_buddy_avatar : DEFAULT_BUDDY_AVATAR_ID;
  } catch {
    return DEFAULT_BUDDY_AVATAR_ID;
  }
}

export async function saveBuddyAvatarId(userId: string, avatarId: BuddyAvatarId) {
  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        user_id: userId,
        ai_buddy_avatar: avatarId,
      },
      { onConflict: 'user_id' }
    );

  if (error) throw error;
}
