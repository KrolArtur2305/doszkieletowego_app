import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

import { supabase } from '../../../lib/supabase';

// ✅ twardy cache na poziomie modułu (przetrwa Fast Refresh w większości przypadków)
let __profilInitOnce = false;
let __profilInitUserId: string | null = null;

export default function ProfilScreen() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>('');

  // ✅ pola zgodne z Supabase (profiles: imie, nazwisko, telefon, profil_wypelniony)
  const [imie, setImie] = useState<string>('');
  const [nazwisko, setNazwisko] = useState<string>('');
  const [telefon, setTelefon] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  const fullNamePreview = useMemo(() => {
    const v = [imie.trim(), nazwisko.trim()].filter(Boolean).join(' ');
    return v || 'Uzupełnij dane profilu';
  }, [imie, nazwisko]);

  const normalizePhone = (v: string) => v.replace(/[^\d+]/g, '');

  useEffect(() => {
    let alive = true;

    (async () => {
      // ✅ jeśli już raz zainicjalizowaliśmy dla tego usera, nie rób drugi raz
      if (__profilInitOnce && __profilInitUserId) {
        if (alive) setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const { data: userRes, error: userErr } = await supabase.auth.getUser();
        console.log('[Profil] getUser:', { hasUser: !!userRes?.user, userErr });

        if (!alive) return;

        if (userErr || !userRes?.user) {
          setUserId(null);
          setEmail('');
          return;
        }

        const user = userRes.user;

        // ✅ ustaw cache modułowy
        __profilInitOnce = true;
        __profilInitUserId = user.id;

        setUserId(user.id);
        setEmail(user.email ?? '');

        const { data, error } = await supabase
          .from('profiles')
          .select('imie, nazwisko, telefon, profil_wypelniony')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();

        console.log('[Profil] fetch profile:', { data, error });

        if (!alive) return;

        if (data) {
          setImie(data.imie ?? '');
          setNazwisko(data.nazwisko ?? '');
          setTelefon(data.telefon ?? '');
        }
      } catch (e) {
        console.log('[Profil] init exception:', e);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const handleSaveAndContinue = async () => {
  if (saving) return;

  const first = imie.trim();
  const last = nazwisko.trim();
  const phoneRaw = telefon.trim();
  const phone = phoneRaw ? normalizePhone(phoneRaw) : '';

  if (!first) {
    Alert.alert('Uzupełnij dane', 'Imię jest wymagane, aby kontynuować.');
    return;
  }

  if (phone && phone.replace(/\D/g, '').length < 7) {
    Alert.alert('Nieprawidłowy numer', 'Podaj poprawny numer telefonu lub zostaw puste pole.');
    return;
  }

  setSaving(true);
  try {
    // ✅ zawsze bierz usera "na świeżo" przy zapisie
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const user = userRes?.user;

    if (userErr || !user?.id) {
      Alert.alert('Błąd', 'Brak użytkownika. Zaloguj się ponownie.');
      return;
    }

    const payload = {
      user_id: user.id,
      imie: first,
      nazwisko: last || null,
      telefon: phone || null,
      email: user.email ?? email ?? null,
      profil_wypelniony: true,
    };

    const { data, error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'user_id' })
      .select('user_id, profil_wypelniony')
      .maybeSingle();

    if (error) {
      Alert.alert('Błąd zapisu', error.message);
      return;
    }

    if (!data?.profil_wypelniony) {
      Alert.alert('Błąd', 'Profil nie został oznaczony jako wypełniony.');
      return;
    }

    // ✅ od razu przejście dalej
    router.replace('/(app)/inwestycja');
  } catch (e: any) {
    Alert.alert('Błąd', e?.message ?? 'Coś poszło nie tak.');
  } finally {
    setSaving(false);
  }
};

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.screen}>
        {/* tło + glowy */}
        <View pointerEvents="none" style={styles.bg}>
          <View style={styles.glowA} />
          <View style={styles.glowB} />
          <View style={styles.glowC} />
        </View>

        <View style={styles.container}>
          <Text style={styles.kicker}>KONTO</Text>
          <Text style={styles.title}>Mój profil</Text>
          <Text style={styles.sub}>
            Uzupełnij dane profilu, żeby przejść dalej.
          </Text>

          <BlurView intensity={85} tint="dark" style={styles.card}>
            <View style={styles.headerRow}>
              <View style={styles.badge}>
                <Feather name="user" size={16} color="#5EEAD4" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.namePreview}>{fullNamePreview}</Text>
                <Text style={styles.email} numberOfLines={1}>
                  {email ? email : '—'}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator />
                <Text style={styles.loadingText}>Ładowanie danych profilu…</Text>
              </View>
            ) : (
              <View style={styles.form}>
                <Field
                  label="Imię"
                  value={imie}
                  onChangeText={setImie}
                  placeholder="np. Artur"
                  icon="edit-3"
                  autoCapitalize="words"
                />
                <Field
                  label="Nazwisko"
                  value={nazwisko}
                  onChangeText={setNazwisko}
                  placeholder="np. Kowalski"
                  icon="edit-3"
                  autoCapitalize="words"
                />
                <Field
                  label="Telefon"
                  value={telefon}
                  onChangeText={setTelefon}
                  placeholder="np. +48 600 000 000"
                  icon="phone"
                  keyboardType="phone-pad"
                />

                <TouchableOpacity
                  style={[styles.cta, (saving || loading) && styles.ctaDisabled]}
                  activeOpacity={0.85}
                  onPress={handleSaveAndContinue}
                  disabled={saving || loading}
                >
                  {saving ? (
                    <ActivityIndicator />
                  ) : (
                    <>
                      <Text style={styles.ctaText}>Zapisz i kontynuuj</Text>
                      <Feather name="arrow-right" size={18} color="#071818" />
                    </>
                  )}
                </TouchableOpacity>

                <Text style={styles.hint}>
                  Zapis ustawia w tabeli <Text style={styles.mono}>profiles</Text> pola:{' '}
                  <Text style={styles.mono}>imie</Text>, <Text style={styles.mono}>nazwisko</Text>,{' '}
                  <Text style={styles.mono}>telefon</Text>, <Text style={styles.mono}>profil_wypelniony</Text>.
                </Text>
              </View>
            )}
          </BlurView>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  icon?: keyof typeof Feather.glyphMap;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  const {
    label,
    value,
    onChangeText,
    placeholder,
    icon = 'edit-3',
    keyboardType = 'default',
    autoCapitalize = 'none',
  } = props;

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <View style={styles.iconBox}>
          <Feather name={icon} size={16} color="#5EEAD4" />
        </View>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="rgba(148,163,184,0.55)"
          style={styles.input}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  screen: { flex: 1, backgroundColor: '#050915' },
  bg: { ...StyleSheet.absoluteFillObject },
  glowA: {
    position: 'absolute',
    width: 520,
    height: 520,
    borderRadius: 9999,
    backgroundColor: '#0EA5E9',
    opacity: 0.12,
    top: -140,
    right: -240,
  },
  glowB: {
    position: 'absolute',
    width: 520,
    height: 520,
    borderRadius: 9999,
    backgroundColor: '#5EEAD4',
    opacity: 0.1,
    bottom: -260,
    left: -220,
  },
  glowC: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 9999,
    backgroundColor: '#22C55E',
    opacity: 0.06,
    top: 240,
    left: -160,
  },

  container: { paddingTop: 42, paddingHorizontal: 16, paddingBottom: 24 },

  kicker: {
    textAlign: 'center',
    color: 'rgba(94,234,212,0.9)',
    fontSize: 12,
    letterSpacing: 2.8,
    fontWeight: '900',
    marginBottom: 8,
  },
  title: {
    textAlign: 'center',
    color: '#F8FAFC',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1,
  },
  sub: {
    textAlign: 'center',
    color: '#94A3B8',
    marginTop: 8,
    marginBottom: 14,
    lineHeight: 20,
  },

  card: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(8,14,30,0.35)',
    overflow: 'hidden',
    padding: 16,
  },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: {
    width: 42,
    height: 42,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  namePreview: { color: '#F8FAFC', fontSize: 16, fontWeight: '900' },
  email: { color: 'rgba(148,163,184,0.85)', marginTop: 2 },

  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 14,
  },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  loadingText: { color: '#94A3B8' },

  form: { gap: 12 },

  fieldWrap: { gap: 6 },
  label: { color: '#CBD5E1', fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(94,234,212,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.18)',
  },
  input: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
    paddingVertical: 4,
  },

  cta: {
    marginTop: 6,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#5EEAD4',
  },
  ctaDisabled: { opacity: 0.65 },
  ctaText: { color: '#071818', fontSize: 15, fontWeight: '900', letterSpacing: 0.4 },

  hint: { marginTop: 10, color: 'rgba(148,163,184,0.85)', fontSize: 12, lineHeight: 18 },
  mono: { color: '#E2E8F0', fontWeight: '900' },
});
