import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';

import { supabase } from '../../../supabase';

export default function ProfilScreen() {
  const [fullName, setFullName] = useState<string>('Ładowanie…');
  const [email, setEmail] = useState<string>('');

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
        .limit(1)
        .maybeSingle();

      if (data) {
        const name = [data.imie, data.nazwisko].filter(Boolean).join(' ');
        setFullName(name || 'Uzupełnij dane profilu');
      } else {
        setFullName('Uzupełnij dane profilu');
      }
    })();
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 120 }}>
      <View style={styles.glow} />
      <BlurView intensity={80} tint="dark" style={styles.card}>
        <Text style={styles.title}>Profil</Text>
        <Text style={styles.subtitle}>Dodaj lub zaktualizuj dane, aby odblokować aplikację.</Text>

        <View style={styles.infoRow}>
          <Feather name="user" color="#5EEAD4" size={18} />
          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabel}>Imię i nazwisko</Text>
            <Text style={styles.infoValue}>{fullName}</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <Feather name="mail" color="#5EEAD4" size={18} />
          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabel}>E-mail</Text>
            <Text style={styles.infoValue}>{email || '—'}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.ctaButton} onPress={() => {}}>
          <Text style={styles.ctaText}>Wypełnij profil</Text>
        </TouchableOpacity>
      </BlurView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050915', paddingHorizontal: 16, paddingTop: 40 },
  glow: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 999,
    backgroundColor: '#0EA5E9',
    opacity: 0.15,
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
  subtitle: { color: '#94A3B8', marginTop: 8, marginBottom: 18 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  infoLabel: { color: '#94A3B8', fontSize: 13 },
  infoValue: { color: '#F8FAFC', fontSize: 16, fontWeight: '600' },
  ctaButton: {
    marginTop: 24,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.4)',
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(94,234,212,0.12)',
  },
  ctaText: { color: '#5EEAD4', fontWeight: '700' },
});
