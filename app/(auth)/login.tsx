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

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation('auth');
  const stars = useMemo(() => buildStars(90), []);
  const floatY = useRef(new Animated.Value(0)).current;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // jeśli user zalogowany -> dashboard
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) router.replace('/(app)/(tabs)/dashboard');
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) router.replace('/(app)/(tabs)/dashboard');
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
      sub.subscription.unsubscribe();
      anim.stop();
    };
  }, [router, floatY]);

  const onLogin = async () => {
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) setError(mapError(error.message, t));
    setLoading(false);
  };

  const onForgotPassword = async () => {
    const e = email.trim();
    if (!e) {
      Alert.alert(t('login.alerts.resetTitle'), t('login.alerts.resetMessage'));
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(e);
    setLoading(false);

    if (error) {
      Alert.alert(t('login.alerts.errorTitle'), t('login.alerts.errorMessage'));
      return;
    }
    Alert.alert(t('login.alerts.doneTitle'), t('login.alerts.doneMessage'));
  };

  const onGoogle = async () => {
    // UI jest, integrację dodamy później (build)
    setGoogleLoading(true);
    setTimeout(() => {
      setGoogleLoading(false);
      Alert.alert(t('login.alerts.soonTitle'), t('login.alerts.soonMessage'));
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
        {/* logo (pływa lekko) */}
        <Animated.View style={[styles.logoWrap, { transform: [{ translateY: floatY }] }]}>
          <Image
            source={require('../../assets/logo.png')}
            style={styles.logoImg}
            resizeMode="contain"
          />
        </Animated.View>

        <TextInput
          placeholder={t('login.form.emailPlaceholder')}
          placeholderTextColor="rgba(255,255,255,0.45)"
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          placeholder={t('login.form.passwordPlaceholder')}
          placeholderTextColor="rgba(255,255,255,0.45)"
          style={styles.input}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          disabled={loading}
          onPress={onLogin}
          style={[styles.primaryBtn, loading && { opacity: 0.7 }]}
          activeOpacity={0.9}
        >
          {loading ? <ActivityIndicator /> : <Text style={styles.primaryText}>{t('login.form.submit')}</Text>}
        </TouchableOpacity>

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

        <TouchableOpacity onPress={onForgotPassword} style={styles.forgotWrap} activeOpacity={0.85}>
          <Text style={styles.forgotText}>{t('login.form.forgotPassword')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/(auth)/register')}
          style={styles.bottomLinkWrap}
          activeOpacity={0.85}
        >
          <Text style={styles.bottomLink}>
            {t('login.form.noAccount')} <Text style={styles.bottomLinkStrong}>{t('login.form.createAccount')}</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function mapError(msg: string, t: any) {
  const l = msg.toLowerCase();
  if (l.includes('invalid login credentials')) return t('login.errors.invalidCredentials');
  if (l.includes('email not confirmed')) return t('login.errors.emailNotConfirmed');
  return t('login.errors.generic');
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

  // logo WYŻEJ: tu sterujesz wysokością
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

  googleBtn: {
    marginTop: 16,
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleLogo: { width: 160, height: 160 },

  forgotWrap: { marginTop: 14, alignItems: 'center' },
  forgotText: { color: 'rgba(255,255,255,0.75)', fontWeight: '800' },

  bottomLinkWrap: { marginTop: 18, alignItems: 'center' },
  bottomLink: { color: 'rgba(255,255,255,0.65)' },
  bottomLinkStrong: { color: '#10B981', fontWeight: '900' },
});
