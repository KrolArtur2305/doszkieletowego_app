import { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Notifications from 'expo-notifications';
import { supabase } from '../../../../lib/supabase';
import { setAppLanguage, type AppLanguage } from '../../../../lib/i18n';
import { removePushToken } from '../../../src/services/notifications/pushService';

const NEON = '#25F0C8';
const ACCENT = '#19705C';
const APP_VERSION = '1.0.0';

const LANGUAGES: { key: AppLanguage; labelKey: string; flag: string }[] = [
  { key: 'pl', labelKey: 'appSettings.language.options.pl', flag: '🇵🇱' },
  { key: 'en', labelKey: 'appSettings.language.options.en', flag: '🇬🇧' },
  { key: 'de', labelKey: 'appSettings.language.options.de', flag: '🇩🇪' },
];

export default function UstawieniaAplikacjiScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation(['settings', 'common']);
  const topPad = (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 16) + 8;

  const activeLang = (i18n.resolvedLanguage || i18n.language) as AppLanguage;

  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifLoading, setNotifLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { status } = await Notifications.getPermissionsAsync();
      setNotifEnabled(status === 'granted');
      setNotifLoading(false);
    })();
  }, []);

  const handleNotifToggle = async (value: boolean) => {
    if (value) {
      const { status } = await Notifications.requestPermissionsAsync();
      setNotifEnabled(status === 'granted');

      if (status !== 'granted') {
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

  const handleDeleteAccount = () => {
    Alert.alert(
      t('appSettings.deleteAccount.confirmTitle'),
      t('appSettings.deleteAccount.confirmMessage'),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('appSettings.deleteAccount.confirmBtn'),
          style: 'destructive',
          onPress: async () => {
            try {
              const {
                data: { user },
              } = await supabase.auth.getUser();
              if (user) {
                await removePushToken(user.id);
              }

              const { error } = await supabase.rpc('delete_user');
              if (error) throw error;
              await supabase.auth.signOut();
              router.replace('/(auth)/login');
            } catch (e: any) {
              Alert.alert(
                t('appSettings.deleteAccount.errorTitle'),
                t('appSettings.deleteAccount.errorMessage')
              );
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.bg} />
      <View pointerEvents="none" style={styles.glowOrb} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topPad }]}
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

        <Text style={styles.groupLabel}>
          {t('appSettings.language.groupLabel')}
        </Text>

        <View style={styles.cardOuter}>
          <BlurView intensity={16} tint="dark" style={styles.card}>
            {LANGUAGES.map((lang, i) => {
              const isActive = activeLang === lang.key;
              const isLast = i === LANGUAGES.length - 1;

              return (
                <TouchableOpacity
                  key={lang.key}
                  onPress={async () => {
                    await setAppLanguage(lang.key);
                  }}
                  activeOpacity={0.85}
                  style={[styles.row, !isLast && styles.rowBorder]}
                >
                  <Text style={styles.rowFlag}>{lang.flag}</Text>
                  <Text style={[styles.rowTitle, isActive && { color: '#FFFFFF' }]}>
                    {t(lang.labelKey)}
                  </Text>
                  {isActive && (
                    <View style={styles.activeCheck}>
                      <Feather name="check" size={13} color="#0B1120" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </BlurView>
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
              style={[styles.row, styles.rowBorder]}
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

            <TouchableOpacity
              onPress={handleDeleteAccount}
              activeOpacity={0.85}
              style={styles.row}
            >
              <View style={[styles.rowIconWrap, styles.rowIconDanger]}>
                <Feather name="trash-2" size={18} color="#FF4747" />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, styles.rowTitleDanger]}>
                  {t('appSettings.deleteAccount.title')}
                </Text>
                <Text style={styles.rowSubtitle}>
                  {t('appSettings.deleteAccount.subtitle')}
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
          <Text style={styles.versionNumber}>{APP_VERSION}</Text>

          <View style={styles.linksRow}>
            <TouchableOpacity onPress={() => Linking.openURL('https://www.mybuildiq.com/terms')} activeOpacity={0.7}>
              <Text style={styles.linkText}>{t('appSettings.terms')}</Text>
            </TouchableOpacity>

            <Text style={styles.linkSep}>•</Text>

            <TouchableOpacity onPress={() => Linking.openURL('https://www.mybuildiq.com/privacy')} activeOpacity={0.7}>
              <Text style={styles.linkText}>{t('appSettings.privacy')}</Text>
            </TouchableOpacity>

            <Text style={styles.linkSep}>•</Text>

            <TouchableOpacity onPress={() => Linking.openURL('https://www.mybuildiq.com/support')} activeOpacity={0.7}>
              <Text style={styles.linkText}>{t('appSettings.support')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={pwdModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPwdModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
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
              <TextInput
                value={newPwd}
                onChangeText={setNewPwd}
                placeholder="••••••••"
                placeholderTextColor="rgba(255,255,255,0.25)"
                secureTextEntry={!showNew}
                style={styles.input}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowNew((v) => !v)} hitSlop={8}>
                <Feather name={showNew ? 'eye-off' : 'eye'} size={18} color="rgba(255,255,255,0.35)" />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>
              {t('appSettings.password.confirmLabel')}
            </Text>
            <View style={styles.inputWrap}>
              <TextInput
                value={confirmPwd}
                onChangeText={setConfirmPwd}
                placeholder="••••••••"
                placeholderTextColor="rgba(255,255,255,0.25)"
                secureTextEntry={!showConfirm}
                style={styles.input}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowConfirm((v) => !v)} hitSlop={8}>
                <Feather name={showConfirm ? 'eye-off' : 'eye'} size={18} color="rgba(255,255,255,0.35)" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setPwdModalOpen(false)}
                style={styles.modalBtnGhost}
                disabled={pwdSaving}
                activeOpacity={0.85}
              >
                <Text style={styles.modalBtnGhostText}>
                  {t('common:cancel')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleChangePassword}
                style={[styles.modalBtnPrimary, pwdSaving && { opacity: 0.65 }]}
                disabled={pwdSaving}
                activeOpacity={0.9}
              >
                <Text style={styles.modalBtnPrimaryText}>
                  {pwdSaving
                    ? t('appSettings.password.saving')
                    : t('appSettings.password.saveBtn')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000' },
  glowOrb: {
    position: 'absolute', width: 320, height: 320, borderRadius: 999,
    backgroundColor: ACCENT, opacity: 0.07, top: -100, right: -120,
  },

  content: { paddingHorizontal: 20, paddingBottom: 60 },

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
    color: ACCENT, fontSize: 20, fontWeight: '900', letterSpacing: -0.2,
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
    backgroundColor: 'rgba(255,255,255,0.026)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
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
  rowIconDanger: {
    backgroundColor: 'rgba(255,71,71,0.10)',
    borderColor: 'rgba(255,71,71,0.22)',
  },

  rowTitle: {
    color: 'rgba(255,255,255,0.80)', fontSize: 15.5, fontWeight: '700', letterSpacing: -0.1,
  },
  rowTitleDanger: { color: '#FF6B6B' },
  rowSubtitle: {
    marginTop: 2, color: 'rgba(255,255,255,0.38)', fontSize: 12.5, fontWeight: '500',
  },

  activeCheck: {
    width: 24, height: 24, borderRadius: 99,
    backgroundColor: NEON, alignItems: 'center', justifyContent: 'center',
  },

  versionWrap: { alignItems: 'center', marginTop: 8, paddingVertical: 16 },
  versionLabel: { color: 'rgba(255,255,255,0.25)', fontSize: 12, fontWeight: '700' },
  versionNumber: { marginTop: 4, color: 'rgba(255,255,255,0.15)', fontSize: 12, fontWeight: '600' },

  linksRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, marginTop: 10,
  },
  linkText: { color: 'rgba(255,255,255,0.22)', fontSize: 12, fontWeight: '600' },
  linkSep: { color: 'rgba(255,255,255,0.15)', fontSize: 12 },

  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  modalSheet: {
    backgroundColor: '#0A0F1E',
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
  input: { flex: 1, color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalBtnGhost: {
    flex: 1, paddingVertical: 14, borderRadius: 18, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  modalBtnGhostText: { color: 'rgba(255,255,255,0.60)', fontWeight: '900', fontSize: 15 },
  modalBtnPrimary: {
    flex: 2, paddingVertical: 14, borderRadius: 18, alignItems: 'center',
    backgroundColor: 'rgba(37,240,200,0.14)',
    borderWidth: 1.5, borderColor: 'rgba(37,240,200,0.38)',
  },
  modalBtnPrimaryText: { color: NEON, fontWeight: '900', fontSize: 15 },
});
