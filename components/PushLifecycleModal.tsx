import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { AppButton, AppCard } from '../src/ui/components';
import { colors, spacing, typography } from '../src/ui/theme';
import type { PushLifecycleModalState } from '../hooks/usePushNotifications';

type PushLifecycleModalProps = {
  state: PushLifecycleModalState | null;
  onConfirm: () => void;
  onDismiss: () => void;
};

export function PushLifecycleModal({ state, onConfirm, onDismiss }: PushLifecycleModalProps) {
  if (!state?.visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.cardWrap}>
          <AppCard contentStyle={styles.card} withShadow={false}>
            <View style={styles.avatar}>
              <Feather name="message-circle" size={24} color={colors.accentBright} />
            </View>

            <Text style={styles.title}>{state.title}</Text>
            <Text style={styles.message}>{state.message}</Text>

            <View style={styles.actions}>
              <AppButton
                title={state.dismissLabel}
                variant="secondary"
                onPress={onDismiss}
                style={styles.button}
              />
              <AppButton title={state.ctaLabel} onPress={onConfirm} style={styles.button} />
            </View>
          </AppCard>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  cardWrap: {
    width: '100%',
  },
  card: {
    padding: spacing.lg,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    backgroundColor: 'rgba(37,240,200,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.24)',
  },
  title: {
    color: colors.text,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '900',
    textAlign: 'center',
  },
  message: {
    ...typography.body,
    marginTop: spacing.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: spacing.lg,
  },
  button: {
    flex: 1,
  },
});
