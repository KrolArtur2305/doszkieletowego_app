import { forwardRef, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { forceLoggedOutAuthSnapshot } from '../../../hooks/useSupabaseAuth';
import { supabase } from '../../../lib/supabase';
import { getUserWithTimeout } from '../../../lib/supabaseTimeout';
import { getFriendlyErrorMessage } from '../../../lib/errorMessages';
import { AppButton, AppInput } from '../../../src/ui/components';
import { isAppleAuthUser } from '../../../src/services/auth/appleAuth';
import { useOnlineActionGuard } from '../../../src/services/network/NetworkStatusProvider';

const BG = '#000000';
const ACCENT = '#19705C';
const NEON = '#25F0C8';
const APP_LOGO = require('../../assets/logo.png');
type ProfileField = 'firstName' | 'phone';

function normalizePhone(v: string) {
  return v.replace(/[^\d+]/g, '');
}

function normalizePhoneInput(v: string) {
  const trimmed = String(v ?? '').trimStart();
  const hasLeadingPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '').slice(0, 15);
  return hasLeadingPlus ? `+${digits}` : digits;
}

export default function OnboardingProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation('onboarding');
  const ensureOnlineAction = useOnlineActionGuard();
  const insets = useSafeAreaInsets();
  const topPad = (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0) + 2;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [imie, setImie] = useState('');
  const [nazwisko, setNazwisko] = useState('');
  const [telefon, setTelefon] = useState('');
  const [firstNameError, setFirstNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const fieldPositions = useRef<Partial<Record<ProfileField, number>>>({});
  const firstNameRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);

  const rememberFieldPosition = (field: ProfileField) => (event: LayoutChangeEvent) => {
    fieldPositions.current[field] = event.nativeEvent.layout.y;
  };

  const moveToField = (field: ProfileField, focus?: () => void) => {
    const y = fieldPositions.current[field] ?? 0;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
    if (focus) setTimeout(focus, 260);
  };

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const user = await getUserWithTimeout();
        if (!user) {
          if (alive) setLoadError(t('errors.noUser'));
          if (alive) setLoading(false);
          return;
        }

        if (isAppleAuthUser(user)) {
          await supabase.from('profiles').upsert(
            {
              user_id: user.id,
              email: user.email ?? null,
              profil_wypelniony: true,
              onboarding_step: 'investment',
              onboarding_completed: false,
            },
            { onConflict: 'user_id' }
          );

          router.replace('/(app)/onboarding/inwestycja');
          return;
        }

        const { data } = await supabase
          .from('profiles')
          .select('imie, nazwisko, telefon')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!alive) return;

        setUserId(user.id);
        setEmail(user.email ?? '');
        setImie(data?.imie ?? '');
        setNazwisko(data?.nazwisko ?? '');
        setTelefon(data?.telefon ?? '');
      } catch (e: any) {
        if (!alive) return;
        const message = getFriendlyErrorMessage(e, t, 'alerts.loadProfileError');
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

  const handleSave = async () => {
    if (!userId || saving) return;
    if (!ensureOnlineAction('Zapis profilu wymaga internetu. Sprawdź połączenie i spróbuj ponownie.')) return;

    const first = imie.trim();
    const last = nazwisko.trim();
    const phone = telefon.trim() ? normalizePhone(telefon.trim()) : '';

    if (!first) {
      setFirstNameError(t('alerts.firstNameRequired'));
      moveToField('firstName', () => firstNameRef.current?.focus());
      return;
    }

    if (phone && phone.replace(/\D/g, '').length < 7) {
      setPhoneError(t('alerts.invalidPhone'));
      moveToField('phone', () => phoneRef.current?.focus());
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
      Alert.alert(
        t('alerts.errorTitle'),
        getFriendlyErrorMessage(e, t, 'alerts.saveProfileError')
      );
    } finally {
      setSaving(false);
    }
  };

  const handleBack = async () => {
    if (!userId || saving) {
      router.replace('/(app)/onboarding');
      return;
    }
    if (!ensureOnlineAction('Zmiana kroku onboardingu wymaga internetu. Sprawdź połączenie i spróbuj ponownie.')) return;

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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View pointerEvents="none" style={styles.bg} />

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(0, insets.bottom + 32) },
          ]}
          keyboardShouldPersistTaps="handled"
          scrollIndicatorInsets={{ bottom: insets.bottom + 12 }}
          alwaysBounceVertical
          showsVerticalScrollIndicator={false}
        >
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
                  ref={firstNameRef}
                  label={t('profile.firstName')}
                  value={imie}
                  onChangeText={(value) => {
                    setImie(value);
                    if (firstNameError && value.trim()) setFirstNameError(null);
                  }}
                  placeholder={t('profile.firstNamePlaceholder')}
                  autoComplete="off"
                  textContentType="none"
                  autoCorrect={false}
                  error={firstNameError || undefined}
                  onLayout={rememberFieldPosition('firstName')}
                />
                <Field label={t('profile.lastName')} value={nazwisko} onChangeText={setNazwisko} placeholder={t('profile.lastNamePlaceholder')} />
                <Field
                  ref={phoneRef}
                  label={t('profile.phone')}
                  value={telefon}
                  onChangeText={(value) => {
                    const nextValue = normalizePhoneInput(value);
                    setTelefon(nextValue);
                    const digits = normalizePhone(nextValue).replace(/\D/g, '');
                    if (phoneError && (!nextValue.trim() || digits.length >= 7)) setPhoneError(null);
                  }}
                  placeholder={t('profile.phonePlaceholder')}
                  keyboardType="phone-pad"
                  maxLength={16}
                  error={phoneError || undefined}
                  onLayout={rememberFieldPosition('phone')}
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
        </ScrollView>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const Field = forwardRef<TextInput, {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'phone-pad';
  autoComplete?: 'off' | 'name' | 'family-name' | 'tel';
  textContentType?: 'none' | 'name' | 'familyName' | 'telephoneNumber';
  autoCorrect?: boolean;
  maxLength?: number;
  error?: string;
  onLayout?: (event: LayoutChangeEvent) => void;
}>(function Field(props, ref) {
  const {
    label,
    value,
    onChangeText,
    placeholder,
    keyboardType = 'default',
    autoComplete,
    textContentType,
    autoCorrect,
    maxLength,
    error,
    onLayout,
  } = props;

  return (
    <View onLayout={onLayout}>
      <AppInput
        ref={ref}
        label={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === 'phone-pad' ? 'none' : 'words'}
        autoComplete={autoComplete}
        textContentType={textContentType}
        autoCorrect={autoCorrect}
        maxLength={maxLength}
        error={error}
        containerStyle={styles.fieldWrap}
        style={styles.input}
      />
    </View>
  );
});

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
    flexGrow: 1,
    paddingHorizontal: 20,
    justifyContent: 'flex-start',
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
  logo: {
    width: 172,
    height: 172,
    alignSelf: 'center',
    marginBottom: 0,
  },
  title: {
    color: NEON,
    fontFamily: 'Rubik_800ExtraBold',
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
