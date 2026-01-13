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

import { supabase } from '../../../../lib/supabase';

function safeEmailPrefix(email?: string | null) {
  if (!email) return 'Użytkownik';
  const [p] = email.split('@');
  return p ? p : 'Użytkownik';
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

  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('Ustawienia');
  const [email, setEmail] = useState(''); // logika zostaje (UI nie pokazuje)

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
          setDisplayName('Ustawienia');
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

        if (profErr && profErr.code !== 'PGRST116') {
          console.warn('profiles select error:', profErr);
        }

        const name = (profile?.imie || '').trim();
        if (name) setDisplayName(name);
        else setDisplayName(safeEmailPrefix(user.email));
      } catch (e: any) {
        Alert.alert('Błąd', e?.message ?? 'Nie udało się pobrać danych.');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const handlePlaceholder = (label: string) => {
    Alert.alert(label, 'Ta funkcja będzie dodana później.');
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.replace('/login'); // jeśli masz inną ścieżkę logowania, zmień tutaj
    } catch (e: any) {
      Alert.alert('Błąd', e?.message ?? 'Nie udało się wylogować.');
    }
  };

  const menuItems: MenuItem[] = useMemo(
    () => [
      {
        key: 'profil',
        title: 'Profil',
        subtitle: 'Dane właściciela konta',
        icon: 'user',
        onPress: () => router.push('/(app)/profil'),
      },
      {
        key: 'inwestycja',
        title: 'Inwestycja',
        subtitle: 'Dane projektu / budowy',
        icon: 'home',
        onPress: () => router.push('/(app)/inwestycja'),
      },
      {
        key: 'aplikacja',
        title: 'Aplikacja',
        subtitle: 'Ustawienia aplikacji (później)',
        icon: 'sliders',
        onPress: () => handlePlaceholder('Aplikacja'),
      },
      {
        key: 'sub',
        title: 'Zarządzaj subskrypcją',
        subtitle: 'Później',
        icon: 'credit-card',
        onPress: () => handlePlaceholder('Subskrypcja'),
      },
      {
        key: 'report',
        title: 'Zgłoś problem',
        subtitle: 'Wyślij opis błędu',
        icon: 'alert-triangle',
        onPress: () => router.push('/(app)/(tabs)/ustawienia/zglos_problem'),
      },
    ],
    [router]
  );

  return (
    <View style={styles.screen}>
      {/* subtle background */}
      <View style={styles.orbTop} />
      <View style={styles.orbMid} />

      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 170 }}>
        {/* HEADER (centered, bigger title) */}
        <View style={styles.header}>
          <Text style={styles.headerMainTitle}>
            {loading ? 'Ładowanie…' : 'Ustawienia konta'}
          </Text>
          <Text style={styles.headerName}>{displayName}</Text>
        </View>

        {/* MENU */}
        <View style={styles.menuWrap}>
          {menuItems.map((item) => (
            <Pressable
              key={item.key}
              onPress={item.onPress}
              style={({ pressed }) => [styles.tileOuter, pressed && styles.tileOuterPressed]}
            >
              {/* Modern “double border” feel */}
              <View style={styles.tileFrame}>
                <BlurView intensity={22} tint="dark" style={styles.tile}>
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

        <View style={{ height: 10 }} />
      </ScrollView>

      {/* LOGOUT */}
      <View style={styles.logoutDock}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.9}>
          <View style={styles.logoutIcon}>
            <Feather name="log-out" size={19} color={COLORS.danger} />
          </View>
          <Text style={styles.logoutText}>Wyloguj</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ===================== THEME ===================== */

const COLORS = {
  bg: '#0A0A0A',
  text: '#FFFFFF',
  muted: 'rgba(255,255,255,0.44)',
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

/* ===================== STYLES ===================== */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },

  container: { flex: 1, paddingHorizontal: 20, paddingTop: 26 },

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

  header: {
    paddingTop: 12,
    paddingBottom: 18,
    alignItems: 'center',
  },

  headerMainTitle: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.2,
    textAlign: 'center',
    textShadowColor: 'rgba(25,112,92,0.20)',
    textShadowRadius: 14,
  },

  headerName: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.86)',
    fontSize: 18,
    fontWeight: '500',
    letterSpacing: -0.1,
    textAlign: 'center',
  },

  menuWrap: {
    gap: 12,
    marginTop: 18,
  },

  tileOuter: {
    borderRadius: 22,
    shadowColor: '#000',
    shadowOpacity: 0.38,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 3,
  },

  tileOuterPressed: {
    transform: [{ scale: 1.01 }],
  },

  // “frame” gives a more modern border vibe
  tileFrame: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(25,112,92,0.22)',
    backgroundColor: 'rgba(255,255,255,0.01)',
    padding: 1, // creates outer ring effect
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

  tileTitle: {
    color: COLORS.text,
    fontSize: 17.5,
    fontWeight: '600',
    letterSpacing: -0.1,
  },

  tileSubtitle: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.40)',
    fontSize: 13,
    fontWeight: '400',
  },

  logoutDock: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 24,
  },

  logoutButton: {
    height: 58,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
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
    backgroundColor: 'rgba(255,71,71,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  logoutText: {
    fontSize: 16.5,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.74)',
    letterSpacing: -0.1,
  },
});
