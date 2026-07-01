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
  ActivityIndicator,
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
const GOOGLE_LOGO = require('../../assets/google-g.png');

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
  const authBusy = loading || appleLoading || googleLoading || facebookLoading;

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
    if (authBusy) return;
    setError(null);

    const e = email.trim();
    if (!e) return setError(t('register.errors.enterEmail'));
    if (password.length < 6) return setError(t('register.errors.passwordTooShort'));
    if (password !== password2) return setError(t('register.errors.passwordsMismatch'));

    setLoading(true);
    try {
      const { data, error: registerError } = await supabase.auth.signUp({
        email: e,
        password,
        options: {
          emailRedirectTo: getAuthCallbackRedirectUri(),
        },
      });

      if (registerError) {
        setError(mapRegisterError(registerError.message, t));
        return;
      }

      if (data.session) {
        router.replace('/(app)');
        return;
      }

      Alert.alert(
        t('register.alerts.checkEmailTitle'),
        t('register.alerts.checkEmailMessage'),
        [{ text: t('common:ok'), onPress: () => router.replace('/(auth)/login') }]
      );
    } catch (e: any) {
      setError(mapRegisterError(e?.message ?? 'network error', t));
    } finally {
      setLoading(false);
    }
  };

  async function handleGoogleLogin() {
    if (authBusy) return;
    setError(null);
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
        <AppScreen scroll contentContainerStyle={styles.content}>
            <View style={styles.brandStack}>
              <Image source={APP_LOGO} style={styles.brandLogo} resizeMode="contain" />
              <View style={styles.brandName} accessibilityLabel="BuildIQ">
                <Text style={[styles.brandNameText, styles.brandNameBuild]}>Build</Text>
                <Text style={[styles.brandNameText, styles.brandNameIq]}>IQ</Text>
              </View>
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
                  disabled={appleLoading || googleLoading || facebookLoading}
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
                      authBusy && styles.appleButtonDisabled,
                    ]}
                    onPress={handleAppleLogin}
                  />
                ) : null}

                {GOOGLE_AUTH_ENABLED ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={t('register.form.googleCta')}
                    activeOpacity={0.86}
                    disabled={authBusy}
                    onPress={handleGoogleLogin}
                    style={[
                      styles.googleIconBtn,
                      authBusy && styles.appleButtonDisabled,
                    ]}
                  >
                    {googleLoading ? (
                      <ActivityIndicator color={colors.textSoft} />
                    ) : (
                      <Image source={GOOGLE_LOGO} style={styles.googleIcon} resizeMode="contain" />
                    )}
                  </TouchableOpacity>
                ) : null}

                {FACEBOOK_AUTH_ENABLED ? (
                  <AppButton
                    title={facebookLoading ? t('common:loading') : t('register.form.facebookCta')}
                    disabled={authBusy}
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
    flexGrow: 1,
    paddingHorizontal: spacing.xl + 2,
    backgroundColor: colors.bg,
  },
  brandStack: {
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing['2xl'] + spacing.md,
  },
  brandLogo: {
    width: 146,
    height: 146,
  },
  brandName: {
    marginTop: -30,
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandNameText: {
    fontSize: 29,
    lineHeight: 34,
    fontFamily: 'Syne_800ExtraBold',
    fontWeight: '800',
    letterSpacing: -0.44,
    includeFontPadding: false,
  },
  brandNameBuild: {
    color: '#FFFFFF',
  },
  brandNameIq: {
    color: '#0E8F84',
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
  googleIconBtn: {
    width: 54,
    height: 54,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  googleIcon: {
    width: 54,
    height: 54,
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
