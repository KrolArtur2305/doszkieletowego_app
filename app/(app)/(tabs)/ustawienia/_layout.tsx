import { Stack } from 'expo-router';

export default function UstawieniaLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' }, // ✅ ważne
      }}
    />
  );
}
