import { Stack, Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';

export default function RootLayout() {
  const { session, loading } = useSupabaseAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#050915', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  // Jeśli nie ma sesji, wpuszczamy tylko (auth)
  if (!session) {
    return (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
      </Stack>
    );
  }

  // Jeśli jest sesja, wpuszczamy (app)
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(app)" />
    </Stack>
  );
}
