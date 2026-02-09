import React from 'react';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import '../../../lib/i18n';
import { useTranslation } from 'react-i18next';

export default function TabsLayout() {
  const { t } = useTranslation('navigation');
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: 'transparent' },

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
      {/* START */}
      <Tabs.Screen
        name="dashboard/index"
        options={{
          title: t('tabs.start'),
          tabBarIcon: ({ color, size }) => (
            <Feather name="home" color={color} size={size ?? 20} />
          ),
        }}
      />

      {/* BUDŻET */}
      <Tabs.Screen
        name="budzet/index"
        options={{
          title: t('tabs.budget'),
          tabBarIcon: ({ color, size }) => (
            <Feather name="pie-chart" color={color} size={size ?? 20} />
          ),
        }}
      />

      {/* DOKUMENTY */}
      <Tabs.Screen
        name="dokumenty/index"
        options={{
          title: t('tabs.documents'),
          tabBarIcon: ({ color, size }) => (
            <Feather name="file-text" color={color} size={size ?? 20} />
          ),
        }}
      />

      {/* ZDJĘCIA */}
      <Tabs.Screen
        name="zdjecia/index"
        options={{
          title: t('tabs.photos'),
          sceneStyle: { backgroundColor: 'transparent' },
          tabBarIcon: ({ color, size }) => (
            <Feather name="camera" color={color} size={size ?? 20} />
          ),
        }}
      />

      {/* PROJEKT */}
      <Tabs.Screen
        name="projekt/index"
        options={{
          title: t('tabs.project'),
          tabBarIcon: ({ color, size }) => (
            <Feather name="layers" color={color} size={size ?? 20} />
          ),
        }}
      />

      {/* PROFIL (kieruje do tego samego co ustawienia) */}
      <Tabs.Screen
        name="ustawienia"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, size }) => (
            <Feather name="user" color={color} size={size ?? 20} />
          ),
        }}
      />

      {/* 🔒 UKRYJ POSTĘPY (ważne: ukryj konkretne routy, nie tylko folder) */}
      <Tabs.Screen name="postepy/index" options={{ href: null }} />
      <Tabs.Screen name="postepy/wszystkie" options={{ href: null }} />
    </Tabs>
  );
}
