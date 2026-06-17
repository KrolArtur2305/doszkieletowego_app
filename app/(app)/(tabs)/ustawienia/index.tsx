import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '../../../../lib/supabase';
import { getUserWithTimeout } from '../../../../lib/supabaseTimeout';
import { getFriendlyErrorMessage } from '../../../../lib/errorMessages';
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
  const insets = useSafeAreaInsets();
  const subscriptionUiReadOnly = isSubscriptionUiReadOnly();

  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState(t('settings:fallbackUser'));
  const [email, setEmail] = useState('');

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        const user = await getUserWithTimeout();

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
          getFriendlyErrorMessage(e, t)
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
    const user = await getUserWithTimeout().catch((e) => {
      console.warn('Failed to read user before logout:', e);
      return null;
    });

    if (user) {
      await removePushToken(user.id).catch((e) => {
        console.warn('Failed to remove push token before logout:', e);
      });
    }

    try {
      await supabase.auth.signOut();
      router.replace('/(auth)/welcome');
    } catch (e: any) {
      Alert.alert(
        t('common:errorTitle'),
        getFriendlyErrorMessage(e, t, 'settings:logoutError')
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
        onPress: () => router.push('/(app)/profil')},
      {
        key: 'inwestycja',
        title: t('settings:items.investmentTitle'),
        subtitle: t('settings:items.investmentSubtitle'),
        icon: 'home',
        onPress: () => router.push('/(app)/inwestycja')},
      {
        key: 'buddy',
        title: t('settings:items.buddyTitle'),
        subtitle: t('settings:items.buddySubtitle'),
        icon: 'cpu',
        onPress: () => router.push('/(app)/buddy-settings')},
      {
        key: 'partner',
        title: t('settings:items.partnerTitle'),
        subtitle: t('settings:items.partnerSubtitle'),
        icon: 'users',
        onPress: () => router.push('/(app)/(tabs)/ustawienia/partner')},
      {
        key: 'aplikacja',
        title: t('settings:items.appTitle'),
        subtitle: t('settings:items.appSubtitle'),
        icon: 'sliders',
        onPress: () => router.push('/(app)/(tabs)/ustawienia/aplikacja')},
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
          )},
      {
        key: 'logout',
        title: t('settings:logout'),
        icon: 'log-out',
        danger: true,
        onPress: handleLogout}],
    [router, subscriptionUiReadOnly, t]
  );

  return (
    <AppScreen>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(44, insets.bottom + 96) },
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom + 76 }}
        alwaysBounceVertical
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
                    <Feather name={item.icon} size={20} color={item.danger ? colors.danger : colors.accent} />
                  </View>
                </View>

                <View style={styles.tileTextWrap}>
                  <Text style={[styles.tileTitle, item.danger && styles.tileTitleDanger]}>{item.title}</Text>
                  {!!item.subtitle && <Text style={styles.tileSubtitle}>{item.subtitle}</Text>}
                </View>

                <Feather name="chevron-right" size={20} color={colors.textFaint} />
              </AppCard>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: 0,
    backgroundColor: 'transparent'},
  scrollContent: {
    flexGrow: 1},

  orbTop: {
    position: 'absolute',
    width: 460,
    height: 460,
    borderRadius: 999,
    backgroundColor: colors.accent,
    opacity: 0.08,
    top: -250,
    right: -230},
  orbMid: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 999,
    backgroundColor: colors.accent,
    opacity: 0.05,
    top: 160,
    left: -210},

  header: { paddingTop: 0, paddingBottom: spacing.lg, alignItems: 'center' },
  screenHeader: {
    alignSelf: 'stretch',
    marginHorizontal: -spacing.xl},
  headerName: {
    marginTop: spacing.xs,
    color: colors.textSoft,
    ...typography.button,
    fontWeight: '600',
    letterSpacing: -0.1,
    textAlign: 'center'},

  menuWrap: { gap: spacing.md, marginTop: spacing.xs },

  tileOuter: {
    borderRadius: radius.lg,
    ...shadows.card},
  tileOuterPressed: { transform: [{ scale: 1.005 }] },

  tileFrame: {
    borderRadius: radius.lg},

  tile: {
    minHeight: 74,
    borderRadius: radius.lg - 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden'},

  iconRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.accentSoft,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md},
  iconInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accentFill,
    alignItems: 'center',
    justifyContent: 'center'},

  tileTextWrap: { flex: 1 },
  tileTitle: {
    color: colors.text,
    ...typography.cardTitle},
  tileTitleDanger: {
    color: colors.danger},
  tileSubtitle: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    ...typography.meta}});
