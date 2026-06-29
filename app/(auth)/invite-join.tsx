import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppButton, AppCard, AppScreen } from '../../src/ui/components';
import { colors, spacing, typography } from '../../src/ui/theme';
import {
  acceptPendingInvestmentInvite,
  clearPendingInviteCode,
  convertBuildOwnerToPartner,
  getPendingInviteCode,
} from '../../lib/investmentInvite';

type InviteState = 'loading' | 'conflict' | 'error';

export default function InviteJoinScreen() {
  const router = useRouter();
  const { t } = useTranslation(['auth', 'common']);
  const [state, setState] = useState<InviteState>('loading');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const conflictMessage = useMemo(
    () => t('auth:inviteJoin.convertWarningMessage'),
    [t]
  );

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const code = await getPendingInviteCode();
        if (!alive) return;

        if (!code) {
          router.replace('/(app)');
          return;
        }

        setInviteCode(code);

        await acceptPendingInvestmentInvite();
        if (!alive) return;
        router.replace('/(app)/(tabs)/dashboard');
      } catch (error) {
        const message = String((error as any)?.message ?? '').toLowerCase();
        if (message.includes('already_has_active_build')) {
          setState('conflict');
          return;
        }

        setErrorText(
          message.includes('cannot_join_own_build')
            ? t('common:errors.cannotJoinOwnBuild')
            : message.includes('invalid_or_expired_invite')
              ? t('auth:inviteJoin.invalidMessage')
              : String((error as any)?.message ?? t('auth:inviteJoin.genericMessage'))
        );
        setState('error');
      }
    })();

    return () => {
      alive = false;
    };
  }, [router, t]);

  const handleConvert = async () => {
    if (!inviteCode || busy) return;

    setBusy(true);
    try {
      await convertBuildOwnerToPartner(inviteCode);
      await clearPendingInviteCode();
      router.replace('/(app)/(tabs)/dashboard');
    } catch (error) {
      const message = String((error as any)?.message ?? '').toLowerCase();
      setErrorText(
        message.includes('cannot_join_own_build')
          ? t('common:errors.cannotJoinOwnBuild')
          : String((error as any)?.message ?? t('auth:inviteJoin.genericMessage'))
      );
      setState('error');
    } finally {
      setBusy(false);
    }
  };

  const handleBack = async () => {
    await clearPendingInviteCode();
    router.replace('/(auth)/welcome');
  };

  return (
    <AppScreen scroll contentContainerStyle={styles.screen}>
      <AppCard style={styles.card} contentStyle={styles.cardContent} withShadow={false}>
        {state === 'loading' ? (
          <>
            <Text style={styles.title}>{t('auth:inviteJoin.loadingTitle')}</Text>
            <Text style={styles.subtitle}>{t('auth:inviteJoin.loadingMessage')}</Text>
          </>
        ) : null}

        {state === 'conflict' ? (
          <>
            <Text style={styles.title}>{t('auth:inviteJoin.convertWarningTitle')}</Text>
            <Text style={styles.subtitle}>{conflictMessage}</Text>
            <Text style={styles.note}>{t('auth:inviteJoin.convertNote')}</Text>

            <AppButton
              title={busy ? t('auth:inviteJoin.processing') : t('auth:inviteJoin.convertAction')}
              loading={busy}
              onPress={handleConvert}
              style={styles.primaryBtn}
            />

            <AppButton
              title={t('common:cancel')}
              variant="secondary"
              onPress={handleBack}
              style={styles.secondaryBtn}
            />
          </>
        ) : null}

        {state === 'error' ? (
          <>
            <Text style={styles.title}>{t('auth:inviteJoin.errorTitle')}</Text>
            <Text style={styles.subtitle}>{errorText}</Text>
            <AppButton
              title={t('common:ok')}
              onPress={handleBack}
              style={styles.primaryBtn}
            />
          </>
        ) : null}
      </AppCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl + 2,
    backgroundColor: colors.bg,
  },
  card: {
    width: '100%',
  },
  cardContent: {
    padding: spacing.lg,
  },
  title: {
    ...typography.sectionTitle,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  note: {
    ...typography.label,
    color: colors.textSoft,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  primaryBtn: {
    width: '100%',
    marginBottom: spacing.sm,
  },
  secondaryBtn: {
    width: '100%',
  },
});
