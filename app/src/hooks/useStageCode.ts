import { supabase } from '../lib/supabase';

export async function refreshCurrentStageCode(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('current_stage_code')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('[StageCode] Błąd odczytu current_stage_code:', error.message);
    return null;
  }

  return data?.current_stage_code ?? null;
}

export async function forceRecalculateStageCode(userId: string): Promise<void> {
  const { error } = await supabase.rpc('recalculate_current_stage_code', {
    p_user_id: userId,
  });

  if (error) {
    console.error('[StageCode] Błąd RPC:', error.message);
  }
}