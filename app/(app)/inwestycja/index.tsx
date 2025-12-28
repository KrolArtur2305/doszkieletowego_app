import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
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
import DateTimePicker from '@react-native-community/datetimepicker';

import { supabase } from '../../../supabase';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function formatPL(d: Date) {
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

function parseISODate(value: string) {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export default function InwestycjaScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [nazwa, setNazwa] = useState('');
  const [lokalizacja, setLokalizacja] = useState('');

  const [dataStartISO, setDataStartISO] = useState('');
  const [dataKoniecISO, setDataKoniecISO] = useState('');

  const startDisplay = useMemo(() => {
    const dt = parseISODate(dataStartISO);
    return dt ? formatPL(dt) : '';
  }, [dataStartISO]);

  const koniecDisplay = useMemo(() => {
    const dt = parseISODate(dataKoniecISO);
    return dt ? formatPL(dt) : '';
  }, [dataKoniecISO]);

  const [budzet, setBudzet] = useState('');

  const budgetNumber = useMemo(() => {
    const cleaned = budzet.replace(/\s/g, '').replace(',', '.');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }, [budzet]);

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showKoniecPicker, setShowKoniecPicker] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      try {
        const { data: userRes, error: userErr } = await supabase.auth.getUser();
        console.log('[INV] init getUser', { hasUser: !!userRes?.user, userErr });

        if (!alive) return;

        if (userErr || !userRes?.user) {
          setLoading(false);
          return;
        }

        const user = userRes.user;

        const { data, error } = await supabase
          .from('inwestycje')
          .select('nazwa, lokalizacja, data_start, data_koniec, budzet, inwestycja_wypelniona')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();

        console.log('[INV] fetch inwestycje', { data, error });

        if (!alive) return;

        if (data) {
          setNazwa(data.nazwa ?? '');
          setLokalizacja(data.lokalizacja ?? '');
          setDataStartISO(data.data_start ?? '');
          setDataKoniecISO(data.data_koniec ?? '');
          setBudzet(data.budzet !== null && data.budzet !== undefined ? String(data.budzet) : '');
        }
      } catch (e) {
        console.log('[INV] init exception', e);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const handleSaveAndContinue = async () => {
    try {
      console.log('[INV] CLICK');

      if (saving) return;

      const n = nazwa.trim();
      const loc = lokalizacja.trim();

      if (!n) {
        Alert.alert('Uzupełnij dane', 'Nazwa inwestycji jest wymagana, aby kontynuować.');
        return;
      }

      if (!loc) {
        Alert.alert('Uzupełnij dane', 'Lokalizacja jest wymagana, aby kontynuować.');
        return;
      }

      if (budgetNumber !== null && budgetNumber < 0) {
        Alert.alert('Nieprawidłowy budżet', 'Budżet nie może być ujemny.');
        return;
      }

      setSaving(true);

      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      console.log('[INV] getUser(save)', { hasUser: !!userRes?.user, userErr });

      if (userErr || !userRes?.user) {
        Alert.alert('Błąd', 'Brak użytkownika. Zaloguj się ponownie.');
        return;
      }

      const user = userRes.user;

      const payload: any = {
        user_id: user.id,
        nazwa: n,
        lokalizacja: loc,
        data_start: dataStartISO || null,
        data_koniec: dataKoniecISO || null,
        inwestycja_wypelniona: true,
      };

      if (budgetNumber !== null) payload.budzet = budgetNumber;

      console.log('[INV] upsert payload', payload);

      const { data, error } = await supabase
        .from('inwestycje')
        .upsert(payload, { onConflict: 'user_id' })
        .select('user_id, inwestycja_wypelniona')
        .maybeSingle();

      console.log('[INV] upsert result', { data, error });

      if (error) {
        Alert.alert('Błąd zapisu', error.message);
        return;
      }

      console.log('[INV] redirect -> /(app)/(tabs)/dashboard');
      router.replace('/(app)/(tabs)/dashboard');
    } catch (e: any) {
      console.log('[INV] exception', e);
      Alert.alert('Błąd', e?.message ?? 'Coś poszło nie tak.');
    } finally {
      setSaving(false);
    }
  };

  const onPickStart = (_event: any, selected?: Date) => {
    setShowStartPicker(false);
    if (!selected) return;
    setDataStartISO(toISODate(selected));
  };

  const onPickKoniec = (_event: any, selected?: Date) => {
    setShowKoniecPicker(false);
    if (!selected) return;
    setDataKoniecISO(toISODate(selected));
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.screen}>
        {/* Poświaty w tle */}
        <View pointerEvents="none" style={styles.bg}>
          <View style={styles.glowA} />
          <View style={styles.glowB} />
          <View style={styles.glowC} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Logo trochę niżej */}
          <View style={styles.logoWrap}>
            <Image source={require('../../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
          </View>

          <Text style={styles.header}>INWESTYCJA</Text>
          <Text style={styles.headerSub}>Uzupełnij dane inwestycji.</Text>

          <BlurView intensity={85} tint="dark" style={styles.card}>
            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Nazwa inwestycji *</Text>
                <View style={styles.inputWrap}>
                  <Feather name="home" color="rgba(148,163,184,0.95)" size={16} />
                  <TextInput
                    value={nazwa}
                    onChangeText={setNazwa}
                    placeholder="np. Dom w lesie"
                    placeholderTextColor="rgba(148,163,184,0.7)"
                    style={styles.input}
                    editable={!loading && !saving}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Lokalizacja *</Text>
                <View style={styles.inputWrap}>
                  <Feather name="map-pin" color="rgba(148,163,184,0.95)" size={16} />
                  <TextInput
                    value={lokalizacja}
                    onChangeText={setLokalizacja}
                    placeholder="np. Kluczewsko"
                    placeholderTextColor="rgba(148,163,184,0.7)"
                    style={styles.input}
                    editable={!loading && !saving}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Data startu</Text>
                  <View style={styles.inputWrap}>
                    <Text style={[styles.input, { paddingVertical: 0 }]}>{startDisplay || 'DD.MM.RRRR'}</Text>
                    <TouchableOpacity
                      onPress={() => setShowStartPicker(true)}
                      disabled={loading || saving}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.iconBtn}
                    >
                      <Feather name="calendar" color="rgba(148,163,184,0.95)" size={18} />
                    </TouchableOpacity>
                  </View>

                  {showStartPicker && (
                    <DateTimePicker
                      value={parseISODate(dataStartISO) ?? new Date()}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={onPickStart}
                    />
                  )}
                </View>

                <View style={{ width: 12 }} />

                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Data zakończenia</Text>
                  <View style={styles.inputWrap}>
                    <Text style={[styles.input, { paddingVertical: 0 }]}>{koniecDisplay || 'DD.MM.RRRR'}</Text>
                    <TouchableOpacity
                      onPress={() => setShowKoniecPicker(true)}
                      disabled={loading || saving}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.iconBtn}
                    >
                      <Feather name="calendar" color="rgba(148,163,184,0.95)" size={18} />
                    </TouchableOpacity>
                  </View>

                  {showKoniecPicker && (
                    <DateTimePicker
                      value={parseISODate(dataKoniecISO) ?? new Date()}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={onPickKoniec}
                    />
                  )}
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Planowany budżet (PLN)</Text>
                <View style={styles.inputWrap}>
                  <Text style={styles.prefix}>PLN</Text>
                  <TextInput
                    value={budzet}
                    onChangeText={setBudzet}
                    placeholder="np. 400000"
                    placeholderTextColor="rgba(148,163,184,0.7)"
                    style={[styles.input, { fontWeight: '800' }]}
                    editable={!loading && !saving}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.ctaButton, (loading || saving) && styles.ctaButtonDisabled]}
              onPress={handleSaveAndContinue}
              disabled={loading || saving}
              activeOpacity={0.85}
            >
              <Text style={styles.ctaText}>{saving ? 'Zapisywanie…' : 'Zapisz i przejdź dalej'}</Text>
            </TouchableOpacity>
          </BlurView>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
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
    top: -120,
    right: -220,
  },
  glowB: {
    position: 'absolute',
    width: 520,
    height: 520,
    borderRadius: 9999,
    backgroundColor: '#5EEAD4',
    opacity: 0.10,
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

  content: { paddingTop: 26, paddingHorizontal: 16, paddingBottom: 140 },

  logoWrap: { alignItems: 'center', marginBottom: 10, marginTop: 18 },
  logo: { width: 140, height: 44, opacity: 0.95 },

  header: {
    textAlign: 'center',
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 4,
  },
  headerSub: {
    textAlign: 'center',
    color: '#94A3B8',
    marginTop: 8,
    marginBottom: 14,
    lineHeight: 20,
  },

  card: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: 18,
    backgroundColor: 'rgba(8,14,30,0.35)',
    overflow: 'hidden',
  },

  form: { gap: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },

  field: { gap: 8 },
  fieldLabel: { color: '#94A3B8', fontSize: 13 },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  input: { flex: 1, color: '#F8FAFC', fontSize: 16, fontWeight: '700' },

  iconBtn: { paddingLeft: 6, paddingVertical: 2 },

  prefix: {
    color: 'rgba(148,163,184,0.95)',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
  },

  ctaButton: {
    marginTop: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.45)',
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: 'rgba(94,234,212,0.12)',
  },
  ctaButtonDisabled: { opacity: 0.65 },
  ctaText: { color: '#5EEAD4', fontWeight: '900', textAlign: 'center' },
});

