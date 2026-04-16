import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  Modal,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';

import { supabase } from '../../../lib/supabase';
import { AppHeader } from '../../../src/ui/components';

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

export default function InwestycjaScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation('investment');

  const locale = useMemo(() => uiLocaleFromLang(i18n.resolvedLanguage || i18n.language), [i18n.language, i18n.resolvedLanguage]);

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

  // ✅ tylko UI pickera: modal + tymczasowa data
  const [pickerOpen, setPickerOpen] = useState<null | 'start' | 'koniec'>(null);
  const [tempDate, setTempDate] = useState<Date>(new Date());

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      try {
        const { data: userRes, error: userErr } = await supabase.auth.getUser();

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

        if (!alive) return;

        if (data) {
          setNazwa(data.nazwa ?? '');
          setLokalizacja(data.lokalizacja ?? '');
          setDataStartISO(data.data_start ?? '');
          setDataKoniecISO(data.data_koniec ?? '');
          setBudzet(data.budzet !== null && data.budzet !== undefined ? String(data.budzet) : '');
        }
      } catch {
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
      if (saving) return;

      const n = nazwa.trim();
      const loc = lokalizacja.trim();

      if (!n) {
        Alert.alert(t('alerts.completeDataTitle'), t('alerts.nameRequired'));
        return;
      }

      if (!loc) {
        Alert.alert(t('alerts.completeDataTitle'), t('alerts.locationRequired', { defaultValue: 'Location is required to continue.' }));
        return;
      }

      if (budgetNumber !== null && budgetNumber < 0) {
        Alert.alert(t('alerts.invalidBudgetTitle', { defaultValue: 'Invalid budget' }), t('alerts.invalidBudgetMsg', { defaultValue: 'Budget cannot be negative.' }));
        return;
      }

      setSaving(true);

      const { data: userRes, error: userErr } = await supabase.auth.getUser();

      if (userErr || !userRes?.user) {
        Alert.alert(t('alerts.errorTitle'), t('alerts.noSession'));
        return;
      }

      const user = userRes.user;

      const payload: {
        user_id: string;
        nazwa: string;
        lokalizacja: string;
        data_start: string | null;
        data_koniec: string | null;
        budzet: number | null;
        inwestycja_wypelniona: boolean;
      } = {
        user_id: user.id,
        nazwa: n,
        lokalizacja: loc,
        data_start: dataStartISO || null,
        data_koniec: dataKoniecISO || null,
        budzet: budgetNumber,
        inwestycja_wypelniona: true,
      };

      const { data, error } = await supabase
        .from('inwestycje')
        .upsert(payload, { onConflict: 'user_id' })
        .select('user_id, inwestycja_wypelniona')
        .maybeSingle();

      if (error) {
        Alert.alert(t('alerts.saveErrorTitle', { defaultValue: 'Save error' }), error.message);
        return;
      }

      router.replace('/(app)/(tabs)/dashboard');
    } catch (e: any) {
      Alert.alert(t('alerts.errorTitle'), e?.message ?? t('alerts.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

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

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.screen}>
        <View pointerEvents="none" style={styles.bg}>
          <View style={styles.glowA} />
          <View style={styles.glowB} />
          <View style={styles.glowC} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AppHeader title={t('screen.title')} style={styles.screenHeader} />

          <BlurView intensity={70} tint="dark" style={styles.card}>
            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('form.nameLabel')} *</Text>
                <View style={styles.inputWrap}>
                  <Feather name="home" color="rgba(148,163,184,0.95)" size={16} />
                  <TextInput
                    value={nazwa}
                    onChangeText={setNazwa}
                    placeholder={t('form.namePlaceholder')}
                    placeholderTextColor="rgba(148,163,184,0.7)"
                    style={styles.input}
                    editable={!loading && !saving}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('form.locationLabel')} *</Text>
                <View style={styles.inputWrap}>
                  <Feather name="map-pin" color="rgba(148,163,184,0.95)" size={16} />
                  <TextInput
                    value={lokalizacja}
                    onChangeText={setLokalizacja}
                    placeholder={t('form.locationPlaceholder')}
                    placeholderTextColor="rgba(148,163,184,0.7)"
                    style={styles.input}
                    editable={!loading && !saving}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>{t('form.startLabel')}</Text>
                  <View style={styles.inputWrap}>
                    <Text style={[styles.input, { paddingVertical: 0 }]}>
                      {startDisplay || t('form.datePlaceholder', { defaultValue: 'DD.MM.YYYY' })}
                    </Text>
                    <TouchableOpacity
                      onPress={() => openPicker('start')}
                      disabled={loading || saving}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.iconBtn}
                    >
                      <Feather name="calendar" color="rgba(148,163,184,0.95)" size={18} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={{ width: 12 }} />

                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>{t('form.endLabel')}</Text>
                  <View style={styles.inputWrap}>
                    <Text style={[styles.input, { paddingVertical: 0 }]}>
                      {koniecDisplay || t('form.datePlaceholder', { defaultValue: 'DD.MM.YYYY' })}
                    </Text>
                    <TouchableOpacity
                      onPress={() => openPicker('koniec')}
                      disabled={loading || saving}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.iconBtn}
                    >
                      <Feather name="calendar" color="rgba(148,163,184,0.95)" size={18} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('form.plannedBudgetLabel')}</Text>
                <View style={styles.inputWrap}>
                  <Text style={styles.prefix}>PLN</Text>
                  <TextInput
                    value={budzet}
                    onChangeText={setBudzet}
                    placeholder={t('form.plannedBudgetPlaceholder')}
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
              <Text style={styles.ctaText}>
                {saving ? t('actions.saving') : t('actions.saveAndContinue')}
              </Text>
            </TouchableOpacity>
          </BlurView>
        </ScrollView>

        {/* ✅ KALENDARZ: modal ciemny + kalendarzowy picker */}
        <Modal transparent visible={pickerOpen !== null} animationType="fade" onRequestClose={closePicker}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                {pickerOpen === 'start' ? t('modal.pickStartTitle', { defaultValue: 'Select start date' }) : t('modal.pickEndTitle', { defaultValue: 'Select end date' })}
              </Text>

              <View style={styles.modalPickerWrap}>
                <DateTimePicker
                  value={tempDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                  locale={locale}
                  themeVariant="dark"
                  onChange={(_e, d) => {
                    if (d) setTempDate(d);
                  }}
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalBtnGhost} onPress={closePicker} activeOpacity={0.85}>
                  <Text style={styles.modalBtnGhostText}>{t('actions.cancel', { defaultValue: 'Cancel' })}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.modalBtnPrimary} onPress={confirmPicker} activeOpacity={0.85}>
                  <Text style={styles.modalBtnPrimaryText}>{t('actions.save')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  screen: { flex: 1, backgroundColor: '#000000' },

  bg: { ...StyleSheet.absoluteFillObject },
  glowA: { position: 'absolute', width: 520, height: 520, borderRadius: 9999, backgroundColor: '#0EA5E9', opacity: 0, top: -120, right: -220 },
  glowB: { position: 'absolute', width: 520, height: 520, borderRadius: 9999, backgroundColor: '#5EEAD4', opacity: 0, bottom: -260, left: -220 },
  glowC: { position: 'absolute', width: 360, height: 360, borderRadius: 9999, backgroundColor: '#22C55E', opacity: 0, top: 240, left: -160 },

  content: { paddingTop: 22, paddingHorizontal: 16, paddingBottom: 140 },
  screenHeader: { marginBottom: 12 },

  card: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 18,
    backgroundColor: 'rgba(0,0,0,0.92)',
    overflow: 'hidden',
  },

  form: { gap: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },

  field: { gap: 8 },
  fieldLabel: { color: 'rgba(156,163,175,0.95)', fontSize: 13 },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222',
    backgroundColor: '#111',
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
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(94,234,212,0.12)',
  },
  ctaButtonDisabled: { opacity: 0.65 },
  ctaText: { color: '#5EEAD4', fontWeight: '900', textAlign: 'center', fontSize: 15 },

  // ---- modal styles ----
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
