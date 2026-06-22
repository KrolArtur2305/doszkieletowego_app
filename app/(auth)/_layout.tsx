import { useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';
import { resolvePostAuthLandingPath } from '../../lib/investmentInvite';

export default function AuthLayout() {
  const { session, loading } = useSupabaseAuth();
  const router = useRouter();
  const [landingPath, setLandingPath] = useState<'/(app)' | '/(auth)/invite-join' | null>(null);

  useEffect(() => {
    let alive = true;
    setLandingPath(null);

    if (!session) {
      return;
    }

    (async () => {
      const nextPath = await resolvePostAuthLandingPath();
      if (alive) setLandingPath(nextPath);
    })();

    return () => {
      alive = false;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session || !landingPath) return;
    router.replace(landingPath);
  }, [landingPath, router, session?.user?.id]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (session && landingPath === null) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="invite-join" />
    </Stack>
  );
}
