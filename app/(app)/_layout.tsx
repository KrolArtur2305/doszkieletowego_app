import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="dashboard/index" />
      <Stack.Screen name="budzet/index" />
      <Stack.Screen name="postepy/index" />
      <Stack.Screen name="projekt/index" />
      <Stack.Screen name="ustawienia/index" />
      <Stack.Screen name="zdjecia/index" />
      <Stack.Screen name="inwestycja/index" />
    </Stack>
  );
}
