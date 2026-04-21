import { useEffect, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { supabase } from '../lib/supabase';
import { AppButton, AppHeader, AppInput, AppScreen } from '../src/ui/components';
import { colors, spacing, typography } from '../src/ui/theme';

export default function ResetPasswordScreen() {
  const { t } = useTranslation('auth');
  const params = useLocalSearchParams<{ status?: string }>();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (params.status === 'invalid') {
        if (!mounted) return;
        setError(t('reset.errors.invalidLink', { defaultValue: 'This password reset link is invalid or has expired.' }));
        setReady(true);
        return;
      }

      const { data, error: sessionError } = await supabase.auth.getSession();

      if (!mounted) return;

      if (sessionError || !data.session) {
        setError(t('reset.errors.invalidLink', { defaultValue: 'This password reset link is invalid or has expired.' }));
      }

      setReady(true);
    })();

    return () => {
      mounted = false;
    };
  }, [params.status, t]);

  const onSubmit = async () => {
    setError(null);

    if (!password || password.length < 8) {
      setError(t('reset.errors.passwordTooShort', { defaultValue: 'Password must be at least 8 characters.' }));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('reset.errors.passwordsMismatch', { defaultValue: 'Passwords do not match.' }));
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        throw updateError;
      }

      setSuccess(true);
      Alert.alert(
        t('reset.success.title', { defaultValue: 'Password updated' }),
        t('reset.success.message', { defaultValue: 'Your new password has been saved.' }),
        [
          {
            text: t('reset.success.cta', { defaultValue: 'Continue' }),
            onPress: () => router.replace('/(app)'),
          },
        ]
      );
    } catch (nextError: any) {
      setError(nextError?.message ?? t('reset.errors.updateFailed', { defaultValue: 'Could not update the password. Please try again.' }));
    } finally {
      setLoading(false);
    }
  };

  const goToLogin = async () => {
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
  };

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
              <Text style={styles.title}>{t('reset.title', { defaultValue: 'Set a new password' })}</Text>
              <Text style={styles.subtitle}>{t('reset.subtitle', { defaultValue: 'Enter a new password for your account.' })}</Text>

              {!ready ? (
                <Text style={styles.info}>{t('reset.loading', { defaultValue: 'Verifying your reset link...' })}</Text>
              ) : error && !success ? (
                <View style={styles.errorBlock}>
                  <Text style={styles.error}>{error}</Text>
                  <TouchableOpacity onPress={goToLogin} style={styles.secondaryLink} activeOpacity={0.85}>
                    <Text style={styles.secondaryLinkText}>{t('reset.backToLogin', { defaultValue: 'Back to login' })}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <AppInput
                    placeholder={t('reset.form.passwordPlaceholder', { defaultValue: 'New password' })}
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                    containerStyle={styles.inputWrap}
                  />
                  <AppInput
                    placeholder={t('reset.form.repeatPasswordPlaceholder', { defaultValue: 'Repeat new password' })}
                    secureTextEntry
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    containerStyle={styles.inputWrap}
                  />

                  {error ? <Text style={styles.error}>{error}</Text> : null}

                  <AppButton
                    title={t('reset.form.submit', { defaultValue: 'Save new password' })}
                    loading={loading}
                    disabled={loading || success}
                    onPress={onSubmit}
                    style={styles.primaryBtn}
                  />

                  <TouchableOpacity onPress={goToLogin} style={styles.secondaryLink} activeOpacity={0.85}>
                    <Text style={styles.secondaryLinkText}>{t('reset.backToLogin', { defaultValue: 'Back to login' })}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </AppScreen>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
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
  title: {
    color: colors.text,
    ...typography.sectionTitle,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textMuted,
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  info: {
    color: colors.textMuted,
    ...typography.body,
    textAlign: 'center',
  },
  inputWrap: { marginBottom: spacing.md },
  errorBlock: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  error: { color: colors.danger, marginBottom: spacing.sm, textAlign: 'center' },
  primaryBtn: { marginTop: spacing.xs + 2 },
  secondaryLink: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  secondaryLinkText: {
    color: colors.textSoft,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
});
