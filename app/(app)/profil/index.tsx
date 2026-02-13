import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';

import { supabase } from '../../../lib/supabase';

// ✅ twardy cache na poziomie modułu (przetrwa Fast Refresh w większości przypadków)
let __profilInitOnce = false;
let __profilInitUserId: string | null = null;

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

  useEffect(() => {
    let alive = true;

    (async () => {
      // ✅ jeśli już raz zainicjalizowaliśmy dla tego usera, nie rób drugi raz
      if (__profilInitOnce && __profilInitUserId) {
        if (alive) setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const { data: userRes, error: userErr } = await supabase.auth.getUser();
        console.log('[Profil] getUser:', { hasUser: !!userRes?.user, userErr });

        if (!alive) return;

        if (userErr || !userRes?.user) {
          setUserId(null);
          setEmail('');
          return;
        }

        const user = userRes.user;

        // ✅ ustaw cache modułowy
        __profilInitOnce = true;
        __profilInitUserId = user.id;

        setUserId(user.id);
        setEmail(user.email ?? '');

        const { data, error } = await supabase
          .from('profiles')
          .select('imie, nazwisko, telefon, profil_wypelniony')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();

        console.log('[Profil] fetch profile:', { data, error });

        if (!alive) return;

        if (data) {
          setImie(data.imie ?? '');
          setNazwisko(data.nazwisko ?? '');
          setTelefon(data.telefon ?? '');
        }
      } catch (e) {
        console.log('[Profil] init exception:', e);
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
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.screen}>
        {/* tło + glowy (zostają, ale wyciszone — czarne tło) */}
        <View pointerEvents="none" style={styles.bg}>
          <View style={styles.glowA} />
          <View style={styles.glowB} />
          <View style={styles.glowC} />
        </View>

        <View style={styles.container}>
          {/* ✅ LOGO większe jak w inwestycji/profilu */}
          <View style={styles.logoWrap}>
            <Image source={require('../../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
          </View>

          <Text style={styles.title}>{t('header.title')}</Text>

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
                    icon="edit-3"
                    autoCapitalize="words"
                  />
                  <Field
                    label={t('form.lastNameLabel')}
                    value={nazwisko}
                    onChangeText={setNazwisko}
                    placeholder={t('form.lastNamePlaceholder')}
                    icon="edit-3"
                    autoCapitalize="words"
                  />
                  <Field
                    label={t('form.phoneLabel')}
                    value={telefon}
                    onChangeText={setTelefon}
                    placeholder={t('form.phonePlaceholder')}
                    icon="phone"
                    keyboardType="phone-pad"
                  />

                  <TouchableOpacity
                    style={[styles.ctaButton, (saving || loading) && styles.ctaButtonDisabled]}
                    activeOpacity={0.85}
                    onPress={handleSaveAndContinue}
                    disabled={saving || loading}
                  >
                    <Text style={styles.ctaText}>
                      {saving ? tc('saving') : t('form.saveAndContinue')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </BlurView>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  icon?: keyof typeof Feather.glyphMap;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  const {
    label,
    value,
    onChangeText,
    placeholder,
    icon = 'edit-3',
    keyboardType = 'default',
    autoCapitalize = 'none',
  } = props;

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <View style={styles.iconBox}>
          <Feather name={icon} size={16} color="#5EEAD4" />
        </View>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="rgba(148,163,184,0.55)"
          style={styles.input}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
        />
      </View>
    </View>
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

  logoWrap: { alignItems: 'center', marginBottom: 10, marginTop: 10 },
  logo: { width: 160, height: 64, opacity: 0.98 },

  title: {
    textAlign: 'center',
    color: '#5EEAD4',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 14,
    textShadowColor: 'rgba(94,234,212,0.65)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },

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
  label: { color: '#CBD5E1', fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#222',
    backgroundColor: '#111',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B0B0B',
    borderWidth: 1,
    borderColor: '#222',
  },
  input: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
    paddingVertical: 4,
  },

  ctaButton: {
    marginTop: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.45)',
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: 'rgba(94,234,212,0.12)',
  },
  ctaButtonDisabled: { opacity: 0.65 },
  ctaText: { color: '#5EEAD4', fontWeight: '900', textAlign: 'center' },
});
