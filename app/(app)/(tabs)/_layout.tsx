import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(7, 12, 24, 0.92)',
          borderTopColor: 'rgba(255,255,255,0.08)',
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 10,
          paddingTop: 10,
        },
        tabBarActiveTintColor: '#5EEAD4',
        tabBarInactiveTintColor: 'rgba(148,163,184,0.70)',
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Start',
          tabBarIcon: ({ color, size }) => <Feather name="home" color={color} size={size ?? 20} />,
        }}
      />
      <Tabs.Screen
        name="budzet"
        options={{
          title: 'BudĹĽet',
          tabBarIcon: ({ color, size }) => <Feather name="pie-chart" color={color} size={size ?? 20} />,
        }}
      />
      <Tabs.Screen
        name="postepy"
        options={{
          title: 'PostÄ™py',
          tabBarIcon: ({ color, size }) => <Feather name="trending-up" color={color} size={size ?? 20} />,
        }}
      />
      <Tabs.Screen
        name="zdjecia"
        options={{
          title: 'ZdjÄ™cia',
          tabBarIcon: ({ color, size }) => <Feather name="camera" color={color} size={size ?? 20} />,
        }}
      />
      <Tabs.Screen
        name="projekt"
        options={{
          title: 'Projekt',
          tabBarIcon: ({ color, size }) => <Feather name="layers" color={color} size={size ?? 20} />,
        }}
      />
      <Tabs.Screen
        name="ustawienia"
        options={{
          title: 'Ustawienia',
          tabBarIcon: ({ color, size }) => <Feather name="settings" color={color} size={size ?? 20} />,
        }}
      />
    </Tabs>
  );
}





