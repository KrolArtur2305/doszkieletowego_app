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
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { supabase } from '../../../../lib/supabase';

function safeEmailPrefix(email?: string | null) {
  // fallback, gdyby t() jeszcze nie było gotowe w jakimś edge-case
  if (!email) return 'User';
  const [p] = email.split('@');
  return p ? p : 'User';
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

  // ✅ Wariant B: settings osobny namespace
  const { t } = useTranslation(['settings', 'common']);

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
        if (name) setDisplayName(name);
        else setDisplayName(safeEmailPrefix(user.email));
      } catch (e: any) {
        Alert.alert(t('common:errorTitle'), e?.message ?? t('common:errors.generic'));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [t]);

  const handlePlaceholder = (label: string) => {
    Alert.alert(label, t('settings:placeholderMessage'));
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.replace('/login');
    } catch (e: any) {
      Alert.alert(t('common:errorTitle'), e?.message ?? t('settings:logoutError'));
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
        key: 'aplikacja',
        title: t('settings:items.appTitle'),
        subtitle: t('settings:items.appSubtitle'),
        icon: 'sliders',
        onPress: () => handlePlaceholder(t('settings:items.appTitle')),
      },
      {
        key: 'sub',
        title: t('settings:items.subscriptionTitle'),
        subtitle: t('settings:items.subscriptionSubtitle'),
        icon: 'credit-card',
        onPress: () => handlePlaceholder(t('settings:items.subscriptionTitle')),
      },
      {
        key: 'report',
        title: t('settings:items.reportTitle'),
        subtitle: t('settings:items.reportSubtitle'),
        icon: 'alert-triangle',
        onPress: () => router.push('/(app)/(tabs)/ustawienia/zglos_problem'),
      },
    ],
    [router, t]
  );

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.blackBase} />

      <View pointerEvents="none" style={styles.orbTop} />
      <View pointerEvents="none" style={styles.orbMid} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 170 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.headerMainTitle}>
            {loading ? t('common:loading') : t('settings:title')}
          </Text>
          <Text style={styles.headerName}>{displayName}</Text>
        </View>

        <View style={styles.menuWrap}>
          {menuItems.map((item) => (
            <Pressable
              key={item.key}
              onPress={item.onPress}
              style={({ pressed }) => [styles.tileOuter, pressed && styles.tileOuterPressed]}
            >
              <View style={styles.tileFrame}>
                <View pointerEvents="none" style={styles.tileUnderlay} />

                <BlurView intensity={18} tint="dark" style={styles.tile}>
                  <View style={styles.iconRing}>
                    <View style={styles.iconInner}>
                      <Feather name={item.icon} size={20} color={COLORS.accent} />
                    </View>
                  </View>

                  <View style={styles.tileTextWrap}>
                    <Text style={styles.tileTitle}>{item.title}</Text>
                    {!!item.subtitle && <Text style={styles.tileSubtitle}>{item.subtitle}</Text>}
                  </View>

                  <Feather name="chevron-right" size={20} color={COLORS.chevron} />
                </BlurView>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={styles.logoutDock}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.9}>
          <View style={styles.logoutIcon}>
            <Feather name="log-out" size={19} color={COLORS.danger} />
          </View>
          <Text style={styles.logoutText}>{t('settings:logout')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const COLORS = {
  text: '#FFFFFF',
  border: 'rgba(255,255,255,0.08)',
  border2: 'rgba(255,255,255,0.14)',
  cardFill: 'rgba(255,255,255,0.035)',
  accent: '#19705C',
  accentSoft: 'rgba(25,112,92,0.26)',
  accentFill: 'rgba(25,112,92,0.07)',
  chevron: 'rgba(255,255,255,0.34)',
  danger: '#FF4747',
  dangerBorder: 'rgba(255,71,71,0.30)',
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },

  blackBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },

  container: { flex: 1, paddingHorizontal: 20, paddingTop: 26, backgroundColor: 'transparent' },

  orbTop: {
    position: 'absolute',
    width: 460,
    height: 460,
    borderRadius: 999,
    backgroundColor: COLORS.accent,
    opacity: 0.10,
    top: -250,
    right: -230,
  },
  orbMid: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 999,
    backgroundColor: COLORS.accent,
    opacity: 0.06,
    top: 160,
    left: -210,
  },

  header: { paddingTop: 12, paddingBottom: 18, alignItems: 'center' },
  headerMainTitle: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
    textShadowColor: 'rgba(25,112,92,0.22)',
    textShadowRadius: 14,
  },
  headerName: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.86)',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: -0.1,
    textAlign: 'center',
  },

  menuWrap: { gap: 12, marginTop: 18 },

  tileOuter: {
    borderRadius: 22,
    shadowColor: '#000',
    shadowOpacity: 0.38,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 3,
  },
  tileOuterPressed: { transform: [{ scale: 1.01 }] },

  tileFrame: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(25,112,92,0.22)',
    backgroundColor: 'rgba(255,255,255,0.01)',
    padding: 1,
    overflow: 'hidden',
  },

  tileUnderlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },

  tile: {
    height: 72,
    borderRadius: 21,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardFill,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },

  iconRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.accentSoft,
    backgroundColor: 'rgba(255,255,255,0.02)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tileTextWrap: { flex: 1 },
  tileTitle: { color: COLORS.text, fontSize: 17.5, fontWeight: '700', letterSpacing: -0.1 },
  tileSubtitle: { marginTop: 4, color: 'rgba(255,255,255,0.44)', fontSize: 13, fontWeight: '500' },

  logoutDock: { position: 'absolute', left: 20, right: 20, bottom: 24 },

  logoutButton: {
    height: 58,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: COLORS.border2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  logoutIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
    backgroundColor: 'rgba(255,71,71,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    fontSize: 16.5,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.78)',
    letterSpacing: -0.1,
  },
});
