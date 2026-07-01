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

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation('auth');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  const onLogin = async () => {
    if (authBusy) return;
    setError(null);
    setLoading(true);
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (loginError) setError(mapError(loginError.message, t));
    } catch (e: any) {
      setError(mapError(e?.message ?? 'network error', t));
    } finally {
      setLoading(false);
    }
  };

  const onForgotPassword = async () => {
    if (authBusy) return;
    const e = email.trim();
    if (!e) {
      Alert.alert(t('login.alerts.resetTitle'), t('login.alerts.resetMessage'));
      return;
    }
    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(e, {
        redirectTo: getAuthCallbackRedirectUri(),
      });

      if (resetError) {
        Alert.alert(t('login.alerts.errorTitle'), t('login.alerts.errorMessage'));
        return;
      }
      Alert.alert(t('login.alerts.doneTitle'), t('login.alerts.doneMessage'));
    } catch {
      Alert.alert(t('login.alerts.errorTitle'), t('login.alerts.errorMessage'));
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
      Alert.alert(t('login.alerts.googleError'));
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
          t('login.alerts.appleError'),
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
      Alert.alert(t('login.alerts.facebookError'));
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
                  disabled={appleLoading || googleLoading || facebookLoading}
                  onPress={onLogin}
                  style={styles.primaryBtn}
                />

                {appleAvailable ? (
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
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
                    accessibilityLabel={t('login.form.googleCta')}
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
                    title={facebookLoading ? t('common:loading') : t('login.form.facebookCta')}
                    disabled={authBusy}
                    onPress={handleFacebookLogin}
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
  forgotWrap: { marginTop: spacing.lg - 2, alignItems: 'center' },
  forgotText: { color: colors.textSoft, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  bottomLinkWrap: { marginTop: spacing.lg + 2, alignItems: 'center' },
  bottomLink: { color: colors.textMuted, ...typography.body },
  bottomLinkStrong: { color: colors.accentBright, fontWeight: '700' },
});
