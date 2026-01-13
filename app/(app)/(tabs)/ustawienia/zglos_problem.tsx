import { useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

type Category = { key: string; label: string; icon: keyof typeof Feather.glyphMap };

export default function ZglosProblemScreen() {
  const router = useRouter();

  const categories: Category[] = useMemo(
    () => [
      { key: 'logowanie', label: 'Logowanie / sesja', icon: 'key' },
      { key: 'supabase', label: 'Supabase / dane', icon: 'database' },
      { key: 'ui', label: 'UI / ekran', icon: 'layout' },
      { key: 'crash', label: 'Crash', icon: 'alert-octagon' },
      { key: 'inne', label: 'Inne', icon: 'more-horizontal' },
    ],
    []
  );

  const [category, setCategory] = useState<Category>(categories[0]);
  const [message, setMessage] = useState('');

  const handleSubmit = async () => {
    const trimmed = (message || '').trim();
    if (trimmed.length < 10) {
      Alert.alert('Uwaga', 'Opisz problem przynajmniej w 10 znakach.');
      return;
    }

    Alert.alert('Dzięki!', 'Zgłoszenie zostało zapisane lokalnie (demo).');
    setMessage('');
    router.back();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 140 }}>
      <View style={styles.glow} />

      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.85}>
          <Feather name="chevron-left" size={22} color="#E2E8F0" />
        </TouchableOpacity>
        <Text style={styles.title}>Zgłoś problem</Text>
        <View style={{ width: 44 }} />
      </View>

      <BlurView intensity={80} tint="dark" style={styles.card}>
        <Text style={styles.sectionTitle}>Kategoria</Text>

        <View style={styles.chips}>
          {categories.map((c) => {
            const active = c.key === category.key;
            return (
              <TouchableOpacity
                key={c.key}
                onPress={() => setCategory(c)}
                activeOpacity={0.85}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Feather name={c.icon} size={14} color={active ? '#06121F' : '#5EEAD4'} />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Opis</Text>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Co dokładnie się stało? Co kliknąłeś? Jaki był efekt?"
          placeholderTextColor="rgba(226,232,240,0.45)"
          style={styles.textarea}
          multiline
          textAlignVertical="top"
        />

        <TouchableOpacity style={styles.primaryButton} onPress={handleSubmit} activeOpacity={0.9}>
          <Text style={styles.primaryButtonText}>Wyślij</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          To jest wersja demo. Później podepniemy zapis do Supabase lub webhook.
        </Text>
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
    backgroundColor: '#5EEAD4',
    opacity: 0.08,
    top: 40,
    right: -140,
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  title: { color: '#F8FAFC', fontSize: 18, fontWeight: '900' },

  card: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 18,
  },

  sectionTitle: { color: '#F8FAFC', fontSize: 14, fontWeight: '900' },

  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.35)',
    backgroundColor: 'rgba(94,234,212,0.08)',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  chipActive: {
    backgroundColor: '#5EEAD4',
    borderColor: 'rgba(94,234,212,0.9)',
  },
  chipText: { color: '#5EEAD4', fontWeight: '900', fontSize: 12 },
  chipTextActive: { color: '#06121F' },

  textarea: {
    marginTop: 12,
    minHeight: 140,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F8FAFC',
  },

  primaryButton: {
    marginTop: 14,
    borderRadius: 16,
    backgroundColor: '#5EEAD4',
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#06121F', fontWeight: '900' },

  hint: { color: '#94A3B8', marginTop: 10, fontSize: 12, fontWeight: '600' },
});
