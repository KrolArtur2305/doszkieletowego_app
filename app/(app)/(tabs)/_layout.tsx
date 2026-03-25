import React from 'react';
import { Image, TouchableOpacity, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

const NEON = '#25F0C8';
const BUDDY_AVATAR = require('../../../assets/buddy_avatar.png');

export default function TabsLayout() {
  const { t } = useTranslation('navigation');
  const router = useRouter();

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

      {/* KIEROWNIK AI — środkowy, większy */}
      <Tabs.Screen
        name="buddy/index"
        options={{
          title: t('tabs.buddy', { defaultValue: 'Kierownik' }),
          tabBarIcon: ({ focused }) => (
            <View style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              borderWidth: 2,
              borderColor: focused ? NEON : 'rgba(37,240,200,0.35)',
              overflow: 'hidden',
              marginBottom: 2,
              shadowColor: NEON,
              shadowOpacity: focused ? 0.55 : 0.20,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 0 },
            }}>
              <Image
                source={BUDDY_AVATAR}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            </View>
          ),
          tabBarLabelStyle: { fontSize: 12, fontWeight: '700', color: NEON },
          tabBarStyle: {
            backgroundColor: 'rgba(7, 12, 24, 0.92)',
            borderTopColor: 'rgba(255,255,255,0.08)',
            borderTopWidth: 1,
            height: 72,
            paddingBottom: 10,
            paddingTop: 4,
          },
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

      {/* WIĘCEJ */}
      <Tabs.Screen
        name="wiecej"
        options={{
          title: t('tabs.more', { defaultValue: 'Więcej' }),
          tabBarIcon: ({ color, size }) => (
            <Feather name="grid" color={color} size={size ?? 20} />
          ),
        }}
      />

      {/* 🔒 UKRYTE */}
      <Tabs.Screen name="postepy/index" options={{ href: null }} />
      <Tabs.Screen name="postepy/wszystkie" options={{ href: null }} />
      <Tabs.Screen name="dokumenty/index" options={{ href: null }} />
      <Tabs.Screen name="zdjecia/index" options={{ href: null }} />
      <Tabs.Screen name="ustawienia" options={{ href: null }} />
    </Tabs>
  );
}