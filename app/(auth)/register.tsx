import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
  Dimensions,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';

const { width: W, height: H } = Dimensions.get('window');

type Star = { left: number; top: number; size: number; opacity: number };

function buildStars(count: number): Star[] {
  const stars: Star[] = [];
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  for (let i = 0; i < count; i++) {
    const size = 1 + Math.floor(rnd() * 2);
    stars.push({
      left: Math.floor(rnd() * W),
      top: Math.floor(rnd() * H),
      size,
      opacity: 0.2 + rnd() * 0.8,
    });
  }
  return stars;
}

export default function RegisterScreen() {
  const router = useRouter();
  const stars = useMemo(() => buildStars(90), []);
  const floatY = useRef(new Animated.Value(0)).current;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // jeśli user zalogowany -> dashboard (na wszelki wypadek)
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) router.replace('/(app)/(tabs)/dashboard');
    });

    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, { toValue: -4, duration: 1600, useNativeDriver: true }),
        Animated.timing(floatY, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ])
    );
    anim.start();

    return () => {
      mounted = false;
      anim.stop();
    };
  }, [router, floatY]);

  const onRegister = async () => {
    setError(null);

    const e = email.trim();
    if (!e) return setError('Wpisz e-mail.');
    if (password.length < 6) return setError('Hasło musi mieć min. 6 znaków.');
    if (password !== password2) return setError('Hasła nie są takie same.');

    setLoading(true);

    // Email verification: supabase wyśle maila, jeśli włączone "Confirm email" w panelu Auth
    const { error } = await supabase.auth.signUp({
      email: e,
      password,
    });

    setLoading(false);

    if (error) {
      setError(mapRegisterError(error.message));
      return;
    }

    Alert.alert(
      'Sprawdź e-mail',
      'Wysłaliśmy link potwierdzający. Po kliknięciu wróć do aplikacji i zaloguj się.',
      [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]
    );
  };

  const onGoogle = async () => {
    // UI jest, integrację dodamy później (build)
    setGoogleLoading(true);
    setTimeout(() => {
      setGoogleLoading(false);
      Alert.alert('Wkrótce', 'Rejestracja/logowanie Google dodamy przy buildzie aplikacji.');
    }, 450);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <View style={styles.bgBase} />

      {/* gwiazdki */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {stars.map((s, idx) => (
          <View
            key={idx}
            style={[
              styles.star,
              { left: s.left, top: s.top, width: s.size, height: s.size, opacity: s.opacity },
            ]}
          />
        ))}
      </View>

      {/* back */}
      <TouchableOpacity
        onPress={() => router.replace('/(auth)/welcome')}
        style={styles.backBtn}
        activeOpacity={0.8}
      >
        <Text style={styles.backText}>←</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        {/* logo */}
        <Animated.View style={[styles.logoWrap, { transform: [{ translateY: floatY }] }]}>
          <Image
            source={require('../../assets/logo.png')}
            style={styles.logoImg}
            resizeMode="contain"
          />
        </Animated.View>

        <TextInput
          placeholder="E-mail"
          placeholderTextColor="rgba(255,255,255,0.45)"
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <TextInput
          placeholder="Hasło (min. 6 znaków)"
          placeholderTextColor="rgba(255,255,255,0.45)"
          style={styles.input}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TextInput
          placeholder="Powtórz hasło"
          placeholderTextColor="rgba(255,255,255,0.45)"
          style={styles.input}
          secureTextEntry
          value={password2}
          onChangeText={setPassword2}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          disabled={loading}
          onPress={onRegister}
          style={[styles.primaryBtn, loading && { opacity: 0.7 }]}
          activeOpacity={0.9}
        >
          {loading ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.primaryText}>Załóż konto</Text>
          )}
        </TouchableOpacity>

        {/* Google (UI) */}
        <TouchableOpacity
          disabled={googleLoading}
          onPress={onGoogle}
          style={[styles.googleBtn, googleLoading && { opacity: 0.7 }]}
          activeOpacity={0.9}
        >
          {googleLoading ? (
            <ActivityIndicator />
          ) : (
            <Image
              source={require('../../assets/google.png')}
              style={styles.googleLogo}
              resizeMode="contain"
            />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.replace('/(auth)/login')}
          style={styles.bottomLinkWrap}
          activeOpacity={0.85}
        >
          <Text style={styles.bottomLink}>
            Masz już konto? <Text style={styles.bottomLinkStrong}>Zaloguj się</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function mapRegisterError(msg: string) {
  const l = msg.toLowerCase();
  if (l.includes('user already registered')) return 'Konto z tym e-mailem już istnieje.';
  if (l.includes('password')) return 'Hasło jest za słabe.';
  if (l.includes('email')) return 'Podaj poprawny adres e-mail.';
  return 'Nie udało się założyć konta. Spróbuj ponownie.';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  bgBase: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000' },
  star: { position: 'absolute', borderRadius: 99, backgroundColor: '#FFFFFF' },

  backBtn: {
    position: 'absolute',
    top: 16,
    left: 14,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  backText: { color: 'rgba(255,255,255,0.9)', fontSize: 22, fontWeight: '900' },

  content: {
    flex: 1,
    paddingHorizontal: 22,
    justifyContent: 'center',
  },

  // sterujesz wysokością logo:
  logoWrap: { alignItems: 'center', marginTop: -160, marginBottom: 26 },
  logoImg: { width: 96, height: 96 },

  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.92)',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    marginBottom: 12,
  },

  error: { color: '#FCA5A5', marginBottom: 8, textAlign: 'center' },

  primaryBtn: {
    marginTop: 6,
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.95)',
    backgroundColor: 'rgba(16,185,129,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#25F0C8', fontWeight: '900', fontSize: 18 },

  // duży przycisk + sensowna ikona (bez walki z paddingiem png)
  googleBtn: {
    marginTop: 16,
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleLogo: { width: 160, height: 160 },

  bottomLinkWrap: { marginTop: 18, alignItems: 'center' },
  bottomLink: { color: 'rgba(255,255,255,0.65)' },
  bottomLinkStrong: { color: '#10B981', fontWeight: '900' },
});
