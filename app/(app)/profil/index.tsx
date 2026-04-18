import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';

import { supabase } from '../../../lib/supabase';
import { AppButton, AppHeader, AppInput } from '../../../src/ui/components';

type ProfileCache = {
  userId: string | null;
  email: string;
  imie: string;
  nazwisko: string;
  telefon: string;
};

const EMPTY_PROFILE_CACHE: ProfileCache = {
  userId: null,
  email: '',
  imie: '',
  nazwisko: '',
  telefon: '',
};

// ✅ cache modułowy powiązany z konkretnym userem
let __profileCache: ProfileCache = { ...EMPTY_PROFILE_CACHE };

function resetProfileCache() {
  __profileCache = { ...EMPTY_PROFILE_CACHE };
}

export default function ProfilScreen() {
  // ✅ trzymamy jeden namespace jako bazę
  const { t } = useTranslation('profile');
  // ✅ i bierzemy też common jako "fallback" na proste teksty (dash/saving)
  const { t: tc } = useTranslation('common');

  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>('');

  // ✅ pola zgodne z Supabase (profiles: imie, nazwisko, telefon, profil_wypelniony)
  const [imie, setImie] = useState<string>('');
  const [nazwisko, setNazwisko] = useState<string>('');
  const [telefon, setTelefon] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  const fullNamePreview = useMemo(() => {
    const v = [imie.trim(), nazwisko.trim()].filter(Boolean).join(' ');
    // ✅ jeśli brak imienia/nazwiska, pokazujemy tekst z profilu
    return v || t('header.completeProfile');
  }, [imie, nazwisko, t]);

  const normalizePhone = (v: string) => v.replace(/[^\d+]/g, '');

  const applyProfileState = (next: ProfileCache) => {
    setUserId(next.userId);
    setEmail(next.email);
    setImie(next.imie);
    setNazwisko(next.nazwisko);
    setTelefon(next.telefon);
  };

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      try {
        const { data: userRes, error: userErr } = await supabase.auth.getUser();

        if (!alive) return;

        if (userErr || !userRes?.user) {
          resetProfileCache();
          applyProfileState({ ...EMPTY_PROFILE_CACHE });
          return;
        }

        const user = userRes.user;

        if (__profileCache.userId === user.id) {
          applyProfileState(__profileCache);
          return;
        }

        // ✅ zmiana usera: czyścimy poprzedni stan zanim dociągniemy nowe dane
        resetProfileCache();
        applyProfileState({
          ...EMPTY_PROFILE_CACHE,
          userId: user.id,
          email: user.email ?? '',
        });

        const { data, error } = await supabase
          .from('profiles')
          .select('imie, nazwisko, telefon, profil_wypelniony')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();

        if (!alive) return;

        const nextProfile: ProfileCache = {
          userId: user.id,
          email: user.email ?? '',
          imie: data?.imie ?? '',
          nazwisko: data?.nazwisko ?? '',
          telefon: data?.telefon ?? '',
        };

        __profileCache = nextProfile;
        applyProfileState(nextProfile);
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
    if (saving) return;

    const first = imie.trim();
    const last = nazwisko.trim();
    const phoneRaw = telefon.trim();
    const phone = phoneRaw ? normalizePhone(phoneRaw) : '';

    if (!first) {
      Alert.alert(t('alerts.completeDataTitle'), t('alerts.firstNameRequired'));
      return;
    }

    if (phone && phone.replace(/\D/g, '').length < 7) {
      Alert.alert(t('alerts.invalidPhoneTitle'), t('alerts.invalidPhoneMessage'));
      return;
    }

    setSaving(true);
    try {
      // ✅ zawsze bierz usera "na świeżo" przy zapisie
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      const user = userRes?.user;

      if (userErr || !user?.id) {
        Alert.alert(t('alerts.errorTitle'), t('errors.noUser'));
        return;
      }

      const payload = {
        user_id: user.id,
        imie: first,
        nazwisko: last || null,
        telefon: phone || null,
        email: user.email ?? email ?? null,
        profil_wypelniony: true,
      };

      const { data, error } = await supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'user_id' })
        .select('user_id, profil_wypelniony')
        .maybeSingle();

      if (error) {
        Alert.alert(t('alerts.saveErrorTitle'), error.message);
        return;
      }

      if (!data?.profil_wypelniony) {
        Alert.alert(t('alerts.errorTitle'), t('errors.profileNotMarked'));
        return;
      }

      // ✅ od razu przejście dalej
      router.replace('/(app)/inwestycja');
    } catch (e: any) {
      Alert.alert(t('alerts.errorTitle'), e?.message ?? t('errors.generic'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.screen}>
        {/* tło + glowy (zostają, ale wyciszone — czarne tło) */}
        <View pointerEvents="none" style={styles.bg}>
          <View style={styles.glowA} />
          <View style={styles.glowB} />
          <View style={styles.glowC} />
        </View>

        <View style={styles.container}>
          <AppHeader title={t('header.title')} style={styles.screenHeader} />

          <BlurView intensity={70} tint="dark" style={styles.card}>
            {/* ✅ header wyśrodkowany: badge + imię + mail */}
            <View style={styles.headerCol}>
              <View style={styles.badge}>
                <Feather name="user" size={16} color="#5EEAD4" />
              </View>

              <Text style={styles.namePreview}>{fullNamePreview}</Text>
              <Text style={styles.email} numberOfLines={1}>
                {email ? email : tc('dash')}
              </Text>
            </View>

            <View style={styles.divider} />

            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator />
                <Text style={styles.loadingText}>{t('loading.profileData')}</Text>
              </View>
            ) : (
              <View style={styles.formWrap}>
                <View style={styles.form}>
                  <Field
                    label={t('form.firstNameLabel')}
                    value={imie}
                    onChangeText={setImie}
                    placeholder={t('form.firstNamePlaceholder')}
                    autoCapitalize="words"
                  />
                  <Field
                    label={t('form.lastNameLabel')}
                    value={nazwisko}
                    onChangeText={setNazwisko}
                    placeholder={t('form.lastNamePlaceholder')}
                    autoCapitalize="words"
                  />
                  <Field
                    label={t('form.phoneLabel')}
                    value={telefon}
                    onChangeText={setTelefon}
                    placeholder={t('form.phonePlaceholder')}
                    keyboardType="phone-pad"
                  />

                  <AppButton
                    title={saving ? tc('saving') : t('form.saveAndContinue')}
                    onPress={handleSaveAndContinue}
                    disabled={saving || loading}
                    loading={saving}
                    style={styles.ctaButton}
                  />
                </View>
              </View>
            )}
          </BlurView>
        </View>
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
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  const {
    label,
    value,
    onChangeText,
    placeholder,
    keyboardType = 'default',
    autoCapitalize = 'none',
  } = props;

  return (
    <AppInput
      label={label}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      containerStyle={styles.fieldWrap}
      style={styles.input}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  screen: { flex: 1, backgroundColor: '#000000' },

  bg: { ...StyleSheet.absoluteFillObject },
  glowA: {
    position: 'absolute',
    width: 520,
    height: 520,
    borderRadius: 9999,
    backgroundColor: '#0EA5E9',
    opacity: 0,
    top: -140,
    right: -240,
  },
  glowB: {
    position: 'absolute',
    width: 520,
    height: 520,
    borderRadius: 9999,
    backgroundColor: '#5EEAD4',
    opacity: 0,
    bottom: -260,
    left: -220,
  },
  glowC: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 9999,
    backgroundColor: '#22C55E',
    opacity: 0,
    top: 240,
    left: -160,
  },

  container: { paddingTop: 28, paddingHorizontal: 16, paddingBottom: 24 },
  screenHeader: { marginBottom: 14 },

  card: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.92)',
    overflow: 'hidden',
    padding: 16,
  },

  headerCol: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 2, paddingBottom: 2 },
  badge: {
    width: 42,
    height: 42,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222',
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  namePreview: { color: '#F8FAFC', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  email: { color: 'rgba(148,163,184,0.85)', marginTop: 0, textAlign: 'center' },

  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 14,
  },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  loadingText: { color: '#94A3B8' },

  formWrap: { paddingTop: 10 },
  form: { gap: 12 },

  fieldWrap: { gap: 6 },
  input: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
    backgroundColor: '#111',
    borderColor: '#222',
  },

  ctaButton: {
    marginTop: 18,
  },
});
