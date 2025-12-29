import { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { supabase } from '../../../lib/supabase';

export default function UstawieniaScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [profileComplete, setProfileComplete] = useState(false);
  const [investmentComplete, setInvestmentComplete] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return;

      setEmail(user.email ?? '');

      const [profileRes, investmentRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('imie, nazwisko, profil_wypelniony')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('inwestycje')
          .select('inwestycja_wypelniona')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      if (profileRes.data) {
        setName(profileRes.data.imie ?? '');
        setSurname(profileRes.data.nazwisko ?? '');
        setProfileComplete(Boolean(profileRes.data.profil_wypelniony));
      } else {
        setProfileComplete(false);
      }

      if (investmentRes.data) {
        setInvestmentComplete(Boolean(investmentRes.data.inwestycja_wypelniona));
      } else {
        setInvestmentComplete(false);
      }
    })();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handlePlaceholder = (label: string) => {
    Alert.alert(label, 'Funkcja bÄ™dzie podpiÄ™ta po stronie Supabase.');
  };

  const displayName =
    [name, surname].filter(Boolean).join(' ') || 'Nieznany uĹĽytkownik';

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 140 }}>
      <View style={styles.glow} />

      {/* USER */}
      <BlurView intensity={80} tint="dark" style={styles.card}>
        <Text style={styles.title}>{displayName}</Text>
        <Text style={styles.subtitle}>{email}</Text>

        <View style={styles.userMetaRow}>
          <View style={styles.metaBadge}>
            <Feather name="shield" size={16} color="#5EEAD4" />
            <Text style={styles.metaBadgeText}>Supabase Auth</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleSignOut}>
          <Feather name="log-out" size={18} color="#F43F5E" />
          <Text style={styles.logoutText}>Wyloguj</Text>
        </TouchableOpacity>
      </BlurView>

      {/* PROFIL */}
      <BlurView intensity={80} tint="dark" style={styles.card}>
        <Text style={styles.sectionTitle}>Profil</Text>

        <View style={styles.statusRow}>
          <View style={statusBadge(profileComplete)}>
            <Feather
              name={profileComplete ? 'check-circle' : 'alert-circle'}
              size={16}
              color={profileComplete ? '#34D399' : '#FACC15'}
              style={{ marginRight: 8 }}
            />
            <Text style={statusText(profileComplete)}>
              {profileComplete ? 'Profil uzupeĹ‚niony' : 'Profil wymagany'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push('/(app)/profil')}
          >
            <Text style={styles.secondaryButtonText}>Edytuj</Text>
          </TouchableOpacity>
        </View>
      </BlurView>

      {/* INWESTYCJA */}
      <BlurView intensity={80} tint="dark" style={styles.card}>
        <Text style={styles.sectionTitle}>Inwestycja</Text>

        <View style={styles.statusRow}>
          <View style={statusBadge(investmentComplete)}>
            <Feather
              name={investmentComplete ? 'check-circle' : 'alert-circle'}
              size={16}
              color={investmentComplete ? '#34D399' : '#FACC15'}
              style={{ marginRight: 8 }}
            />
            <Text style={statusText(investmentComplete)}>
              {investmentComplete ? 'Inwestycja uzupeĹ‚niona' : 'Inwestycja wymagana'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push('/(app)/inwestycja')}
          >
            <Text style={styles.secondaryButtonText}>Edytuj</Text>
          </TouchableOpacity>
        </View>
      </BlurView>

      {/* BEZPIECZEĹSTWO */}
      <BlurView intensity={80} tint="dark" style={styles.card}>
        <Text style={styles.sectionTitle}>BezpieczeĹ„stwo</Text>

        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => handlePlaceholder('ZmieĹ„ hasĹ‚o')}
        >
          <View style={styles.actionIcon}>
            <Feather name="lock" size={16} color="#0B1120" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionLabel}>ZmieĹ„ hasĹ‚o</Text>
            <Text style={styles.actionDescription}>Reset przez Supabase</Text>
          </View>
          <Feather name="chevron-right" size={18} color="#94A3B8" />
        </TouchableOpacity>
      </BlurView>
    </ScrollView>
  );
}

/* ===================== STYLES ===================== */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050915', paddingHorizontal: 16, paddingTop: 40 },

  glow: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 999,
    backgroundColor: '#F472B6',
    opacity: 0.12,
    top: 60,
    right: -140,
  },

  card: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 22,
    marginBottom: 18,
  },

  title: { color: '#F8FAFC', fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#94A3B8', marginTop: 6 },

  userMetaRow: { flexDirection: 'row', gap: 12, marginTop: 18 },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(94,234,212,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.3)',
  },
  metaBadgeText: { color: '#5EEAD4', fontWeight: '600' },

  logoutButton: {
    marginTop: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.4)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(244,63,94,0.1)',
  },
  logoutText: { color: '#F43F5E', fontWeight: '700' },

  sectionTitle: { color: '#F8FAFC', fontSize: 20, fontWeight: '700', marginBottom: 12 },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.4)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(94,234,212,0.08)',
  },
  secondaryButtonText: { color: '#5EEAD4', fontWeight: '700' },

  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5EEAD4',
  },
  actionLabel: { color: '#F8FAFC', fontSize: 16, fontWeight: '600' },
  actionDescription: { color: '#94A3B8', marginTop: 2 },
});

/* ===================== DYNAMIC STYLES ===================== */

const statusBadge = (ok: boolean): ViewStyle => ({
  flexDirection: 'row',
  alignItems: 'center',
  borderRadius: 999,
  paddingHorizontal: 12,
  paddingVertical: 8,
  backgroundColor: ok ? 'rgba(52,211,153,0.12)' : 'rgba(250,204,21,0.12)',
  borderWidth: 1,
  borderColor: ok ? 'rgba(52,211,153,0.4)' : 'rgba(250,204,21,0.35)',
});

const statusText = (ok: boolean): TextStyle => ({
  color: ok ? '#34D399' : '#FACC15',
  fontWeight: '700',
});



