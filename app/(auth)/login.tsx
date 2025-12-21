import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { supabase } from '../../lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onLogin = async () => {
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(mapError(error.message));
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <View style={styles.bg} />
      <BlurView intensity={80} tint="dark" style={styles.card}>
        <Text style={styles.title}>doszkieletowego</Text>
        <Text style={styles.subtitle}>Zaloguj się</Text>

        <TextInput placeholder="E-mail" placeholderTextColor="#9CA3AF" style={styles.input}
          autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput placeholder="Hasło" placeholderTextColor="#9CA3AF" style={styles.input}
          secureTextEntry value={password} onChangeText={setPassword} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity disabled={loading} onPress={onLogin} style={[styles.button, loading && { opacity: 0.7 }]}>
          {loading ? <ActivityIndicator /> : <Text style={styles.buttonText}>Wejdź</Text>}
        </TouchableOpacity>
      </BlurView>
    </KeyboardAvoidingView>
  );
}

function mapError(msg: string) {
  const l = msg.toLowerCase();
  if (l.includes('invalid login credentials')) return 'Niepoprawny e-mail lub hasło.';
  if (l.includes('email not confirmed')) return 'Potwierdź adres e-mail.';
  return 'Coś poszło nie tak. Spróbuj ponownie.';
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B1120' },
  bg: { position: 'absolute', width: 600, height: 600, borderRadius: 9999, backgroundColor: '#10B981', opacity: 0.25, top: -120, right: -120 },
  card: { width: '88%', padding: 24, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  title: { fontSize: 28, fontWeight: '700', color: '#ECFDF5', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#93C5FD', textAlign: 'center', marginBottom: 20 },
  input: { backgroundColor: 'rgba(255,255,255,0.06)', color: '#E5E7EB', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 12 },
  button: { marginTop: 6, backgroundColor: '#10B981', paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  buttonText: { color: '#042F2E', fontWeight: '700', fontSize: 16 },
  error: { color: '#FCA5A5', marginBottom: 6, textAlign: 'center' },
});
