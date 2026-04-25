import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { supabase } from '../../../../lib/supabase';
import { removePushToken } from '../../../../src/services/notifications/pushService';
import { isSubscriptionUiReadOnly } from '../../../../src/services/subscription/launchMode';
import { AppCard, AppHeader, AppScreen } from '../../../../src/ui/components';
import { colors, radius, shadows, spacing, typography } from '../../../../src/ui/theme';

function safeEmailPrefix(email?: string | null, fallback = 'User') {
  if (!email) return fallback;
  const [p] = email.split('@');
  return p ? p : fallback;
}

type MenuItem = {
  key: string;
  title: string;
  subtitle?: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  danger?: boolean;
};

export default function UstawieniaScreen() {
  const router = useRouter();
  const { t } = useTranslation(['settings', 'common']);
  const subscriptionUiReadOnly = isSubscriptionUiReadOnly();

  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState(t('settings:fallbackUser'));
  const [email, setEmail] = useState('');

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;

        const user = userData.user;

        if (!user) {
          if (!alive) return;
          setDisplayName(t('settings:fallbackUser'));
          setEmail('');
          return;
        }

        if (!alive) return;
        setEmail(user.email ?? '');

        const { data: profile, error: profErr } = await supabase
          .from('profiles')
          .select('imie')
          .eq('user_id', user.id)
          .maybeSingle();

        if (profErr && (profErr as any).code !== 'PGRST116') {
          console.warn('profiles select error:', profErr);
        }

        const name = (profile?.imie || '').trim();

        if (name) {
          setDisplayName(name);
        } else {
          setDisplayName(safeEmailPrefix(user.email, t('settings:fallbackUser')));
        }
      } catch (e: any) {
        Alert.alert(
          t('common:errorTitle'),
          e?.message ?? t('common:errors.generic')
        );
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [t]);

  const handleLogout = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await removePushToken(user.id);
      }
      await supabase.auth.signOut();
      router.replace('/(auth)/login');
    } catch (e: any) {
      Alert.alert(
        t('common:errorTitle'),
        e?.message ?? t('settings:logoutError')
      );
    }
  };

  const menuItems: MenuItem[] = useMemo(
    () => [
      {
        key: 'profil',
        title: t('settings:items.profileTitle'),
        subtitle: t('settings:items.profileSubtitle'),
        icon: 'user',
        onPress: () => router.push('/(app)/profil'),
      },
      {
        key: 'inwestycja',
        title: t('settings:items.investmentTitle'),
        subtitle: t('settings:items.investmentSubtitle'),
        icon: 'home',
        onPress: () => router.push('/(app)/inwestycja'),
      },
      {
        key: 'buddy',
        title: t('settings:items.buddyTitle'),
        subtitle: t('settings:items.buddySubtitle'),
        icon: 'cpu',
        onPress: () => router.push('/(app)/buddy-settings'),
      },
      {
        key: 'aplikacja',
        title: t('settings:items.appTitle'),
        subtitle: t('settings:items.appSubtitle'),
        icon: 'sliders',
        onPress: () => router.push('/(app)/(tabs)/ustawienia/aplikacja'),
      },
      {
        key: 'sub',
        title: t('settings:items.subscriptionTitle'),
        subtitle: t('settings:items.subscriptionSubtitle'),
        icon: 'credit-card',
        onPress: () =>
          router.push(
            subscriptionUiReadOnly
              ? '/(app)/(tabs)/ustawienia/subskrypcja'
              : '/(app)/(tabs)/ustawienia/subskrypcja'
          ),
      },
      {
        key: 'report',
        title: t('settings:items.reportTitle'),
        subtitle: t('settings:items.reportSubtitle'),
        icon: 'alert-triangle',
        onPress: () => router.push('/(app)/(tabs)/ustawienia/zglos_problem'),
      },
    ],
    [router, subscriptionUiReadOnly, t]
  );

  return (
    <AppScreen
      background={
        <>
          <View pointerEvents="none" style={styles.orbTop} />
          <View pointerEvents="none" style={styles.orbMid} />
        </>
      }
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 170 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <AppHeader title={t('settings:title')} style={styles.screenHeader} />
          <Text style={styles.headerName}>{displayName}</Text>
        </View>

        <View style={styles.menuWrap}>
          {menuItems.map((item) => (
            <Pressable
              key={item.key}
              onPress={item.onPress}
              style={({ pressed }) => [styles.tileOuter, pressed && styles.tileOuterPressed]}
            >
              <AppCard style={styles.tileFrame} contentStyle={styles.tile} withShadow={false}>
                <View style={styles.iconRing}>
                  <View style={styles.iconInner}>
                    <Feather name={item.icon} size={20} color={colors.accent} />
                  </View>
                </View>

                <View style={styles.tileTextWrap}>
                  <Text style={styles.tileTitle}>{item.title}</Text>
                  {!!item.subtitle && <Text style={styles.tileSubtitle}>{item.subtitle}</Text>}
                </View>

                <Feather name="chevron-right" size={20} color={colors.textFaint} />
              </AppCard>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={styles.logoutDock}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.9}>
          <View style={styles.logoutIcon}>
            <Feather name="log-out" size={19} color={colors.danger} />
          </View>
          <Text style={styles.logoutText}>{t('settings:logout')}</Text>
        </TouchableOpacity>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: 0,
    backgroundColor: 'transparent',
  },

  orbTop: {
    position: 'absolute',
    width: 460,
    height: 460,
    borderRadius: 999,
    backgroundColor: colors.accent,
    opacity: 0.08,
    top: -250,
    right: -230,
  },
  orbMid: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 999,
    backgroundColor: colors.accent,
    opacity: 0.05,
    top: 160,
    left: -210,
  },

  header: { paddingTop: 0, paddingBottom: spacing.md, alignItems: 'center' },
  screenHeader: {
    alignSelf: 'stretch',
    marginHorizontal: -spacing.xl,
  },
  headerName: {
    marginTop: spacing.xs,
    color: colors.textSoft,
    ...typography.button,
    fontWeight: '600',
    letterSpacing: -0.1,
    textAlign: 'center',
  },

  menuWrap: { gap: spacing.md, marginTop: spacing.md },

  tileOuter: {
    borderRadius: radius.lg,
    ...shadows.card,
  },
  tileOuterPressed: { transform: [{ scale: 1.005 }] },

  tileFrame: {
    borderRadius: radius.lg,
  },

  tile: {
    height: 72,
    borderRadius: radius.lg - 1,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },

  iconRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.accentSoft,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  iconInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tileTextWrap: { flex: 1 },
  tileTitle: {
    color: colors.text,
    ...typography.cardTitle,
  },
  tileSubtitle: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    ...typography.meta,
  },

  logoutDock: { position: 'absolute', left: spacing.xl, right: spacing.xl, bottom: spacing['2xl'] },

  logoutButton: {
    height: 58,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm + 2,
  },
  logoutIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: 'rgba(255,71,71,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    color: colors.textSoft,
    ...typography.button,
  },
});
