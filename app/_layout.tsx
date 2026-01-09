import 'react-native-gesture-handler';

import { Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useSupabaseAuth } from '../hooks/useSupabaseAuth';

export default function RootLayout() {
  const { session, loading } = useSupabaseAuth();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {loading ? (
        <View style={{ flex: 1, backgroundColor: '#050915', alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      ) : !session ? (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
        </Stack>
      ) : (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(app)" />
        </Stack>
      )}
    </GestureHandlerRootView>
  );
}
