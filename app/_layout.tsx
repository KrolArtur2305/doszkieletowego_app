import { Stack } from 'expo-router';

import { useSupabaseAuth } from '../hooks/useSupabaseAuth';

export default function RootLayout() {
  useSupabaseAuth();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)/login" />
      <Stack.Screen name="(app)/index" />
      <Stack.Screen name="(app)/zdjecia/index" />
    </Stack>
  );
}
