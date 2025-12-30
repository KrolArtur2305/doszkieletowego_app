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
  const [nazwisko, setNazwisko] = useState<string>('');
  const [telefon, setTelefon] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  const fullNamePreview = useMemo(() => {
    const v = [imie.trim(), nazwisko.trim()].filter(Boolean).join(' ');
    return v || 'Uzupełnij dane profilu';
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
      Alert.alert('Uzupełnij dane', 'Imię jest wymagane, aby kontynuować.');
      return;
    }

    if (phone && phone.replace(/\D/g, '').length < 7) {
      Alert.alert('Nieprawidłowy numer', 'Podaj poprawny numer telefonu lub zostaw puste pole.');
      return;
    }

    setSaving(true);
    try {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      console.log('[Profil] getUser (save):', { hasUser: !!userRes?.user, userErr });

      if (userErr || !userRes?.user) {
        Alert.alert('Błąd', 'Brak użytkownika. Zaloguj się ponownie.');
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
        Alert.alert('Błąd zapisu', error.message);
        return;
      }

      if (!data?.profil_wypelniony) {
        Alert.alert('Błąd', 'Profil nie został oznaczony jako wypełniony.');
        return;
      }

      console.log('[Profil] redirect -> /(app)/inwestycja');
      router.replace('/(app)/inwestycja');
    } catch (e: any) {
      console.log('[Profil] exception:', e);
      Alert.alert('Błąd', e?.message ?? 'Coś poszło nie tak.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* UI – bez zmian */}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
