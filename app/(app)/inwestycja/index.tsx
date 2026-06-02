import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
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
import { AppButton, AppHeader, AppInput, PlaceAutocomplete } from '../../../src/ui/components';
import { getPlaceLocalityName, type PlaceSuggestion } from '../../../src/services/geocoding/places';
import { normalizeBuildType, remapStageCodeForBuildType } from '../../../lib/buildWorkflow';

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

function defaultCountryFromLang(lang?: string) {
  const base = (lang || 'pl').split('-')[0];
  if (base === 'de') return 'de';
  if (base === 'en') return 'gb';
  return 'pl';
}

export default function InwestycjaScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation('investment');

  const locale = useMemo(() => uiLocaleFromLang(i18n.resolvedLanguage || i18n.language), [i18n.language, i18n.resolvedLanguage]);
  const defaultCountryCode = useMemo(
    () => defaultCountryFromLang(i18n.resolvedLanguage || i18n.language),
    [i18n.language, i18n.resolvedLanguage]
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [nazwa, setNazwa] = useState('');
  const [buildType, setBuildType] = useState('murowany');
  const [initialBuildType, setInitialBuildType] = useState('murowany');
  const [lokalizacja, setLokalizacja] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<PlaceSuggestion | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [currentStageCode, setCurrentStageCode] = useState('');

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

        const [investmentRes, profileRes] = await Promise.all([
          supabase
            .from('inwestycje')
            .select('nazwa, lokalizacja, place_name, location_city, location_country, latitude, longitude, data_start, data_koniec, budzet, inwestycja_wypelniona')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle(),
          supabase
            .from('profiles')
            .select('build_type, current_stage_code')
            .eq('user_id', user.id)
            .maybeSingle(),
        ]);

        let { data, error } = investmentRes;

        if (error) {
          const fallback = await supabase
            .from('inwestycje')
            .select('nazwa, lokalizacja, data_start, data_koniec, budzet, inwestycja_wypelniona')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();

          data = fallback.data as any;
        }

        if (!alive) return;

        if (data) {
          setNazwa(data.nazwa ?? '');
          const placeName = data.place_name ?? data.lokalizacja ?? '';
          setLokalizacja(data.lokalizacja ?? placeName);
          if (data.place_name && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
            setSelectedPlace({
              id: `saved-${data.latitude}-${data.longitude}`,
              placeName: data.place_name,
              city: data.location_city ?? null,
              country: data.location_country ?? null,
              latitude: data.latitude,
              longitude: data.longitude,
            });
          }
          setDataStartISO(data.data_start ?? '');
          setDataKoniecISO(data.data_koniec ?? '');
          setBudzet(data.budzet !== null && data.budzet !== undefined ? String(data.budzet) : '');
        }

        const nextBuildType = normalizeBuildType((profileRes.data as any)?.build_type);
        setBuildType(nextBuildType);
        setInitialBuildType(nextBuildType);
        setCurrentStageCode(String((profileRes.data as any)?.current_stage_code ?? '').trim().toUpperCase());
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

      if (!n) {
        Alert.alert(t('alerts.completeDataTitle'), t('alerts.nameRequired'));
        return;
      }

      if (!selectedPlace) {
        const message = t('alerts.selectLocationFromList');
        setLocationError(message);
        Alert.alert(t('alerts.completeDataTitle'), message);
        return;
      }

      if (budgetNumber !== null && budgetNumber < 0) {
        Alert.alert(t('alerts.invalidBudgetTitle'), t('alerts.invalidBudgetMsg'));
        return;
      }

      setSaving(true);

      const { data: userRes, error: userErr } = await supabase.auth.getUser();

      if (userErr || !userRes?.user) {
        Alert.alert(t('alerts.errorTitle'), t('alerts.noSession'));
        return;
      }

      const user = userRes.user;

      const buildTypeChanged = buildType !== initialBuildType;
      if (buildTypeChanged) {
        setSaving(false);
        Alert.alert(
          t('alerts.changeBuildTypeTitle'),
          t('alerts.changeBuildTypeMsg'),
          [
            { text: t('actions.cancel'), style: 'cancel' },
            {
              text: t('actions.changeTypeConfirm'),
              style: 'destructive',
              onPress: async () => {
                setSaving(true);
                await persistInvestmentAndProfile(user.id);
              },
            },
          ]
        );
        return;
      }

      await persistInvestmentAndProfile(user.id);
    } catch (e: any) {
      Alert.alert(t('alerts.errorTitle'), e?.message ?? t('alerts.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const persistInvestmentAndProfile = async (userIdValue: string) => {
    const payload: {
      user_id: string;
      nazwa: string;
      lokalizacja: string;
      place_name: string;
      location_city: string | null;
      location_country: string | null;
      latitude: number;
      longitude: number;
      data_start: string | null;
      data_koniec: string | null;
      budzet: number | null;
      inwestycja_wypelniona: boolean;
    } = {
      user_id: userIdValue,
      nazwa: nazwa.trim(),
      lokalizacja: getPlaceLocalityName(selectedPlace as PlaceSuggestion),
      place_name: (selectedPlace as PlaceSuggestion).placeName,
      location_city: (selectedPlace as PlaceSuggestion).city,
      location_country: (selectedPlace as PlaceSuggestion).country,
      latitude: (selectedPlace as PlaceSuggestion).latitude,
      longitude: (selectedPlace as PlaceSuggestion).longitude,
      data_start: dataStartISO || null,
      data_koniec: dataKoniecISO || null,
      budzet: budgetNumber,
      inwestycja_wypelniona: true,
    };

    let { data, error } = await supabase
      .from('inwestycje')
      .upsert(payload, { onConflict: 'user_id' })
      .select('user_id, inwestycja_wypelniona')
      .maybeSingle();

      if (error && String(error.message || '').includes('schema cache')) {
        const legacyPayload = {
          user_id: payload.user_id,
          nazwa: payload.nazwa,
          lokalizacja: payload.lokalizacja,
          data_start: payload.data_start,
          data_koniec: payload.data_koniec,
          budzet: payload.budzet,
          inwestycja_wypelniona: payload.inwestycja_wypelniona,
        };

        const fallback = await supabase
          .from('inwestycje')
          .upsert(legacyPayload, { onConflict: 'user_id' })
          .select('user_id, inwestycja_wypelniona')
          .maybeSingle();

        data = fallback.data;
        error = fallback.error;
      }

      if (error) {
        Alert.alert(t('alerts.saveErrorTitle'), error.message);
        return;
      }

      const nextCurrentStageCode = remapStageCodeForBuildType(currentStageCode, buildType);
      const profileRes = await supabase
        .from('profiles')
        .upsert(
          {
            user_id: userIdValue,
            build_type: buildType,
            current_stage_code: nextCurrentStageCode,
          },
          { onConflict: 'user_id' }
        );

      if (profileRes.error) {
        Alert.alert(t('alerts.saveErrorTitle'), profileRes.error.message);
        return;
      }

      setInitialBuildType(buildType);

      router.replace('/(app)/(tabs)/dashboard');
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
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AppHeader title={t('screen.title')} style={styles.screenHeader} />

          <BlurView intensity={70} tint="dark" style={styles.card}>
              <View style={styles.form}>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>{t('form.nameLabel')} *</Text>
                <AppInput
                  value={nazwa}
                  onChangeText={setNazwa}
                  placeholder={t('form.namePlaceholder')}
                  editable={!loading && !saving}
                  style={styles.input}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>{t('form.buildTypeLabel')}</Text>
                  <View style={styles.buildTypeRow}>
                    {(['murowany', 'szkieletowy', 'inny'] as const).map((value) => {
                      const active = buildType === value;
                      return (
                        <TouchableOpacity
                          key={value}
                          onPress={() => setBuildType(value)}
                          disabled={loading || saving}
                          activeOpacity={0.85}
                          style={[styles.buildTypeChip, active && styles.buildTypeChipActive]}
                        >
                          <Text style={[styles.buildTypeChipText, active && styles.buildTypeChipTextActive]}>
                            {t(`buildTypes.${value}`)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

              <View style={styles.field}>
                <PlaceAutocomplete
                  label={`${t('form.locationLabel')} *`}
                  value={lokalizacja}
                  onChangeText={(value) => {
                    setLokalizacja(value);
                    setSelectedPlace(null);
                    setLocationError(null);
                  }}
                  selectedPlace={selectedPlace}
                  onSelect={(place) => {
                    setSelectedPlace(place);
                    setLokalizacja(getPlaceLocalityName(place));
                    setLocationError(null);
                  }}
                  countryLabel={t('form.countryLabel')}
                  defaultCountryCode={defaultCountryCode}
                  placeholder={t('form.locationPlaceholder')}
                  disabled={loading || saving}
                  error={locationError}
                  showSelectedDetails={false}
                />
              </View>

              <View style={styles.row}>
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>{t('form.startLabel')}</Text>
                  <View style={styles.inputWrap}>
                    <Text style={[styles.input, { paddingVertical: 0 }]}>
                      {startDisplay || t('form.datePlaceholder')}
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
                      {koniecDisplay || t('form.datePlaceholder')}
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
                <AppInput
                  value={budzet}
                  onChangeText={setBudzet}
                  placeholder={t('form.plannedBudgetPlaceholder')}
                  editable={!loading && !saving}
                  keyboardType="numeric"
                  style={[styles.input, { fontWeight: '800' }]}
                />
              </View>
            </View>

            <AppButton
              title={saving ? t('actions.saving') : t('actions.saveAndContinue')}
              onPress={handleSaveAndContinue}
              disabled={loading || saving}
              loading={saving}
              style={styles.ctaButton}
            />
          </BlurView>
        </ScrollView>

        {/* ✅ KALENDARZ: modal ciemny + kalendarzowy picker */}
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
                  onChange={(_e, d) => {
                    if (d) setTempDate(d);
                  }}
                />
              </View>

              <View style={styles.modalActions}>
                <AppButton
                  title={t('actions.cancel')}
                  variant="secondary"
                  onPress={closePicker}
                  style={styles.modalBtnGhost}
                />

                <AppButton title={t('actions.save')} onPress={confirmPicker} style={styles.modalBtnPrimary} />
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

  buildTypeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  buildTypeChip: {
    flex: 1,
    minHeight: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  buildTypeChipActive: {
    borderColor: 'rgba(37,240,200,0.55)',
    backgroundColor: 'rgba(20,184,166,0.18)',
  },
  buildTypeChipText: {
    color: 'rgba(226,232,240,0.9)',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  buildTypeChipTextActive: {
    color: '#E8FFFB',
  },

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

  input: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    backgroundColor: '#111',
    borderColor: '#222',
  },

  iconBtn: { paddingLeft: 6, paddingVertical: 2 },

  ctaButton: {
    marginTop: 18,
  },

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
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.14)',
  },
  modalBtnPrimary: {
    flex: 1,
  },
});
