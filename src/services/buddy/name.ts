import { supabase } from '../../../lib/supabase';

export async function loadSharedBuddyName(viewerUserId?: string | null, ownerUserId?: string | null): Promise<string> {
  const normalizedViewerId = String(viewerUserId ?? '').trim();
  if (!normalizedViewerId) return '';

  const scopeUserId = String(ownerUserId ?? '').trim() || normalizedViewerId;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('ai_buddy_name')
      .eq('user_id', scopeUserId)
      .maybeSingle();

    if (error) return '';
    return String(data?.ai_buddy_name ?? '').trim();
  } catch {
    return '';
  }
}
