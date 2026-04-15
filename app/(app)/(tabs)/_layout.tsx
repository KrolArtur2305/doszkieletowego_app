import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, typography } from '../../../src/ui/theme';

const BUDDY_AVATAR = require('../../../assets/buddy_avatar.png');

export default function TabsLayout() {
  const { t } = useTranslation('navigation');
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: 'transparent' },
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.accentBright,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      <Tabs.Screen
        name="dashboard/index"
        options={{
          title: t('tabs.start'),
          tabBarIcon: ({ color, size }) => (
            <Feather name="home" color={color} size={size ?? 20} />
          ),
        }}
      />

      <Tabs.Screen
        name="budzet/index"
        options={{
          title: t('tabs.budget'),
          tabBarIcon: ({ color, size }) => (
            <Feather name="pie-chart" color={color} size={size ?? 20} />
          ),
        }}
      />

      <Tabs.Screen
        name="buddy/index"
        options={{
          title: t('tabs.buddy', { defaultValue: 'Kierownik' }),
          tabBarIcon: ({ focused }) => (
            <View style={[styles.buddyAvatarWrap, focused && styles.buddyAvatarWrapFocused]}>
              <Image
                source={BUDDY_AVATAR}
                style={styles.buddyAvatar}
                resizeMode="cover"
              />
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="projekt/index"
        options={{
          title: t('tabs.project'),
          tabBarIcon: ({ color, size }) => (
            <Feather name="layers" color={color} size={size ?? 20} />
          ),
        }}
      />

      <Tabs.Screen
        name="wiecej"
        options={{
          title: t('tabs.more', { defaultValue: 'Więcej' }),
          tabBarIcon: ({ color, size }) => (
            <Feather name="grid" color={color} size={size ?? 20} />
          ),
        }}
      />

      <Tabs.Screen name="postepy/index" options={{ href: null }} />
      <Tabs.Screen name="postepy/wszystkie" options={{ href: null }} />
      <Tabs.Screen name="dokumenty/index" options={{ href: null }} />
      <Tabs.Screen name="zadania/index" options={{ href: null }} />
      <Tabs.Screen name="zdjecia/index" options={{ href: null }} />
      <Tabs.Screen name="ustawienia" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.bg,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: 64,
    paddingBottom: 10,
    paddingTop: 10,
  },
  tabBarLabel: {
    ...typography.label,
  },
  buddyAvatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    overflow: 'hidden',
    marginBottom: 2,
    backgroundColor: colors.surfaceAlt,
  },
  buddyAvatarWrapFocused: {
    borderColor: colors.borderFocus,
  },
  buddyAvatar: {
    width: '100%',
    height: '100%',
  },
});
