import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
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
import { AppButton, AppInput } from '../../../src/ui/components';

const BG = '#000000';
const ACCENT = '#19705C';
const NEON = '#25F0C8';
const APP_LOGO = require('../../assets/logo.png');

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function formatDateForLocale(d: Date, locale: string) {
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
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

export default function OnboardingInvestmentScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation('investment');
  const topPad = (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0) + 2;

  const locale = useMemo(
    () => uiLocaleFromLang(i18n.resolvedLanguage || i18n.language),
    [i18n.language, i18n.resolvedLanguage]
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [nazwa, setNazwa] = useState('');
  const [lokalizacja, setLokalizacja] = useState('');
  const [dataStartISO, setDataStartISO] = useState('');
  const [dataKoniecISO, setDataKoniecISO] = useState('');

  const [pickerOpen, setPickerOpen] = useState<null | 'start' | 'koniec'>(null);
  const [tempDate, setTempDate] = useState<Date>(new Date());

  const startDisplay = useMemo(() => {
    const dt = parseISODate(dataStartISO);
    return dt ? formatDateForLocale(dt, locale) : '';
  }, [dataStartISO, locale]);

  const koniecDisplay = useMemo(() => {
    const dt = parseISODate(dataKoniecISO);
    return dt ? formatDateForLocale(dt, locale) : '';
  }, [dataKoniecISO, locale]);

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
          .select('nazwa, lokalizacja, data_start, data_koniec')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!alive) return;

        setUserId(user.id);
        setNazwa(data?.nazwa ?? '');
        setLokalizacja(data?.lokalizacja ?? '');
        setDataStartISO(data?.data_start ?? '');
        setDataKoniecISO(data?.data_koniec ?? '');
      } catch (e: any) {
        Alert.alert(t('alerts.errorTitle'), e?.message ?? t('alerts.loadFailed'));
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, [t]);

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

    const trimmedName = nazwa.trim();
    const trimmedLocation = lokalizacja.trim();

    if (!trimmedName) {
      Alert.alert(t('alerts.errorTitle'), t('alerts.nameRequired'));
      return;
    }

    if (!trimmedLocation) {
      Alert.alert(t('alerts.errorTitle'), t('alerts.locationRequired'));
      return;
    }

    if (!dataStartISO) {
      Alert.alert(t('alerts.errorTitle'), t('alerts.startDateRequired', { defaultValue: 'Wybierz datę startu.' }));
      return;
    }

    if (!dataKoniecISO) {
      Alert.alert(t('alerts.errorTitle'), t('alerts.endDateRequired', { defaultValue: 'Wybierz datę zakończenia.' }));
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
            inwestycja_wypelniona: true,
          },
          { onConflict: 'user_id' }
        ),
        supabase.from('profiles').upsert(
          {
            user_id: userId,
            onboarding_step: 'buddy',
            onboarding_completed: false,
          },
          { onConflict: 'user_id' }
        ),
      ]);

      if (investmentRes.error) throw investmentRes.error;
      if (profileRes.error) throw profileRes.error;

      router.replace('/(app)/onboarding');
    } catch (e: any) {
      Alert.alert(t('alerts.saveErrorTitle'), e?.message ?? t('alerts.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleBack = async () => {
    if (!userId || saving) {
      router.replace('/(app)/onboarding/profile');
      return;
    }

    try {
      await supabase.from('profiles').upsert(
        {
          user_id: userId,
          onboarding_step: 'profile',
          onboarding_completed: false,
        },
        { onConflict: 'user_id' }
      );
    } catch {}

    router.replace('/(app)/onboarding/profile');
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View pointerEvents="none" style={styles.bg} />
        <View pointerEvents="none" style={styles.glowTop} />
        <View pointerEvents="none" style={styles.glowBottom} />

        <ScrollView contentContainerStyle={[styles.content, { paddingTop: topPad }]} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={handleBack} activeOpacity={0.8} style={styles.backButton}>
            <Feather name="chevron-left" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <Image source={APP_LOGO} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>{t('screen.title')}</Text>

          <BlurView intensity={18} tint="dark" style={styles.card}>
            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={NEON} />
                <Text style={styles.loadingText}>{t('loading')}</Text>
              </View>
            ) : (
              <>
                <Field label={`${t('form.nameLabel')} *`} value={nazwa} onChangeText={setNazwa} placeholder={t('form.namePlaceholder')} />
                <Field label={`${t('form.locationLabel')} *`} value={lokalizacja} onChangeText={setLokalizacja} placeholder={t('form.locationPlaceholder')} />

                <View style={styles.row}>
                  <View style={[styles.fieldBlock, { flex: 1 }]}>
                    <Text style={styles.fieldLabel}>{t('form.startLabel')}</Text>
                    <TouchableOpacity style={styles.pickerWrap} onPress={() => openPicker('start')} activeOpacity={0.88}>
                      <Feather name="calendar" size={16} color="rgba(37,240,200,0.55)" />
                      <Text style={styles.pickerText}>{startDisplay || t('form.datePlaceholder')}</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={{ width: 10 }} />

                  <View style={[styles.fieldBlock, { flex: 1 }]}>
                    <Text style={styles.fieldLabel}>{t('form.endLabel')}</Text>
                    <TouchableOpacity style={styles.pickerWrap} onPress={() => openPicker('koniec')} activeOpacity={0.88}>
                      <Feather name="calendar" size={16} color="rgba(37,240,200,0.55)" />
                      <Text style={styles.pickerText}>{koniecDisplay || t('form.datePlaceholder')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <AppButton
                  title={saving ? t('actions.saving') : 'Zapisz i przejdź dalej'}
                  onPress={handleSave}
                  disabled={saving}
                  loading={saving}
                  style={styles.primaryBtn}
                />
              </>
            )}
          </BlurView>
        </ScrollView>

        <Modal transparent visible={pickerOpen !== null} animationType="fade" onRequestClose={closePicker}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                {pickerOpen === 'start' ? t('modal.pickStartTitle') : t('modal.pickEndTitle')}
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
                <AppButton title={t('actions.cancel')} variant="secondary" onPress={closePicker} style={styles.modalBtnGhost} />
                <AppButton title={t('actions.save')} onPress={confirmPicker} style={styles.modalBtnPrimary} />
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
}) {
  const { label, value, onChangeText, placeholder } = props;

  return (
    <AppInput
      label={label}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      containerStyle={styles.fieldBlock}
      style={styles.input}
    />
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
    paddingBottom: 44,
  },
  backButton: {
    alignSelf: 'flex-start',
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.22)',
    marginBottom: 4,
  },
  logo: {
    width: 172,
    height: 172,
    alignSelf: 'center',
    marginBottom: 0,
  },
  title: {
    color: NEON,
    fontSize: 33,
    fontWeight: '900',
    letterSpacing: -0.4,
    marginBottom: 14,
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
  input: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.08)',
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
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.14)',
  },
  modalBtnPrimary: {
    flex: 1,
  },
});
