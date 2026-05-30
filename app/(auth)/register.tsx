import { useEffect, useState } from 'react';
import {
  Image,
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
import * as AppleAuthentication from 'expo-apple-authentication';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { supabase } from '../../lib/supabase';
import { getAuthCallbackRedirectUri } from '../../src/services/auth/deepLinkAuth';
import { isAppleSignInAvailable, signInWithAppleMobile } from '../../src/services/auth/appleAuth';
import { signInWithFacebookMobile, signInWithGoogleMobile } from '../../src/services/auth/googleOAuth';
import { AppButton, AppInput, AppScreen } from '../../src/ui/components';
import { colors, spacing, typography } from '../../src/ui/theme';

const GOOGLE_AUTH_ENABLED = true;
const FACEBOOK_AUTH_ENABLED = false;
const APP_LOGO = require('../../assets/logo.png');

export default function RegisterScreen() {
  const router = useRouter();
  const { t } = useTranslation('auth');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [loading, setLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [facebookLoading, setFacebookLoading] = useState(false);
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

  useEffect(() => {
    let mounted = true;

    isAppleSignInAvailable()
      .then((available) => {
        if (mounted) setAppleAvailable(available);
      })
      .catch(() => {
        if (mounted) setAppleAvailable(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

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
      options: {
        emailRedirectTo: getAuthCallbackRedirectUri(),
      },
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
      Alert.alert(t('register.alerts.googleError'));
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleAppleLogin() {
    if (appleLoading || googleLoading || facebookLoading || loading) return;
    setAppleLoading(true);
    try {
      await signInWithAppleMobile();
    } catch (err: any) {
      if (err?.code !== 'ERR_REQUEST_CANCELED') {
        console.error('Apple login error:', err);
        Alert.alert(
          t('register.alerts.appleError'),
          __DEV__ && err?.message ? String(err.message) : undefined
        );
      }
    } finally {
      setAppleLoading(false);
    }
  }

  async function handleFacebookLogin() {
    setFacebookLoading(true);
    try {
      await signInWithFacebookMobile();
    } catch (err) {
      console.error('Facebook login error:', err);
      Alert.alert(t('register.alerts.facebookError'));
    } finally {
      setFacebookLoading(false);
    }
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        style={styles.container}
      >
        <AppScreen>
          <View style={styles.content}>
            <View style={styles.brandStack}>
              <Image source={APP_LOGO} style={styles.brandLogo} resizeMode="contain" />
              <Text style={styles.brandName}>BuildIQ</Text>
            </View>

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

                {appleAvailable ? (
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                    cornerRadius={10}
                    style={[
                      styles.googleBtn,
                      styles.appleButton,
                      (appleLoading || googleLoading || facebookLoading || loading) && styles.appleButtonDisabled,
                    ]}
                    onPress={handleAppleLogin}
                  />
                ) : null}

                {GOOGLE_AUTH_ENABLED ? (
                  <AppButton
                    title={googleLoading ? t('common:loading') : t('register.form.googleCta')}
                    disabled={googleLoading || appleLoading || facebookLoading || loading}
                    onPress={handleGoogleLogin}
                    variant="secondary"
                    style={styles.googleBtn}
                  />
                ) : null}

                {FACEBOOK_AUTH_ENABLED ? (
                  <AppButton
                    title={facebookLoading ? t('common:loading') : t('register.form.facebookCta')}
                    disabled={facebookLoading || appleLoading || googleLoading || loading}
                    onPress={handleFacebookLogin}
                    variant="secondary"
                    style={styles.googleBtn}
                  />
                ) : null}

                <TouchableOpacity
                  onPress={() => router.push('/(auth)/login')}
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
  brandStack: {
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  brandLogo: {
    width: 116,
    height: 116,
  },
  brandName: {
    marginTop: spacing.xs,
    color: colors.text,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '900',
    letterSpacing: 0,
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
  appleButton: {
    width: '100%',
    height: 52,
  },
  appleButtonDisabled: {
    opacity: 0.55,
  },
  bottomLinkWrap: { marginTop: spacing.lg + 2, alignItems: 'center' },
  bottomLink: { color: colors.textMuted, ...typography.body },
  bottomLinkStrong: { color: colors.accentBright, fontWeight: '700' },
});
