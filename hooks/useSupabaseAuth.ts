import { useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';

import { supabase } from '../supabase';

export function useSupabaseAuth() {
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        await SecureStore.setItemAsync('sb_session', JSON.stringify(session));
        router.replace('/(app)/index');
      } else {
        await SecureStore.deleteItemAsync('sb_session');
        router.replace('/(auth)/login');
      }
    });

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);
}
