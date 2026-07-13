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
import { forceLoggedOutAuthSnapshot } from '../../../hooks/useSupabaseAuth';
import { supabase } from '../../../lib/supabase';
import { getUserWithTimeout } from '../../../lib/supabaseTimeout';
import { getFriendlyErrorMessage } from '../../../lib/errorMessages';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton, AppInput, PlaceAutocomplete } from '../../../src/ui/components';
import { isAppleAuthUser } from '../../../src/services/auth/appleAuth';
import { getPlaceLocalityName, type PlaceSuggestion } from '../../../src/services/geocoding/places';
import { getAppLocale, getDefaultCountry } from '../../../lib/i18n';
import { useOnlineActionGuard } from '../../../src/services/network/NetworkStatusProvider';

const BG = '#000000';
const NEON = '#25F0C8';
const APP_LOGO = require('../../assets/logo.png');
const INVESTMENT_NAME_MAX_LENGTH = 18;

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

export default function OnboardingInvestmentScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation('investment');
  const ensureOnlineAction = useOnlineActionGuard();
  const insets = useSafeAreaInsets();
  const topPad = (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0) + 2;

  const locale = useMemo(
    () => getAppLocale(i18n.resolvedLanguage || i18n.language),
    [i18n.language, i18n.resolvedLanguage]
  );
  const defaultCountryCode = useMemo(
    () => getDefaultCountry(i18n.resolvedLanguage || i18n.language),
    [i18n.language, i18n.resolvedLanguage]
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [userId, setUserId] = useState<string | null>(null);
  const [appleUser, setAppleUser] = useState(false);
  const [nazwa, setNazwa] = useState('');
  const [lokalizacja, setLokalizacja] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<PlaceSuggestion | null>(null);
  const [savedLegacyLocation, setSavedLegacyLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
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
      setLoadError(null);
      try {
        const user = await getUserWithTimeout();
        if (!user) {
          if (alive) setLoadError(t('alerts.noSession'));
          if (alive) setLoading(false);
          return;
        }

        setAppleUser(isAppleAuthUser(user));
        let { data, error } = await supabase
          .from('inwestycje')
          .select('nazwa, lokalizacja, place_name, location_city, location_country, latitude, longitude, data_start, data_koniec')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          const fallback = await supabase
            .from('inwestycje')
            .select('nazwa, lokalizacja, data_start, data_koniec')
            .eq('user_id', user.id)
            .maybeSingle();

          if (fallback.error) throw fallback.error;
          data = fallback.data as any;
        }

        if (!alive) return;

        setUserId(user.id);
        setNazwa(data?.nazwa ?? '');
        const placeName = data?.place_name ?? data?.lokalizacja ?? '';
        setLokalizacja(data?.lokalizacja ?? placeName);
        if (data?.place_name && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
          setSelectedPlace({
            id: `saved-${data.latitude}-${data.longitude}`,
            placeName: data.place_name,
            city: data.location_city ?? null,
            country: data.location_country ?? null,
            latitude: data.latitude,
            longitude: data.longitude,
          });
          setSavedLegacyLocation(false);
        } else {
          setSelectedPlace(null);
          setSavedLegacyLocation(Boolean(placeName || data?.lokalizacja));
        }
        setDataStartISO(data?.data_start ?? '');
        setDataKoniecISO(data?.data_koniec ?? '');
      } catch (e: any) {
        if (!alive) return;
        const message = getFriendlyErrorMessage(e, t, 'alerts.loadFailed');
        setLoadError(message);
        Alert.alert(t('alerts.errorTitle'), message);
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, [t, reloadToken]);

  if (!loading && loadError) {
    return (
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View pointerEvents="none" style={styles.bg} />
        <View style={[styles.content, styles.errorState]}>
          <Image source={APP_LOGO} style={styles.logo} resizeMode="contain" />
          <BlurView intensity={18} tint="dark" style={styles.card}>
            <Text style={styles.title}>{t('alerts.errorTitle')}</Text>
            <Text style={styles.loadingText}>{loadError}</Text>
            <AppButton
              title={t('retry', { ns: 'common' })}
              onPress={() => setReloadToken((current) => current + 1)}
              style={styles.primaryBtn}
            />
            <AppButton
              title={t('alerts.logoutAction', { ns: 'onboarding' })}
              variant="secondary"
                onPress={async () => {
                  try {
                    forceLoggedOutAuthSnapshot();
                    await supabase.auth.signOut();
                  } finally {
                    router.replace('/(auth)/welcome');
                }
              }}
              style={styles.primaryBtn}
            />
          </BlurView>
        </View>
      </KeyboardAvoidingView>
    );
  }

  const openPicker = (which: 'start' | 'koniec') => {
    const startDate = parseISODate(dataStartISO);
    const endDate = parseISODate(dataKoniecISO);
    const initial =
      which === 'start'
        ? startDate ?? new Date()
        : endDate ?? new Date();
    const constrainedInitial =
      which === 'start' && endDate && initial > endDate
        ? endDate
        : which === 'koniec' && startDate && initial < startDate
          ? startDate
          : initial;
    setTempDate(constrainedInitial);
    setPickerOpen(which);
  };

  const closePicker = () => setPickerOpen(null);

  const confirmPicker = () => {
    const selectedISO = toISODate(tempDate);
    if (pickerOpen === 'start') {
      if (dataKoniecISO && selectedISO > dataKoniecISO) {
        Alert.alert(
          t('alerts.errorTitle'),
          t('alerts.startAfterEnd')
        );
        return;
      }
      setDataStartISO(selectedISO);
    }
    if (pickerOpen === 'koniec') {
      if (dataStartISO && selectedISO < dataStartISO) {
        Alert.alert(
          t('alerts.errorTitle'),
          t('alerts.endBeforeStart')
        );
        return;
      }
      setDataKoniecISO(selectedISO);
    }
    closePicker();
  };

  const handleSave = async () => {
    if (!userId || saving) return;
    if (!ensureOnlineAction('Zapis inwestycji wymaga internetu. Sprawdź połączenie i spróbuj ponownie.')) return;

    const trimmedName = nazwa.trim();

    if (!trimmedName) {
      Alert.alert(t('alerts.errorTitle'), t('alerts.nameRequired'));
      return;
    }

    if (trimmedName.length > INVESTMENT_NAME_MAX_LENGTH) {
      Alert.alert(
        t('alerts.errorTitle'),
        t('alerts.nameTooLong')
      );
      return;
    }

    if (!selectedPlace && !savedLegacyLocation) {
      const message = t('alerts.selectLocationFromList');
      setLocationError(message);
      Alert.alert(t('alerts.errorTitle'), message);
      return;
    }

    if (!dataStartISO) {
      Alert.alert(t('alerts.errorTitle'), t('alerts.startDateRequired'));
      return;
    }

    if (!dataKoniecISO) {
      Alert.alert(t('alerts.errorTitle'), t('alerts.endDateRequired'));
      return;
    }

    if (dataStartISO > dataKoniecISO) {
      Alert.alert(
        t('alerts.errorTitle'),
        t('alerts.startAfterEnd')
      );
      return;
    }

    setSaving(true);
    try {
      const legacyLocation = lokalizacja.trim();
      const investmentPayload = {
        user_id: userId,
        nazwa: trimmedName,
        lokalizacja: selectedPlace ? getPlaceLocalityName(selectedPlace) : legacyLocation,
        place_name: selectedPlace ? selectedPlace.placeName : legacyLocation,
        location_city: selectedPlace ? selectedPlace.city : null,
        location_country: selectedPlace ? selectedPlace.country : null,
        latitude: selectedPlace ? selectedPlace.latitude : null,
        longitude: selectedPlace ? selectedPlace.longitude : null,
        data_start: dataStartISO || null,
        data_koniec: dataKoniecISO || null,
        inwestycja_wypelniona: true,
      };

      let investmentRes = await supabase.from('inwestycje').upsert(investmentPayload, { onConflict: 'user_id' });

      if (investmentRes.error && String(investmentRes.error.message || '').includes('schema cache')) {
        investmentRes = await supabase.from('inwestycje').upsert(
          {
            user_id: investmentPayload.user_id,
            nazwa: investmentPayload.nazwa,
            lokalizacja: investmentPayload.lokalizacja,
            data_start: investmentPayload.data_start,
            data_koniec: investmentPayload.data_koniec,
            inwestycja_wypelniona: investmentPayload.inwestycja_wypelniona,
          },
          { onConflict: 'user_id' }
        );
      }

      const profileRes = await supabase.from('profiles').upsert(
          {
            user_id: userId,
            onboarding_step: 'buddy',
            onboarding_completed: false,
          },
          { onConflict: 'user_id' }
        );

      if (investmentRes.error) throw investmentRes.error;
      if (profileRes.error) throw profileRes.error;

      router.replace('/(app)/onboarding');
    } catch (e: any) {
      Alert.alert(
        t('alerts.saveErrorTitle'),
        getFriendlyErrorMessage(e, t, 'alerts.saveFailed')
      );
    } finally {
      setSaving(false);
    }
  };

  const handleBack = async () => {
    if (!userId || saving) {
      router.replace(appleUser ? '/(app)/onboarding' : '/(app)/onboarding/profile');
      return;
    }
    if (!ensureOnlineAction('Zmiana kroku onboardingu wymaga internetu. Sprawdź połączenie i spróbuj ponownie.')) return;

    try {
      await supabase.from('profiles').upsert(
        {
          user_id: userId,
          onboarding_step: appleUser ? 'budget' : 'profile',
          onboarding_completed: false,
        },
        { onConflict: 'user_id' }
      );
    } catch {}

    router.replace(appleUser ? '/(app)/onboarding' : '/(app)/onboarding/profile');
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View pointerEvents="none" style={styles.bg} />
        {appleUser ? (
            <TouchableOpacity
              onPress={async () => {
                forceLoggedOutAuthSnapshot();
                await supabase.auth.signOut();
                router.replace('/(auth)/welcome');
              }}
            activeOpacity={0.88}
            style={styles.logoutBadge}
          >
            <Feather name="log-out" size={15} color="#FFFFFF" />
          </TouchableOpacity>
        ) : null}
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: topPad, paddingBottom: Math.max(44, insets.bottom + 40) },
          ]}
          keyboardShouldPersistTaps="handled"
          scrollIndicatorInsets={{ bottom: insets.bottom + 12 }}
          alwaysBounceVertical
          showsVerticalScrollIndicator={false}
        >
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
                <Field
                  label={`${t('form.nameLabel')} *`}
                  value={nazwa}
                  onChangeText={setNazwa}
                  placeholder={t('form.namePlaceholder')}
                  maxLength={INVESTMENT_NAME_MAX_LENGTH}
                />
                <PlaceAutocomplete
                  label={`${t('form.locationLabel')} *`}
                  value={lokalizacja}
                  onChangeText={(value) => {
                    setLokalizacja(value);
                    setSelectedPlace(null);
                    setSavedLegacyLocation(false);
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
                  disabled={saving}
                  error={locationError}
                  showSelectedDetails={false}
                />

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
                  title={saving ? t('actions.saving') : t('actions.saveAndContinue')}
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
                  maximumDate={pickerOpen === 'start' ? parseISODate(dataKoniecISO) ?? undefined : undefined}
                  minimumDate={pickerOpen === 'koniec' ? parseISODate(dataStartISO) ?? undefined : undefined}
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
  maxLength?: number;
}) {
  const { label, value, onChangeText, placeholder, maxLength } = props;

  return (
    <AppInput
      label={label}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      maxLength={maxLength}
      containerStyle={styles.fieldBlock}
      style={styles.input}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: BG },
  content: {
    paddingHorizontal: 20,
  },
  errorState: {
    justifyContent: 'center',
    alignItems: 'stretch',
    paddingTop: 0,
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
  logoutBadge: {
    position: 'absolute',
    right: 16,
    top: 16,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(220,38,38,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
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
    marginTop: 10,
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
