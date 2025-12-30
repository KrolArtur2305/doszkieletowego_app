import { Stack, Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';

export default function AuthLayout() {
  const { session, loading } = useSupabaseAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#050915', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (session) return <Redirect href="/(app)" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
    </Stack>
  );
}
