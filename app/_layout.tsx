import { Stack } from "expo-router";
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';

export default function RootLayout() {
  useSupabaseAuth();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}