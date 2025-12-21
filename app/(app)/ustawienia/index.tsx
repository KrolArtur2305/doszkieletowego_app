import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';

export default function UstawieniaScreen() {
  const router = useRouter();
  const [email, setEmail] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [surname, setSurname] = useState<string>('');
  const [profileComplete, setProfileComplete] = useState<boolean>(false);
  const [investmentComplete, setInvestmentComplete] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
          .select('inwestycja_wypelniona, nazwa')
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
    Alert.alert(label, 'Wersja mock – podepniemy działanie po stronie Supabase.');
  };

  const displayName = [name, surname].filter(Boolean).join(' ') || 'Nieznany użytkownik';

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 140 }}>
      <View style={styles.glow} />
      <BlurView intensity={80} tint="dark" style={styles.card}>
        <Text style={styles.title}>{displayName}</Text>
        <Text style={styles.subtitle}>{email}</Text>
        <View style={styles.userMetaRow}>
          <View style={styles.metaBadge}>
            <Feather name="shield" size={16} color="#5EEAD4" />
            <Text style={styles.metaBadgeText}>Supabase Auth</Text>
          </View>
          <View style={styles.metaBadge}>
            <Feather name="bell" size={16} color="#5EEAD4" />
            <Text style={styles.metaBadgeText}>Powiadomienia push</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={handleSignOut}>
          <Feather name="log-out" size={18} color="#F43F5E" />
          <Text style={styles.logoutText}>Wyloguj</Text>
        </TouchableOpacity>
      </BlurView>

      <BlurView intensity={80} tint="dark" style={styles.card}>
        <Text style={styles.sectionTitle}>Bezpieczeństwo</Text>
        <TouchableOpacity style={styles.actionRow} onPress={() => handlePlaceholder('Zmień hasło')}>
          <View style={styles.actionIcon}>
            <Feather name="lock" size={16} color="#0B1120" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionLabel}>Zmień hasło</Text>
            <Text style={styles.actionDescription}>Wyślemy link resetujący przez Supabase</Text>
          </View>
          <Feather name="chevron-right" size={18} color="#94A3B8" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionRow} onPress={() => handlePlaceholder('Autoryzacja dwuskładnikowa')}>
          <View style={styles.actionIcon}>
            <Feather name="smartphone" size={16} color="#0B1120" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionLabel}>Autoryzacja 2FA</Text>
            <Text style={styles.actionDescription}>Google Authenticator + SMS</Text>
          </View>
          <Feather name="chevron-right" size={18} color="#94A3B8" />
        </TouchableOpacity>
      </BlurView>

      <BlurView intensity={80} tint="dark" style={styles.card}>
        <Text style={styles.sectionTitle}>Powiadomienia</Text>
        <TouchableOpacity style={styles.actionRow} onPress={() => handlePlaceholder('Powiadomienia budowy')}>
          <View style={styles.actionIcon}>
            <Feather name="bell" size={16} color="#0B1120" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionLabel}>Alerty budowy</Text>
            <Text style={styles.actionDescription}>Push / e-mail w zależności od ważności</Text>
          </View>
          <Feather name="toggle-right" size={18} color="#5EEAD4" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionRow} onPress={() => handlePlaceholder('Raport tygodniowy')}>
          <View style={styles.actionIcon}>
            <Feather name="calendar" size={16} color="#0B1120" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionLabel}>Raport tygodniowy</Text>
            <Text style={styles.actionDescription}>Podsumowanie budżetu i zdjęć</Text>
          </View>
          <Feather name="chevron-right" size={18} color="#94A3B8" />
        </TouchableOpacity>
      </BlurView>

      <BlurView intensity={80} tint="dark" style={styles.card}>
        <Text style={styles.sectionTitle}>Profil</Text>
        <View style={styles.statusRow}>
          <View style={statusBadge(profileComplete)}>
            <Feather name={profileComplete ? 'check-circle' : 'alert-circle'} size={16} color={profileComplete ? '#34D399' : '#FACC15'} />
            <Text style={statusText(profileComplete)}>
              {profileComplete ? 'Profil uzupełniony' : 'Profil wymagany'}
            </Text>
          </View>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/(app)/profil')}>
            <Text style={styles.secondaryButtonText}>Edytuj profil</Text>
          </TouchableOpacity>
        </View>
      </BlurView>

      <BlurView intensity={80} tint="dark" style={styles.card}>
        <Text style={styles.sectionTitle}>Inwestycja</Text>
        <View style={styles.statusRow}>
          <View style={statusBadge(investmentComplete)}>
            <Feather name={investmentComplete ? 'check-circle' : 'alert-circle'} size={16} color={investmentComplete ? '#34D399' : '#FACC15'} />
            <Text style={statusText(investmentComplete)}>
              {investmentComplete ? 'Inwestycja uzupełniona' : 'Inwestycja wymagana'}
            </Text>
          </View>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/(app)/inwestycja')}>
            <Text style={styles.secondaryButtonText}>Edytuj inwestycję</Text>
          </TouchableOpacity>
        </View>
      </BlurView>
    </ScrollView>
  );
}

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
  userMetaRow: { flexDirection: 'row', gap: 12, marginTop: 18, flexWrap: 'wrap' },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
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
});

const statusBadge = (ok: boolean) => ({
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  borderRadius: 999,
  paddingHorizontal: 12,
  paddingVertical: 8,
  backgroundColor: ok ? 'rgba(52,211,153,0.12)' : 'rgba(250,204,21,0.12)',
  borderWidth: 1,
  borderColor: ok ? 'rgba(52,211,153,0.4)' : 'rgba(250,204,21,0.35)',
});

const statusText = (ok: boolean) => ({
  color: ok ? '#34D399' : '#FACC15',
  fontWeight: '700',
});
