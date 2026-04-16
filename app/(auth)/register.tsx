import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Alert,
  TouchableWithoutFeedback,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { supabase } from '../../lib/supabase';
import { signInWithGoogleMobile } from '../../src/services/auth/googleOAuth';
import { AppButton, AppHeader, AppInput, AppScreen } from '../../src/ui/components';
import { colors, radius, spacing, typography } from '../../src/ui/theme';

const GOOGLE_AUTH_ENABLED = false;

export default function RegisterScreen() {
  const router = useRouter();
  const { t } = useTranslation('auth');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) router.replace('/(app)');
    });

    return () => {
      mounted = false;
    };
  }, [router]);

  const onRegister = async () => {
    setError(null);

    const e = email.trim();
    if (!e) return setError(t('register.errors.enterEmail'));
    if (password.length < 6) return setError(t('register.errors.passwordTooShort'));
    if (password !== password2) return setError(t('register.errors.passwordsMismatch'));

    setLoading(true);

    const { error: registerError } = await supabase.auth.signUp({
      email: e,
      password,
    });

    setLoading(false);

    if (registerError) {
      setError(mapRegisterError(registerError.message, t));
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
      await signInWithGoogleMobile();
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
        <AppScreen>
          <View style={styles.content}>
            <AppHeader
              title="BuildIQ"
              style={styles.header}
              rightSlot={
                <TouchableOpacity
                  onPress={() => router.replace('/(auth)/welcome')}
                  style={styles.headerBackBtn}
                  activeOpacity={0.8}
                >
                  <Text style={styles.backText}>←</Text>
                </TouchableOpacity>
              }
            />

            <View style={styles.formBlock}>
              <View>
                <AppInput
                  placeholder={t('register.form.emailPlaceholder')}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  containerStyle={styles.inputWrap}
                />

                <AppInput
                  placeholder={t('register.form.passwordPlaceholder')}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  containerStyle={styles.inputWrap}
                />

                <AppInput
                  placeholder={t('register.form.repeatPasswordPlaceholder')}
                  secureTextEntry
                  value={password2}
                  onChangeText={setPassword2}
                  containerStyle={styles.inputWrap}
                />

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <AppButton
                  title={t('register.form.submit')}
                  loading={loading}
                  onPress={onRegister}
                  style={styles.primaryBtn}
                />

                {GOOGLE_AUTH_ENABLED ? (
                  <AppButton
                    title={googleLoading ? t('common:loading', { defaultValue: 'Ładowanie...' }) : 'Google'}
                    disabled={googleLoading}
                    onPress={handleGoogleLogin}
                    variant="secondary"
                    style={styles.googleBtn}
                  />
                ) : null}

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
          </View>
        </AppScreen>
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
  container: { flex: 1, backgroundColor: colors.bg },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl + 2,
    backgroundColor: colors.bg,
  },
  header: {
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  headerBackBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backText: { color: colors.textSoft, fontSize: 22, fontWeight: '800' },
  formBlock: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: spacing['2xl'],
  },
  inputWrap: { marginBottom: spacing.md },
  error: { color: colors.danger, marginBottom: spacing.sm, textAlign: 'center' },
  primaryBtn: { marginTop: spacing.xs + 2 },
  googleBtn: {
    marginTop: spacing.lg,
  },
  bottomLinkWrap: { marginTop: spacing.lg + 2, alignItems: 'center' },
  bottomLink: { color: colors.textMuted, ...typography.body },
  bottomLinkStrong: { color: colors.accentBright, fontWeight: '700' },
});
