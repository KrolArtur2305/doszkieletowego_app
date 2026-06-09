import { useEffect, useState } from 'react';
import {
  Alert,
  Keyboard,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { supabase } from '../../../../lib/supabase';
import {
  CURRENCY_OPTIONS,
  getStoredCurrency,
  setAppCurrency,
  type AppCurrency,
} from '../../../../lib/currency';
import { getStoredUnits, setAppUnits, setUnitsForLanguage, type UnitSystem } from '../../../../lib/units';
import { setAppLanguage, type AppLanguage } from '../../../../lib/i18n';
import { registerPushToken, syncAllTaskReminders } from '../../../../lib/notifications';
import { AppButton, AppInput } from '../../../../src/ui/components';

const NEON = '#25F0C8';
const ACCENT = '#19705C';

function getAppVersionLabel(): string {
  const version =
    Application.nativeApplicationVersion ??
    Constants.expoConfig?.version ??
    'unknown';
  const build =
    Application.nativeBuildVersion ??
    Constants.expoConfig?.ios?.buildNumber ??
    (typeof Constants.expoConfig?.android?.versionCode === 'number'
      ? String(Constants.expoConfig.android.versionCode)
      : null);

  return build ? `${version} (${build})` : version;
}

const LANGUAGES: { key: AppLanguage; labelKey: string; flag: string }[] = [
  { key: 'pl', labelKey: 'appSettings.language.options.pl', flag: '🇵🇱' },
  { key: 'en', labelKey: 'appSettings.language.options.en', flag: '🇬🇧' },
  { key: 'de', labelKey: 'appSettings.language.options.de', flag: '🇩🇪' },
];

export default function UstawieniaAplikacjiScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation(['settings', 'common']);
  const insets = useSafeAreaInsets();
  const topPad = (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 16) + 8;
  const bottomPad = Math.max(60, insets.bottom + 96);
  const appVersionLabel = getAppVersionLabel();

  const activeLang = (i18n.resolvedLanguage || i18n.language) as AppLanguage;

  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifLoading, setNotifLoading] = useState(true);
  const [activeCurrency, setActiveCurrency] = useState<AppCurrency>('PLN');
  const [activeUnits, setActiveUnits] = useState<UnitSystem>('metric');
  const [languageModalOpen, setLanguageModalOpen] = useState(false);
  const [currencyModalOpen, setCurrencyModalOpen] = useState(false);
  const [unitsModalOpen, setUnitsModalOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Notifications.getPermissionsAsync();
      setNotifEnabled(status === 'granted');
      setNotifLoading(false);
    })();
  }, []);

  useEffect(() => {
    let alive = true;
    getStoredCurrency().then((currency) => {
      if (alive) setActiveCurrency(currency);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    getStoredUnits().then((units) => {
      if (alive) setActiveUnits(units);
    });
    return () => {
      alive = false;
    };
  }, []);

  const handleNotifToggle = async (value: boolean) => {
    if (value) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      const status =
        existingStatus === 'granted'
          ? existingStatus
          : (await Notifications.requestPermissionsAsync()).status;

      setNotifEnabled(status === 'granted');

      if (status === 'granted') {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          await registerPushToken(user.id, { requestPermission: false });
          await syncAllTaskReminders(user.id);
        }
      } else {
        Alert.alert(
          t('appSettings.notif.deniedTitle'),
          t('appSettings.notif.deniedMessage')
        );
      }
    } else {
      Alert.alert(
        t('appSettings.notif.disableTitle'),
        t('appSettings.notif.disableMessage')
      );
    }
  };

  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleChangePassword = async () => {
    if (!newPwd || newPwd.length < 8) {
      Alert.alert(
        t('appSettings.password.errorTitle'),
        t('appSettings.password.tooShort')
      );
      return;
    }

    if (newPwd !== confirmPwd) {
      Alert.alert(
        t('appSettings.password.errorTitle'),
        t('appSettings.password.mismatch')
      );
      return;
    }

    setPwdSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;

      setPwdModalOpen(false);
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');

      Alert.alert(
        t('appSettings.password.successTitle'),
        t('appSettings.password.successMessage')
      );
    } catch (e: any) {
      Alert.alert(
        t('appSettings.password.errorTitle'),
        e?.message ?? t('appSettings.password.genericError')
      );
    } finally {
      setPwdSaving(false);
    }
  };

  const selectedLanguage = LANGUAGES.find((lang) => lang.key === activeLang) ?? LANGUAGES[0];
  const selectedCurrency = CURRENCY_OPTIONS.find((option) => option.code === activeCurrency) ?? CURRENCY_OPTIONS[0];

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.bg} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topPad, paddingBottom: bottomPad }]}
        scrollIndicatorInsets={{ bottom: insets.bottom + 76 }}
        alwaysBounceVertical
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.85}>
            <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.70)" />
          </TouchableOpacity>

          <Text style={styles.screenTitle}>
            {t('appSettings.title')}
          </Text>

          <View style={{ width: 40 }} />
        </View>

        <View style={styles.cardOuter}>
          <View style={styles.card}>
            <TouchableOpacity
              activeOpacity={0.86}
              onPress={() => setLanguageModalOpen(true)}
              style={[styles.selectRow, styles.selectRowBorder]}
            >
              <View style={styles.rowIconWrap}>
                <Feather name="globe" size={18} color={ACCENT} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.selectLabel}>{t('appSettings.language.groupLabel')}</Text>
                <Text style={styles.rowTitle}>
                  {selectedLanguage.flag} {t(selectedLanguage.labelKey)}
                </Text>
              </View>
              <Feather name="chevron-down" size={18} color="rgba(255,255,255,0.36)" />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.86}
              onPress={() => setCurrencyModalOpen(true)}
              style={[styles.selectRow, styles.selectRowBorder]}
            >
              <View style={styles.rowIconWrap}>
                <Feather name="dollar-sign" size={18} color={ACCENT} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.selectLabel}>{t('appSettings.currency.groupLabel')}</Text>
                <Text style={styles.rowTitle}>
                  {selectedCurrency.code} · {selectedCurrency.symbol}
                </Text>
              </View>
              <Feather name="chevron-down" size={18} color="rgba(255,255,255,0.36)" />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.86}
              onPress={() => setUnitsModalOpen(true)}
              style={styles.selectRow}
            >
              <View style={styles.rowIconWrap}>
                <Feather name="sliders" size={18} color={ACCENT} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.selectLabel}>{t('appSettings.units.groupLabel')}</Text>
                <Text style={styles.rowTitle}>
                  {t(`appSettings.units.options.${activeUnits}`)}
                </Text>
              </View>
              <Feather name="chevron-down" size={18} color="rgba(255,255,255,0.36)" />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.groupLabel}>
          {t('appSettings.notif.groupLabel')}
        </Text>

        <View style={styles.cardOuter}>
          <BlurView intensity={16} tint="dark" style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowIconWrap}>
                <Feather name="bell" size={18} color={ACCENT} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>
                  {t('appSettings.notif.pushTitle')}
                </Text>
                <Text style={styles.rowSubtitle}>
                  {t('appSettings.notif.pushSubtitle')}
                </Text>
              </View>

              {notifLoading ? null : (
                <Switch
                  value={notifEnabled}
                  onValueChange={handleNotifToggle}
                  trackColor={{ false: 'rgba(255,255,255,0.10)', true: 'rgba(37,240,200,0.40)' }}
                  thumbColor={notifEnabled ? NEON : 'rgba(255,255,255,0.55)'}
                  ios_backgroundColor="rgba(255,255,255,0.10)"
                />
              )}
            </View>
          </BlurView>
        </View>

        <Text style={styles.groupLabel}>
          {t('appSettings.security.groupLabel')}
        </Text>

        <View style={styles.cardOuter}>
          <BlurView intensity={16} tint="dark" style={styles.card}>
            <TouchableOpacity
              onPress={() => setPwdModalOpen(true)}
              activeOpacity={0.85}
              style={styles.row}
            >
              <View style={styles.rowIconWrap}>
                <Feather name="lock" size={18} color={ACCENT} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>
                  {t('appSettings.password.title')}
                </Text>
                <Text style={styles.rowSubtitle}>
                  {t('appSettings.password.subtitle')}
                </Text>
              </View>

              <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.25)" />
            </TouchableOpacity>
          </BlurView>
        </View>

        <Text style={styles.groupLabel}>
          {t('settings:items.reportTitle')}
        </Text>

        <View style={styles.cardOuter}>
          <BlurView intensity={16} tint="dark" style={styles.card}>
            <TouchableOpacity
              onPress={() => router.push('/(app)/(tabs)/ustawienia/zglos_problem')}
              activeOpacity={0.85}
              style={styles.row}
            >
              <View style={styles.rowIconWrap}>
                <Feather name="alert-triangle" size={18} color={ACCENT} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>
                  {t('settings:items.reportTitle')}
                </Text>
                <Text style={styles.rowSubtitle}>
                  {t('settings:items.reportSubtitle')}
                </Text>
              </View>

              <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.25)" />
            </TouchableOpacity>
          </BlurView>
        </View>

        <View style={styles.versionWrap}>
          <Text style={styles.versionLabel}>
            {t('appSettings.version')}
          </Text>
          <Text style={styles.versionNumber}>{appVersionLabel}</Text>

          <View style={styles.linksRow}>
            <TouchableOpacity onPress={() => Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')} activeOpacity={0.7}>
              <Text style={styles.linkText}>{t('appSettings.terms')}</Text>
            </TouchableOpacity>

            <Text style={styles.linkSep}>•</Text>

            <TouchableOpacity onPress={() => Linking.openURL('https://mybuildiq.com/privacy')} activeOpacity={0.7}>
              <Text style={styles.linkText}>{t('appSettings.privacy')}</Text>
            </TouchableOpacity>

            <Text style={styles.linkSep}>•</Text>

            <TouchableOpacity onPress={() => Linking.openURL('https://www.mybuildiq.com/support')} activeOpacity={0.7}>
              <Text style={styles.linkText}>{t('appSettings.support')}</Text>
            </TouchableOpacity>

            <Text style={styles.linkSep}>•</Text>

            <TouchableOpacity onPress={() => Linking.openURL('https://www.mybuildiq.com/delete-account')} activeOpacity={0.7}>
              <Text style={styles.linkText}>{t('appSettings.deleteAccountLink')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={languageModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLanguageModalOpen(false)}
      >
        <View style={styles.pickerBackdrop}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>{t('appSettings.language.groupLabel')}</Text>
            {LANGUAGES.map((lang) => {
              const isActive = activeLang === lang.key;
              return (
                <TouchableOpacity
                  key={lang.key}
                  activeOpacity={0.86}
                  onPress={async () => {
                    await setAppLanguage(lang.key);
                    await setUnitsForLanguage(lang.key);
                    setActiveUnits(lang.key === 'en' ? 'imperial' : 'metric');
                    setLanguageModalOpen(false);
                  }}
                  style={[styles.optionRow, isActive && styles.optionRowActive]}
                >
                  <Text style={styles.optionFlag}>{lang.flag}</Text>
                  <Text style={[styles.optionText, isActive && styles.optionTextActive]}>
                    {t(lang.labelKey)}
                  </Text>
                  {isActive ? <Feather name="check" size={17} color={NEON} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>

      <Modal
        visible={currencyModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCurrencyModalOpen(false)}
      >
        <View style={styles.pickerBackdrop}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>{t('appSettings.currency.groupLabel')}</Text>
            {CURRENCY_OPTIONS.map((option) => {
              const isActive = activeCurrency === option.code;
              return (
                <TouchableOpacity
                  key={option.code}
                  activeOpacity={0.86}
                  onPress={async () => {
                    await setAppCurrency(option.code);
                    setActiveCurrency(option.code);
                    setCurrencyModalOpen(false);
                  }}
                  style={[styles.optionRow, isActive && styles.optionRowActive]}
                >
                  <Text style={styles.optionCurrency}>{option.symbol}</Text>
                  <Text style={[styles.optionText, isActive && styles.optionTextActive]}>
                    {option.code}
                  </Text>
                  {isActive ? <Feather name="check" size={17} color={NEON} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>

      <Modal
        visible={unitsModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setUnitsModalOpen(false)}
      >
        <View style={styles.pickerBackdrop}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>{t('appSettings.units.groupLabel')}</Text>
            {(['metric', 'imperial'] as UnitSystem[]).map((option) => {
              const isActive = activeUnits === option;
              return (
                <TouchableOpacity
                  key={option}
                  activeOpacity={0.86}
                  onPress={async () => {
                    await setAppUnits(option);
                    setActiveUnits(option);
                    setUnitsModalOpen(false);
                  }}
                  style={[styles.optionRow, isActive && styles.optionRowActive]}
                >
                  <Text style={styles.optionCurrency}>{option === 'imperial' ? 'ft' : 'm'}</Text>
                  <Text style={[styles.optionText, isActive && styles.optionTextActive]}>
                    {t(`appSettings.units.options.${option}`)}
                  </Text>
                  {isActive ? <Feather name="check" size={17} color={NEON} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>

      <Modal
        visible={pwdModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPwdModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />

            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {t('appSettings.password.modalTitle')}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {t('appSettings.password.modalSubtitle')}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setPwdModalOpen(false)}
                style={styles.modalCloseBtn}
                activeOpacity={0.85}
              >
                <Feather name="x" size={18} color="rgba(255,255,255,0.55)" />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>
              {t('appSettings.password.newLabel')}
            </Text>
            <View style={styles.inputWrap}>
              <AppInput
                value={newPwd}
                onChangeText={setNewPwd}
                placeholder={t('common:dash')}
                secureTextEntry={!showNew}
                style={styles.input}
                autoCapitalize="none"
                containerStyle={styles.inputField}
              />
              <TouchableOpacity onPress={() => setShowNew((v) => !v)} hitSlop={8}>
                <Feather name={showNew ? 'eye-off' : 'eye'} size={18} color="rgba(255,255,255,0.35)" />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>
              {t('appSettings.password.confirmLabel')}
            </Text>
            <View style={styles.inputWrap}>
              <AppInput
                value={confirmPwd}
                onChangeText={setConfirmPwd}
                placeholder={t('common:dash')}
                secureTextEntry={!showConfirm}
                style={styles.input}
                autoCapitalize="none"
                containerStyle={styles.inputField}
              />
              <TouchableOpacity onPress={() => setShowConfirm((v) => !v)} hitSlop={8}>
                <Feather name={showConfirm ? 'eye-off' : 'eye'} size={18} color="rgba(255,255,255,0.35)" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <AppButton
                title={t('common:cancel')}
                variant="secondary"
                onPress={() => setPwdModalOpen(false)}
                disabled={pwdSaving}
                style={styles.modalBtnGhost}
              />

              <AppButton
                title={
                  pwdSaving
                    ? t('appSettings.password.saving')
                    : t('appSettings.password.saveBtn')
                }
                onPress={handleChangePassword}
                disabled={pwdSaving}
                loading={pwdSaving}
                style={styles.modalBtnPrimary}
              />
            </View>
          </View>
          </TouchableWithoutFeedback>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000' },
  glowOrb: {
    position: 'absolute', width: 320, height: 320, borderRadius: 999,
    backgroundColor: ACCENT, opacity: 0.07, top: -100, right: -120,
  },

  content: { paddingHorizontal: 20 },

  topBar: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 28,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  screenTitle: {
    color: ACCENT, fontFamily: 'Rubik_800ExtraBold', fontSize: 20, fontWeight: '900', letterSpacing: -0.2,
    textShadowColor: 'rgba(25,112,92,0.18)', textShadowRadius: 14,
  },

  groupLabel: {
    color: 'rgba(255,255,255,0.38)', fontSize: 11, fontWeight: '900',
    letterSpacing: 1.4, textTransform: 'uppercase',
    marginBottom: 8, marginLeft: 4,
  },

  cardOuter: {
    borderRadius: 22, overflow: 'hidden', marginBottom: 24,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 10 },
  },
  card: {
    borderRadius: 22,
    backgroundColor: '#050505',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },

  rowFlag: { fontSize: 22, width: 32, textAlign: 'center' },
  rowIconWrap: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(25,112,92,0.12)',
    borderWidth: 1, borderColor: 'rgba(25,112,92,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: {
    color: 'rgba(255,255,255,0.80)', fontSize: 15.5, fontWeight: '700', letterSpacing: -0.1,
  },
  rowSubtitle: {
    marginTop: 2, color: 'rgba(255,255,255,0.38)', fontSize: 12.5, fontWeight: '500',
  },

  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  selectRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  selectLabel: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },

  activeCheck: {
    width: 24, height: 24, borderRadius: 99,
    backgroundColor: NEON, alignItems: 'center', justifyContent: 'center',
  },

  currencyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    padding: 12,
  },
  currencyTile: {
    width: '30%',
    minWidth: 86,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  currencyTileActive: {
    borderColor: 'rgba(37,240,200,0.42)',
    backgroundColor: 'rgba(37,240,200,0.12)',
  },
  currencyCode: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    fontWeight: '900',
  },
  currencyCodeActive: {
    color: '#FFFFFF',
  },
  currencySymbol: {
    marginTop: 3,
    color: 'rgba(255,255,255,0.38)',
    fontSize: 12,
    fontWeight: '700',
  },

  pickerBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  pickerCard: {
    borderRadius: 24,
    padding: 14,
    backgroundColor: '#050505',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
  },
  pickerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.1,
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  optionRow: {
    minHeight: 54,
    borderRadius: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  optionRowActive: {
    backgroundColor: 'rgba(37,240,200,0.10)',
  },
  optionFlag: {
    width: 28,
    textAlign: 'center',
    fontSize: 20,
  },
  optionCurrency: {
    width: 32,
    color: 'rgba(255,255,255,0.58)',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  optionText: {
    flex: 1,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 15,
    fontWeight: '800',
  },
  optionTextActive: {
    color: '#FFFFFF',
  },

  versionWrap: { alignItems: 'center', marginTop: 8, paddingVertical: 16 },
  versionLabel: { color: 'rgba(255,255,255,0.25)', fontSize: 12, fontWeight: '700' },
  versionNumber: { marginTop: 4, color: 'rgba(255,255,255,0.15)', fontSize: 12, fontWeight: '600' },

  linksRow: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    justifyContent: 'center', gap: 8, marginTop: 10,
  },
  linkText: { color: 'rgba(255,255,255,0.22)', fontSize: 12, fontWeight: '600' },
  linkSep: { color: 'rgba(255,255,255,0.15)', fontSize: 12 },

  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  modalSheet: {
    backgroundColor: '#000000',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderWidth: 1, borderColor: 'rgba(37,240,200,0.14)',
    borderBottomWidth: 0, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36,
    shadowColor: NEON, shadowOpacity: 0.10, shadowRadius: 30, shadowOffset: { width: 0, height: -8 },
  },
  modalHandle: {
    alignSelf: 'center', width: 40, height: 4,
    borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.15)', marginBottom: 18,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 22,
  },
  modalTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', letterSpacing: -0.2 },
  modalSubtitle: { marginTop: 4, color: 'rgba(255,255,255,0.38)', fontSize: 13, fontWeight: '600' },
  modalCloseBtn: {
    width: 34, height: 34, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },

  fieldLabel: {
    color: 'rgba(255,255,255,0.38)', fontSize: 11, fontWeight: '800',
    letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8,
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16, gap: 10,
  },
  inputField: { flex: 1 },
  input: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    borderWidth: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
    minHeight: 0,
  },

  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalBtnGhost: {
    flex: 1, paddingVertical: 14, borderRadius: 18, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  modalBtnPrimary: {
    flex: 2, paddingVertical: 14, borderRadius: 18, alignItems: 'center',
    backgroundColor: 'rgba(37,240,200,0.14)',
    borderWidth: 1.5, borderColor: 'rgba(37,240,200,0.38)',
  },
});
