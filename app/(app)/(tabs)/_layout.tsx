import React from 'react';
import { Image, PanResponder, StyleSheet, View } from 'react-native';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, typography } from '../../../src/ui/theme';
import { useEffect, useState } from 'react';
import { useSupabaseAuth } from '../../../hooks/useSupabaseAuth';
import {
  DEFAULT_BUDDY_AVATAR_ID,
  type BuddyAvatarId,
  getBuddyAvatarSource,
  loadBuddyAvatarId,
} from '../../../src/services/buddy/avatar';

export default function TabsLayout() {
  const { t } = useTranslation('navigation');
  const router = useRouter();
  const pathname = usePathname();
  const { session } = useSupabaseAuth();
  const [avatarId, setAvatarId] = useState<BuddyAvatarId>(DEFAULT_BUDDY_AVATAR_ID);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setAvatarId(DEFAULT_BUDDY_AVATAR_ID);
      return;
    }

    let active = true;
    loadBuddyAvatarId(userId).then((nextAvatarId) => {
      if (active) setAvatarId(nextAvatarId);
    });

    return () => {
      active = false;
    };
  }, [session?.user?.id, pathname]);

  const avatarSource = getBuddyAvatarSource(avatarId);
  const canSwipeBackToMore =
    pathname === '/dokumenty' ||
    pathname === '/zdjecia' ||
    pathname === '/postepy' ||
    pathname === '/postepy/wszystkie' ||
    pathname === '/zadania' ||
    pathname === '/ustawienia' ||
    pathname.startsWith('/ustawienia/') ||
    pathname.startsWith('/wiecej/');

  const moreBackSwipeResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (event, gestureState) => {
          if (!canSwipeBackToMore) return false;

          const startX = event.nativeEvent.pageX - gestureState.dx;
          const isFromLeftEdge = startX <= 36;
          const isRightSwipe = gestureState.dx > 28;
          const isMostlyHorizontal = Math.abs(gestureState.dy) < 24;

          return isFromLeftEdge && isRightSwipe && isMostlyHorizontal;
        },
        onPanResponderRelease: (_event, gestureState) => {
          if (!canSwipeBackToMore) return;

          const shouldGoBackToMore = gestureState.dx > 80 || (gestureState.dx > 45 && gestureState.vx > 0.45);
          if (shouldGoBackToMore) {
            router.replace('/wiecej');
          }
        },
      }),
    [canSwipeBackToMore, router]
  );

  return (
    <View style={styles.root} {...moreBackSwipeResponder.panHandlers}>
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
          title: t('tabs.buddy'),
          tabBarIcon: ({ focused }) => (
            <View style={[styles.buddyAvatarWrap, focused && styles.buddyAvatarWrapFocused]}>
              <Image
                source={avatarSource}
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
          title: t('tabs.more'),
          tabBarIcon: ({ color, size }) => (
            <Feather name="grid" color={color} size={size ?? 20} />
          ),
        }}
      />

      <Tabs.Screen name="postepy/index" options={{ href: null }} />
      <Tabs.Screen name="postepy/wszystkie" options={{ href: null }} />
      <Tabs.Screen name="budzet/wszystkie" options={{ href: null }} />
      <Tabs.Screen name="dokumenty/index" options={{ href: null }} />
      <Tabs.Screen name="zadania/index" options={{ href: null }} />
      <Tabs.Screen name="zdjecia/index" options={{ href: null }} />
        <Tabs.Screen name="ustawienia" options={{ href: null }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  tabBar: {
    backgroundColor: colors.bg,
    borderTopColor: 'rgba(37,240,200,0.16)',
    borderTopWidth: StyleSheet.hairlineWidth,
    height: 64,
    paddingBottom: 10,
    paddingTop: 10,
    shadowColor: colors.accentBright,
    shadowOpacity: 0.08,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: -2 },
    elevation: 6,
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
