import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Image,
  Alert,
  Dimensions,
  Animated,
  TouchableWithoutFeedback,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation('auth');
  const stars = useMemo(() => buildStars(90), []);
  const floatY = useRef(new Animated.Value(0)).current;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // jesli user zalogowany -> dashboard (na wszelki wypadek)
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) router.replace('/(app)');
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
    if (!e) return setError(t('register.errors.enterEmail'));
    if (password.length < 6) return setError(t('register.errors.passwordTooShort'));
    if (password !== password2) return setError(t('register.errors.passwordsMismatch'));

    setLoading(true);

    // Email verification: supabase wysle maila, jesli wlaczone "Confirm email" w panelu Auth
    const { error } = await supabase.auth.signUp({
      email: e,
      password,
    });

    setLoading(false);

    if (error) {
      setError(mapRegisterError(error.message, t));
      return;
    }

    Alert.alert(
      t('register.alerts.checkEmailTitle'),
      t('register.alerts.checkEmailMessage'),
      [{ text: t('common:ok'), onPress: () => router.replace('/(auth)/login') }]
    );
  };

  async function handleGoogleLogin() {
    setGoogleLoading(true);
    try {
      // Requires Google provider enabled in Supabase dashboard
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'exp://localhost:19000/--/auth/callback'
        }
      });

      if (error) throw error;
    } catch (err) {
      console.error('Google login error:', err);
      Alert.alert('Błąd logowania Google');
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
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

        <View>
          <TextInput
            placeholder={t('register.form.emailPlaceholder')}
            placeholderTextColor="#888888"
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <TextInput
            placeholder={t('register.form.passwordPlaceholder')}
            placeholderTextColor="#888888"
            style={styles.input}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <TextInput
            placeholder={t('register.form.repeatPasswordPlaceholder')}
            placeholderTextColor="#888888"
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
            <Text style={styles.primaryText}>{t('register.form.submit')}</Text>
          )}
        </TouchableOpacity>

        {/* Google (UI) */}
        <TouchableOpacity
          disabled={googleLoading}
          onPress={handleGoogleLogin}
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
            {t('register.form.haveAccount')} <Text style={styles.bottomLinkStrong}>{t('register.form.login')}</Text>
          </Text>
        </TouchableOpacity>
        </View>
      </View>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

function mapRegisterError(msg: string, t: any) {
  const l = msg.toLowerCase();
  if (l.includes('user already registered')) return t('register.errors.userAlreadyRegistered');
  if (l.includes('password')) return t('register.errors.weakPassword');
  if (l.includes('email')) return t('register.errors.invalidEmail');
  return t('register.errors.generic');
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

  // sterujesz wysokoscia logo:
  logoWrap: { alignItems: 'center', marginTop: -160, marginBottom: 26 },
  logoImg: { width: 96, height: 96 },

  input: {
    backgroundColor: '#0B0F14',
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

  // duzy przycisk + sensowna ikona (bez walki z paddingiem png)
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
