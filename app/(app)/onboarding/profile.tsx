import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../lib/supabase';
import { AppButton, AppInput } from '../../../src/ui/components';

const BG = '#000000';
const ACCENT = '#19705C';
const NEON = '#25F0C8';
const APP_LOGO = require('../../assets/logo.png');

function normalizePhone(v: string) {
  return v.replace(/[^\d+]/g, '');
}

export default function OnboardingProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation('onboarding');
  const topPad = (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0) + 2;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [imie, setImie] = useState('');
  const [nazwisko, setNazwisko] = useState('');
  const [telefon, setTelefon] = useState('');

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
          .from('profiles')
          .select('imie, nazwisko, telefon')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!alive) return;

        setUserId(user.id);
        setEmail(user.email ?? '');
        setImie('');
        setNazwisko(data?.nazwisko ?? '');
        setTelefon(data?.telefon ?? '');
      } catch (e: any) {
        Alert.alert(t('alerts.errorTitle'), e?.message ?? t('alerts.loadProfileError'));
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, [t]);

  const handleSave = async () => {
    if (!userId || saving) return;

    const first = imie.trim();
    const last = nazwisko.trim();
    const phone = telefon.trim() ? normalizePhone(telefon.trim()) : '';

    if (!first) {
      Alert.alert(t('alerts.errorTitle'), t('alerts.firstNameRequired'));
      return;
    }

    if (phone && phone.replace(/\D/g, '').length < 7) {
      Alert.alert(t('alerts.errorTitle'), t('alerts.invalidPhone'));
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').upsert(
        {
          user_id: userId,
          imie: first,
          nazwisko: last || null,
          telefon: phone || null,
          email: email || null,
          profil_wypelniony: true,
          onboarding_step: 'investment',
          onboarding_completed: false,
        },
        { onConflict: 'user_id' }
      );

      if (error) throw error;
      router.replace('/(app)/onboarding/inwestycja');
    } catch (e: any) {
      Alert.alert(t('alerts.errorTitle'), e?.message ?? t('alerts.saveProfileError'));
    } finally {
      setSaving(false);
    }
  };

  const handleBack = async () => {
    if (!userId || saving) {
      router.replace('/(app)/onboarding');
      return;
    }

    try {
      await supabase.from('profiles').upsert(
        {
          user_id: userId,
          onboarding_step: 'budget',
          onboarding_completed: false,
        },
        { onConflict: 'user_id' }
      );
    } catch {}

    router.replace('/(app)/onboarding');
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View pointerEvents="none" style={styles.bg} />
        <View pointerEvents="none" style={styles.glowTop} />
        <View pointerEvents="none" style={styles.glowBottom} />

        <View style={styles.content}>
          <View style={{ height: topPad }} />
          <TouchableOpacity onPress={handleBack} activeOpacity={0.8} style={styles.backButton}>
            <Feather name="chevron-left" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <Image source={APP_LOGO} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>{t('steps.profileTitle')}</Text>

          <BlurView intensity={18} tint="dark" style={styles.card}>
            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={NEON} />
                <Text style={styles.loadingText}>{t('loading.profile')}</Text>
              </View>
            ) : (
              <>
                <Field
                  label={t('profile.firstName')}
                  value={imie}
                  onChangeText={setImie}
                  placeholder=""
                  autoComplete="off"
                  textContentType="none"
                  autoCorrect={false}
                />
                <Field label={t('profile.lastName')} value={nazwisko} onChangeText={setNazwisko} placeholder={t('profile.lastNamePlaceholder')} />
                <Field
                  label={t('profile.phone')}
                  value={telefon}
                  onChangeText={setTelefon}
                  placeholder={t('profile.phonePlaceholder')}
                  keyboardType="phone-pad"
                />

                <AppButton
                  title={t('actions.next')}
                  onPress={handleSave}
                  disabled={saving}
                  loading={saving}
                  style={styles.primaryBtn}
                />
              </>
            )}
          </BlurView>
        </View>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'phone-pad';
  autoComplete?: 'off' | 'name' | 'family-name' | 'tel';
  textContentType?: 'none' | 'name' | 'familyName' | 'telephoneNumber';
  autoCorrect?: boolean;
}) {
  const {
    label,
    value,
    onChangeText,
    placeholder,
    keyboardType = 'default',
    autoComplete,
    textContentType,
    autoCorrect,
  } = props;

  return (
    <AppInput
      label={label}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      keyboardType={keyboardType}
      autoCapitalize={keyboardType === 'phone-pad' ? 'none' : 'words'}
      autoComplete={autoComplete}
      textContentType={textContentType}
      autoCorrect={autoCorrect}
      containerStyle={styles.fieldWrap}
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
    right: -110,
  },
  glowBottom: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 999,
    backgroundColor: NEON,
    opacity: 0.04,
    bottom: -120,
    left: -120,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'flex-start',
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
  fieldWrap: {
    marginBottom: 14,
  },
  input: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  primaryBtn: {
    marginTop: 6,
  },
});
