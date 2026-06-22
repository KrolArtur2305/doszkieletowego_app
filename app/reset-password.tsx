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
import { getFriendlyErrorMessage } from '../lib/errorMessages';
import { forceLoggedOutAuthSnapshot } from '../hooks/useSupabaseAuth';
import { AppButton, AppHeader, AppInput, AppScreen } from '../src/ui/components';
import { colors, spacing, typography } from '../src/ui/theme';

const RESET_PASSWORD_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(label));
    }, timeoutMs);

    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

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
        setError(t('reset.errors.invalidLink'));
        setReady(true);
        return;
      }

      try {
        const { data, error: sessionError } = await withTimeout(
          supabase.auth.getSession(),
          RESET_PASSWORD_TIMEOUT_MS,
          'Reset password session load timed out',
        );

        if (!mounted) return;

        if (sessionError || !data.session) {
          setError(t('reset.errors.invalidLink'));
        }
      } catch {
        if (!mounted) return;
        setError(t('reset.errors.invalidLink'));
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
      setError(t('reset.errors.passwordTooShort'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('reset.errors.passwordsMismatch'));
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
        t('reset.success.title'),
        t('reset.success.message'),
        [
          {
            text: t('reset.success.cta'),
            onPress: () => router.replace('/(app)'),
          },
        ]
      );
    } catch (nextError: any) {
      setError(getFriendlyErrorMessage(nextError, t, 'reset.errors.updateFailed'));
    } finally {
      setLoading(false);
    }
  };

    const goToLogin = async () => {
    forceLoggedOutAuthSnapshot();
    await supabase.auth.signOut();
    router.replace('/(auth)/welcome');
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        style={styles.container}
      >
        <AppScreen scroll contentContainerStyle={styles.content}>
            <AppHeader title="BuildIQ" style={styles.header} height={92} />

            <View style={styles.formBlock}>
              <Text style={styles.title}>{t('reset.title')}</Text>
              <Text style={styles.subtitle}>{t('reset.subtitle')}</Text>

              {!ready ? (
                <Text style={styles.info}>{t('reset.loading')}</Text>
              ) : error && !success ? (
                <View style={styles.errorBlock}>
                  <Text style={styles.error}>{error}</Text>
                  <TouchableOpacity onPress={goToLogin} style={styles.secondaryLink} activeOpacity={0.85}>
                    <Text style={styles.secondaryLinkText}>{t('reset.backToLogin')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <AppInput
                    placeholder={t('reset.form.passwordPlaceholder')}
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                    containerStyle={styles.inputWrap}
                  />
                  <AppInput
                    placeholder={t('reset.form.repeatPasswordPlaceholder')}
                    secureTextEntry
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    containerStyle={styles.inputWrap}
                  />

                  {error ? <Text style={styles.error}>{error}</Text> : null}

                  <AppButton
                    title={t('reset.form.submit')}
                    loading={loading}
                    disabled={loading || success}
                    onPress={onSubmit}
                    style={styles.primaryBtn}
                  />

                  <TouchableOpacity onPress={goToLogin} style={styles.secondaryLink} activeOpacity={0.85}>
                    <Text style={styles.secondaryLinkText}>{t('reset.backToLogin')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
        </AppScreen>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: {
    flexGrow: 1,
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
