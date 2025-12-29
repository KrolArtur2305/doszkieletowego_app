import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { supabase } from '../../../lib/supabase';

export default function ProfilScreen() {
  const router = useRouter();

  const [email, setEmail] = useState<string>('');

  const [imie, setImie] = useState<string>('');
  const [nazwisko, setNazwisko] = useState<string>(''); // opcjonalne
  const [telefon, setTelefon] = useState<string>(''); // opcjonalne

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  const fullNamePreview = useMemo(() => {
    const v = [imie.trim(), nazwisko.trim()].filter(Boolean).join(' ');
    return v || 'UzupeĹ‚nij dane profilu';
  }, [imie, nazwisko]);

  const normalizePhone = (v: string) => v.replace(/[^\d+]/g, '');

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      try {
        const { data: userRes, error: userErr } = await supabase.auth.getUser();
        console.log('[Profil] getUser:', { hasUser: !!userRes?.user, userErr });

        if (!alive) return;

        if (userErr || !userRes?.user) {
          setLoading(false);
          return;
        }

        const user = userRes.user;
        setEmail(user.email ?? '');

        const { data, error } = await supabase
          .from('profiles')
          .select('imie, nazwisko, telefon, email, profil_wypelniony')
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

    console.log('[Profil] CLICK save');

    if (!first) {
      Alert.alert('UzupeĹ‚nij dane', 'ImiÄ™ jest wymagane, aby kontynuowaÄ‡.');
      return;
    }

    if (phone && phone.replace(/\D/g, '').length < 7) {
      Alert.alert('NieprawidĹ‚owy numer', 'Podaj poprawny numer telefonu lub zostaw puste pole.');
      return;
    }

    setSaving(true);
    try {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      console.log('[Profil] getUser (save):', { hasUser: !!userRes?.user, userErr });

      if (userErr || !userRes?.user) {
        Alert.alert('BĹ‚Ä…d', 'Brak uĹĽytkownika. Zaloguj siÄ™ ponownie.');
        return;
      }

      const user = userRes.user;

      const payload = {
        user_id: user.id,
        imie: first,
        nazwisko: last || null,
        telefon: phone || null,
        email: user.email ?? null,
        profil_wypelniony: true,
      };

      console.log('[Profil] upsert payload:', payload);

      const { data, error } = await supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'user_id' })
        .select('user_id, profil_wypelniony')
        .maybeSingle();

      console.log('[Profil] upsert result:', { data, error });

      if (error) {
        Alert.alert('BĹ‚Ä…d zapisu', error.message);
        return;
      }

      if (!data?.profil_wypelniony) {
        Alert.alert('BĹ‚Ä…d', 'Profil nie zostaĹ‚ oznaczony jako wypeĹ‚niony.');
        return;
      }

      console.log('[Profil] redirect -> /(app)/inwestycja');
      router.replace('/(app)/inwestycja');
    } catch (e: any) {
      console.log('[Profil] exception:', e);
      Alert.alert('BĹ‚Ä…d', e?.message ?? 'CoĹ› poszĹ‚o nie tak.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.screen}>
        {/* tĹ‚o / poĹ›wiaty */}
        <View pointerEvents="none" style={styles.bg}>
          <View style={styles.glowA} />
          <View style={styles.glowB} />
          <View style={styles.glowC} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* logo */}
          <View style={styles.logoWrap}>
            <Image
              source={require('../../assets/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          {/* nagĹ‚Ăłwek */}
          <Text style={styles.header}>PROFIL</Text>
          <Text style={styles.headerSub}>Dodaj lub zaktualizuj dane, aby odblokowaÄ‡ aplikacjÄ™.</Text>

          {/* karta */}
          <BlurView intensity={85} tint="dark" style={styles.card}>
            {/* preview */}
            <View style={styles.previewRow}>
              <View style={styles.previewIcon}>
                <Feather name="user" size={18} color="#5EEAD4" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.previewLabel}>PodglÄ…d</Text>
                <Text style={styles.previewValue}>{loading ? 'Ĺadowanieâ€¦' : fullNamePreview}</Text>
              </View>
            </View>

            {/* email */}
            <View style={styles.previewRow}>
              <View style={styles.previewIcon}>
                <Feather name="mail" size={18} color="#5EEAD4" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.previewLabel}>E-mail</Text>
                <Text style={styles.previewValue}>{email || (loading ? 'Ĺadowanieâ€¦' : 'â€”')}</Text>
              </View>
            </View>

            {/* formularz */}
            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>ImiÄ™ *</Text>
                <View style={styles.inputWrap}>
                  <Feather name="edit-3" color="rgba(148,163,184,0.95)" size={16} />
                  <TextInput
                    value={imie}
                    onChangeText={setImie}
                    placeholder="Wpisz imiÄ™"
                    placeholderTextColor="rgba(148,163,184,0.7)"
                    style={styles.input}
                    editable={!loading && !saving}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Nazwisko (opcjonalnie)</Text>
                <View style={styles.inputWrap}>
                  <Feather name="edit-3" color="rgba(148,163,184,0.95)" size={16} />
                  <TextInput
                    value={nazwisko}
                    onChangeText={setNazwisko}
                    placeholder="Wpisz nazwisko"
                    placeholderTextColor="rgba(148,163,184,0.7)"
                    style={styles.input}
                    editable={!loading && !saving}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Nr tel (opcjonalnie)</Text>
                <View style={styles.inputWrap}>
                  <Feather name="phone" color="rgba(148,163,184,0.95)" size={16} />
                  <TextInput
                    value={telefon}
                    onChangeText={setTelefon}
                    placeholder="+48 600 000 000"
                    placeholderTextColor="rgba(148,163,184,0.7)"
                    style={styles.input}
                    editable={!loading && !saving}
                    keyboardType="phone-pad"
                    returnKeyType="done"
                  />
                </View>
              </View>
            </View>

            {/* CTA */}
            <TouchableOpacity
              style={[styles.ctaButton, (loading || saving) && styles.ctaButtonDisabled]}
              onPress={handleSaveAndContinue}
              disabled={loading || saving}
              activeOpacity={0.85}
            >
              <Text style={styles.ctaText}>{saving ? 'Zapisywanieâ€¦' : 'Zapisz i przejdĹş dalej'}</Text>
            </TouchableOpacity>

            {/* drobny hint */}
            <Text style={styles.hint}>
              * Pole wymagane. PozostaĹ‚e moĹĽesz uzupeĹ‚niÄ‡ pĂłĹşniej w ustawieniach.
            </Text>
          </BlurView>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  screen: {
    flex: 1,
    backgroundColor: '#050915',
  },

  bg: {
    ...StyleSheet.absoluteFillObject,
  },

  glowA: {
    position: 'absolute',
    width: 520,
    height: 520,
    borderRadius: 9999,
    backgroundColor: '#0EA5E9',
    opacity: 0.12,
    top: -120,
    right: -220,
  },
  glowB: {
    position: 'absolute',
    width: 520,
    height: 520,
    borderRadius: 9999,
    backgroundColor: '#5EEAD4',
    opacity: 0.10,
    bottom: -260,
    left: -220,
  },
  glowC: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 9999,
    backgroundColor: '#22C55E',
    opacity: 0.06,
    top: 220,
    left: -160,
  },

  content: {
    paddingTop: 26,
    paddingHorizontal: 16,
    paddingBottom: 140,
  },

  logoWrap: {
    alignItems: 'center',
    marginBottom: 10,
  },
  logo: {
    width: 140,
    height: 44,
    opacity: 0.95,
  },

  header: {
    textAlign: 'center',
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 4,
  },
  headerSub: {
    textAlign: 'center',
    color: '#94A3B8',
    marginTop: 8,
    marginBottom: 16,
    lineHeight: 20,
  },

  card: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: 18,
    backgroundColor: 'rgba(8,14,30,0.35)',
    overflow: 'hidden',
  },

  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  previewIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.22)',
    backgroundColor: 'rgba(94,234,212,0.06)',
  },
  previewLabel: { color: '#94A3B8', fontSize: 12 },
  previewValue: { color: '#F8FAFC', fontSize: 16, fontWeight: '700' },

  form: { marginTop: 16, gap: 14 },

  field: { gap: 8 },
  fieldLabel: { color: '#94A3B8', fontSize: 13 },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  input: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
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
  ctaText: {
    color: '#5EEAD4',
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  hint: {
    marginTop: 10,
    textAlign: 'center',
    color: 'rgba(148,163,184,0.9)',
    fontSize: 12,
    lineHeight: 16,
  },
});






