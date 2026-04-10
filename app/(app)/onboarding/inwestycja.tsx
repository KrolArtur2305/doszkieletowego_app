import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useTranslation } from 'react-i18next';

const BG = '#000000';
const ACCENT = '#19705C';
const NEON = '#25F0C8';

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

function uiLocaleFromLang(lang?: string) {
  const base = (lang || 'en').split('-')[0];
  const map: Record<string, string> = { pl: 'pl-PL', en: 'en-US', de: 'de-DE' };
  return map[base] || 'en-US';
}

function toBudgetNumber(value: string) {
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export default function OnboardingInvestmentScreen() {
  const router = useRouter();
  const { i18n } = useTranslation();

  const locale = useMemo(() => uiLocaleFromLang(i18n.resolvedLanguage || i18n.language), [i18n.language, i18n.resolvedLanguage]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [nazwa, setNazwa] = useState('');
  const [lokalizacja, setLokalizacja] = useState('');
  const [dataStartISO, setDataStartISO] = useState('');
  const [dataKoniecISO, setDataKoniecISO] = useState('');
  const [budzet, setBudzet] = useState('');

  const [pickerOpen, setPickerOpen] = useState<null | 'start' | 'koniec'>(null);
  const [tempDate, setTempDate] = useState<Date>(new Date());

  const startDisplay = useMemo(() => {
    const dt = parseISODate(dataStartISO);
    return dt ? formatPL(dt) : '';
  }, [dataStartISO]);

  const koniecDisplay = useMemo(() => {
    const dt = parseISODate(dataKoniecISO);
    return dt ? formatPL(dt) : '';
  }, [dataKoniecISO]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      try {
        const { data: userRes, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userRes?.user) {
          if (alive) setLoading(false);
          return;
        }

        const user = userRes.user;
        const { data } = await supabase
          .from('inwestycje')
          .select('nazwa, lokalizacja, data_start, data_koniec, budzet')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!alive) return;

        setUserId(user.id);
        setNazwa(data?.nazwa ?? '');
        setLokalizacja(data?.lokalizacja ?? '');
        setDataStartISO(data?.data_start ?? '');
        setDataKoniecISO(data?.data_koniec ?? '');
        setBudzet(data?.budzet !== null && data?.budzet !== undefined ? String(data.budzet) : '');
      } catch (e: any) {
        Alert.alert('Błąd', e?.message ?? 'Nie udało się pobrać inwestycji.');
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, []);

  const openPicker = (which: 'start' | 'koniec') => {
    const initial =
      which === 'start'
        ? parseISODate(dataStartISO) ?? new Date()
        : parseISODate(dataKoniecISO) ?? new Date();
    setTempDate(initial);
    setPickerOpen(which);
  };

  const closePicker = () => setPickerOpen(null);

  const confirmPicker = () => {
    if (pickerOpen === 'start') setDataStartISO(toISODate(tempDate));
    if (pickerOpen === 'koniec') setDataKoniecISO(toISODate(tempDate));
    closePicker();
  };

  const handleSave = async () => {
    if (!userId || saving) return;

    const budget = toBudgetNumber(budzet);
    const trimmedName = nazwa.trim();
    const trimmedLocation = lokalizacja.trim();

    if (!trimmedName) {
      Alert.alert('Błąd', 'Podaj nazwę inwestycji.');
      return;
    }

    if (!trimmedLocation) {
      Alert.alert('Błąd', 'Podaj lokalizację inwestycji.');
      return;
    }

    if (budget !== null && budget < 0) {
      Alert.alert('Błąd', 'Budżet nie może być ujemny.');
      return;
    }

    setSaving(true);
    try {
      const [investmentRes, profileRes] = await Promise.all([
        supabase.from('inwestycje').upsert(
          {
            user_id: userId,
            nazwa: trimmedName,
            lokalizacja: trimmedLocation,
            data_start: dataStartISO || null,
            data_koniec: dataKoniecISO || null,
            budzet: budget,
            inwestycja_wypelniona: true,
          },
          { onConflict: 'user_id' }
        ),
        supabase.from('profiles').upsert(
          {
            user_id: userId,
            onboarding_step: 'done',
            onboarding_completed: true,
          },
          { onConflict: 'user_id' }
        ),
      ]);

      if (investmentRes.error) throw investmentRes.error;
      if (profileRes.error) throw profileRes.error;

      router.replace('/(app)/(tabs)/dashboard');
    } catch (e: any) {
      Alert.alert('Błąd', e?.message ?? 'Nie udało się zapisać inwestycji.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View pointerEvents="none" style={styles.bg} />
        <View pointerEvents="none" style={styles.glowTop} />
        <View pointerEvents="none" style={styles.glowBottom} />

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Inwestycja</Text>

          <BlurView intensity={18} tint="dark" style={styles.card}>
            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={NEON} />
                <Text style={styles.loadingText}>Ładuję inwestycję...</Text>
              </View>
            ) : (
              <>
                <Field label="Nazwa inwestycji *" value={nazwa} onChangeText={setNazwa} placeholder="np. Dom pod Krakowem" icon="home" />
                <Field label="Lokalizacja *" value={lokalizacja} onChangeText={setLokalizacja} placeholder="np. Wieliczka" icon="map-pin" />

                <View style={styles.row}>
                  <View style={[styles.fieldBlock, { flex: 1 }]}>
                    <Text style={styles.fieldLabel}>Data startu</Text>
                    <TouchableOpacity style={styles.pickerWrap} onPress={() => openPicker('start')} activeOpacity={0.88}>
                      <Feather name="calendar" size={16} color="rgba(37,240,200,0.55)" />
                      <Text style={styles.pickerText}>{startDisplay || 'Wybierz datę'}</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={{ width: 10 }} />

                  <View style={[styles.fieldBlock, { flex: 1 }]}>
                    <Text style={styles.fieldLabel}>Data końca</Text>
                    <TouchableOpacity style={styles.pickerWrap} onPress={() => openPicker('koniec')} activeOpacity={0.88}>
                      <Feather name="calendar" size={16} color="rgba(37,240,200,0.55)" />
                      <Text style={styles.pickerText}>{koniecDisplay || 'Wybierz datę'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>Planowany budżet</Text>
                  <View style={styles.inputWrap}>
                    <Text style={styles.prefix}>PLN</Text>
                    <TextInput
                      value={budzet}
                      onChangeText={setBudzet}
                      placeholder="np. 450000"
                      placeholderTextColor="rgba(255,255,255,0.26)"
                      keyboardType="numeric"
                      style={styles.input}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                  activeOpacity={0.9}
                >
                  {saving ? <ActivityIndicator color="#0B1120" /> : <Text style={styles.primaryBtnText}>Zapisz i przejdź do aplikacji</Text>}
                </TouchableOpacity>
              </>
            )}
          </BlurView>
        </ScrollView>

        <Modal transparent visible={pickerOpen !== null} animationType="fade" onRequestClose={closePicker}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                {pickerOpen === 'start' ? 'Wybierz datę startu' : 'Wybierz datę końca'}
              </Text>

              <View style={styles.modalPickerWrap}>
                <DateTimePicker
                  value={tempDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                  locale={locale}
                  themeVariant="dark"
                  onChange={(_event, date) => {
                    if (date) setTempDate(date);
                  }}
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalBtnGhost} onPress={closePicker} activeOpacity={0.85}>
                  <Text style={styles.modalBtnGhostText}>Anuluj</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtnPrimary} onPress={confirmPicker} activeOpacity={0.85}>
                  <Text style={styles.modalBtnPrimaryText}>Zapisz</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  icon?: keyof typeof Feather.glyphMap;
}) {
  const { label, value, onChangeText, placeholder, icon = 'edit-3' } = props;

  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        <Feather name={icon} size={16} color="rgba(37,240,200,0.55)" />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="rgba(255,255,255,0.26)"
          style={styles.input}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: BG },
  glowTop: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 999,
    backgroundColor: ACCENT,
    opacity: 0.12,
    top: -180,
    right: -120,
  },
  glowBottom: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 999,
    backgroundColor: NEON,
    opacity: 0.04,
    bottom: -120,
    left: -120,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 34,
    paddingBottom: 44,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: -0.4,
    marginBottom: 22,
    textAlign: 'center',
  },
  card: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  loadingWrap: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.56)',
    fontSize: 13,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  fieldBlock: {
    marginBottom: 14,
  },
  fieldLabel: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  prefix: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  pickerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pickerText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  primaryBtn: {
    marginTop: 6,
    minHeight: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NEON,
  },
  primaryBtnDisabled: {
    opacity: 0.68,
  },
  primaryBtnText: {
    color: '#0B1120',
    fontSize: 15,
    fontWeight: '900',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    borderRadius: 22,
    backgroundColor: '#0B0F14',
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 10,
  },
  modalPickerWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0B0F14',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  modalBtnGhost: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  modalBtnGhostText: {
    color: '#F8FAFC',
    fontWeight: '900',
  },
  modalBtnPrimary: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#5EEAD4',
  },
  modalBtnPrimaryText: {
    color: '#071818',
    fontWeight: '900',
  },
});
