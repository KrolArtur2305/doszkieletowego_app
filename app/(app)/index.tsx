import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { supabase } from '../supabase';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';

export default function Dashboard() {
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? null);
      const { data, error } = await supabase.from('profiles').select('imie').eq('user_id', user.id).maybeSingle();
      if (!error && data?.imie) setName(data.imie);
    })();
  }, []);

  const greeting = name ?? (email ? email.split('@')[0] : 'Użytkowniku');

  return (
    <View style={styles.container}>
      <View style={styles.halo} />
      <BlurView intensity={70} tint="dark" style={styles.card}>
        <Text style={styles.title}>Witaj, {greeting} 👋</Text>
        <TouchableOpacity onPress={() => router.push('/(app)/zdjecia')}>
          <Text style={styles.link}>📸 Zdjęcia z budowy</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => supabase.auth.signOut()}>
          <Text style={styles.signout}>Wyloguj</Text>
        </TouchableOpacity>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1120', justifyContent: 'center', alignItems: 'center' },
  halo: { position: 'absolute', width: 700, height: 700, borderRadius: 9999, backgroundColor: '#14B8A6', opacity: 0.2, top: -180, left: -120 },
  card: { borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 20, width: '88%' },
  title: { fontSize: 24, fontWeight: '800', color: '#ECFDF5', marginBottom: 20 },
  link: { color: '#93C5FD', fontSize: 16, marginBottom: 10 },
  signout: { color: '#FCA5A5', marginTop: 10 },
});
