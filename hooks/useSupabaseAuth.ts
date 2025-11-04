import { useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../supabase';
import { router } from 'expo-router';

export function useSupabaseAuth() {
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        await SecureStore.setItemAsync('sb_session', JSON.stringify(session));
        router.replace('/(app)');
      } else {
        await SecureStore.deleteItemAsync('sb_session');
        router.replace('/(auth)/login');
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);
}
