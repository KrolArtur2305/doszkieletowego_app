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
import { colors, spacing, typography } from '../../src/ui/theme';

const GOOGLE_AUTH_ENABLED = false;

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation('auth');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) router.replace('/(app)');
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) router.replace('/(app)');
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  const onLogin = async () => {
    setError(null);
    setLoading(true);

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (loginError) setError(mapError(loginError.message, t));
    setLoading(false);
  };

  const onForgotPassword = async () => {
    const e = email.trim();
    if (!e) {
      Alert.alert(t('login.alerts.resetTitle'), t('login.alerts.resetMessage'));
      return;
    }
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(e);
    setLoading(false);

    if (resetError) {
      Alert.alert(t('login.alerts.errorTitle'), t('login.alerts.errorMessage'));
      return;
    }
    Alert.alert(t('login.alerts.doneTitle'), t('login.alerts.doneMessage'));
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
            <AppHeader title="BuildIQ" style={styles.header} height={92} />

            <View style={styles.formBlock}>
              <View>
                <AppInput
                  placeholder={t('login.form.emailPlaceholder')}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  containerStyle={styles.inputWrap}
                />
                <AppInput
                  placeholder={t('login.form.passwordPlaceholder')}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  containerStyle={styles.inputWrap}
                />

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <AppButton
                  title={t('login.form.submit')}
                  loading={loading}
                  onPress={onLogin}
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
            </View>
          </View>
        </AppScreen>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

function mapError(msg: string, t: any) {
  const l = msg.toLowerCase();
  if (l.includes('invalid login credentials')) return t('login.errors.invalidCredentials');
  if (l.includes('email not confirmed')) return t('login.errors.emailNotConfirmed');
  return t('login.errors.generic');
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
    marginBottom: spacing.md,
  },
  formBlock: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: spacing.xl,
    paddingBottom: spacing['2xl'],
  },
  inputWrap: { marginBottom: spacing.md },
  error: { color: colors.danger, marginBottom: spacing.sm, textAlign: 'center' },
  primaryBtn: { marginTop: spacing.xs + 2 },
  googleBtn: {
    marginTop: spacing.lg,
  },
  forgotWrap: { marginTop: spacing.lg - 2, alignItems: 'center' },
  forgotText: { color: colors.textSoft, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  bottomLinkWrap: { marginTop: spacing.lg + 2, alignItems: 'center' },
  bottomLink: { color: colors.textMuted, ...typography.body },
  bottomLinkStrong: { color: colors.accentBright, fontWeight: '700' },
});
