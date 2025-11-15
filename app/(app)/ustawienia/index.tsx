import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../supabase';

export default function UstawieniaScreen() {
  const [email, setEmail] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [surname, setSurname] = useState<string>('');

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? '');

      const { data } = await supabase
        .from('profiles')
        .select('imie, nazwisko')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        setName(data.imie ?? '');
        setSurname(data.nazwisko ?? '');
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
});
