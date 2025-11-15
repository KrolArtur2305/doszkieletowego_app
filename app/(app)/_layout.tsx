import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { ViewStyle } from 'react-native';

const tabStyle: ViewStyle = {
  backgroundColor: 'rgba(4,10,22,0.85)',
  borderTopWidth: 0,
  borderRadius: 28,
  marginHorizontal: 16,
  marginBottom: 16,
  position: 'absolute',
  paddingVertical: 10,
  height: 76,
  shadowColor: '#0ff',
  shadowOpacity: 0.18,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 8,
};

export default function AppLayout() {
  return (
    <Tabs
      sceneContainerStyle={{ backgroundColor: '#050915' }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#5EEAD4',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
        tabBarStyle,
        tabBarBackground: () => (
          <BlurView intensity={80} tint="dark" style={{ flex: 1, borderRadius: 28 }} />
        ),
      }}
    >
      <Tabs.Screen
        name="dashboard/index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="budzet/index"
        options={{
          title: 'Budżet',
          tabBarIcon: ({ color, size }) => <Feather name="activity" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="postepy/index"
        options={{
          title: 'Postępy',
          tabBarIcon: ({ color, size }) => <Feather name="trending-up" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="zdjecia/index"
        options={{
          title: 'Zdjęcia',
          tabBarIcon: ({ color, size }) => <Feather name="camera" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="projekt/index"
        options={{
          title: 'Projekt',
          tabBarIcon: ({ color, size }) => <Feather name="layers" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="ustawienia/index"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
