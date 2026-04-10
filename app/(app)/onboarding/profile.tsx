import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';

const BG = '#000000';
const ACCENT = '#19705C';
const NEON = '#25F0C8';

function normalizePhone(v: string) {
  return v.replace(/[^\d+]/g, '');
}

export default function OnboardingProfileScreen() {
  const router = useRouter();
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
        setImie(data?.imie ?? '');
        setNazwisko(data?.nazwisko ?? '');
        setTelefon(data?.telefon ?? '');
      } catch (e: any) {
        Alert.alert('Błąd', e?.message ?? 'Nie udało się pobrać profilu.');
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, []);

  const handleSave = async () => {
    if (!userId || saving) return;

    const first = imie.trim();
    const last = nazwisko.trim();
    const phone = telefon.trim() ? normalizePhone(telefon.trim()) : '';

    if (!first) {
      Alert.alert('Błąd', 'Podaj imię.');
      return;
    }

    if (phone && phone.replace(/\D/g, '').length < 7) {
      Alert.alert('Błąd', 'Podaj poprawny numer telefonu.');
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
      Alert.alert('Błąd', e?.message ?? 'Nie udało się zapisać profilu.');
    } finally {
      setSaving(false);
    }
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
          <Text style={styles.title}>Profil</Text>

          <BlurView intensity={18} tint="dark" style={styles.card}>
            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={NEON} />
                <Text style={styles.loadingText}>Ładuję dane...</Text>
              </View>
            ) : (
              <>
                <Field label="Imię *" value={imie} onChangeText={setImie} placeholder="np. Adam" icon="edit-3" />
                <Field label="Nazwisko" value={nazwisko} onChangeText={setNazwisko} placeholder="np. Kowalski" icon="edit-3" />
                <Field
                  label="Telefon"
                  value={telefon}
                  onChangeText={setTelefon}
                  placeholder="np. 600123456"
                  icon="phone"
                  keyboardType="phone-pad"
                />

                <TouchableOpacity
                  style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                  activeOpacity={0.9}
                >
                  {saving ? <ActivityIndicator color="#0B1120" /> : <Text style={styles.primaryBtnText}>Dalej</Text>}
                </TouchableOpacity>
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
  icon?: keyof typeof Feather.glyphMap;
  keyboardType?: 'default' | 'phone-pad';
}) {
  const { label, value, onChangeText, placeholder, icon = 'edit-3', keyboardType = 'default' } = props;

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        <Feather name={icon} size={16} color="rgba(37,240,200,0.55)" />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="rgba(255,255,255,0.26)"
          keyboardType={keyboardType}
          autoCapitalize={keyboardType === 'phone-pad' ? 'none' : 'words'}
          style={styles.input}
        />
      </View>
    </View>
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
    justifyContent: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: -0.4,
    marginBottom: 22,
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
  fieldLabel: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  inputWrap: {
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
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  primaryBtn: {
    marginTop: 6,
    minHeight: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NEON,
  },
  primaryBtnDisabled: {
    opacity: 0.68,
  },
  primaryBtnText: {
    color: '#0B1120',
    fontSize: 15,
    fontWeight: '900',
  },
});
