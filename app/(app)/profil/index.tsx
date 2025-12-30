import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { supabase } from '../../../lib/supabase';

// ✅ twardy cache na poziomie modułu (przetrwa Fast Refresh w większości przypadków)
let __profilInitOnce = false;
let __profilInitUserId: string | null = null;

export default function ProfilScreen() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
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
      Alert.alert('Uzupełnij dane', 'Imię jest wymagane, aby kontynuować.');
      return;
    }

    if (phone && phone.replace(/\D/g, '').length < 7) {
      Alert.alert('Nieprawidłowy numer', 'Podaj poprawny numer telefonu lub zostaw puste pole.');
      return;
    }

    if (!userId) {
      Alert.alert('Błąd', 'Brak użytkownika. Zaloguj się ponownie.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        user_id: userId,
        imie: first,
        nazwisko: last || null,
        telefon: phone || null,
        email: email || null,
        profil_wypelniony: true,
      };

      const { data, error } = await supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'user_id' })
        .select('user_id, profil_wypelniony')
        .maybeSingle();

      if (error) {
        Alert.alert('Błąd zapisu', error.message);
        return;
      }

      if (!data?.profil_wypelniony) {
        Alert.alert('Błąd', 'Profil nie został oznaczony jako wypełniony.');
        return;
      }

      router.replace('/(app)/inwestycja');
    } catch (e: any) {
      Alert.alert('Błąd', e?.message ?? 'Coś poszło nie tak.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* UI – bez zmian:
          używaj swoich komponentów/JSX, tylko podepnij:
          - email, fullNamePreview, loading, saving
          - setImie, setNazwisko, setTelefon
          - handleSaveAndContinue
      */}
      <View style={{ flex: 1, backgroundColor: '#050915' }} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
