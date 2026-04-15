import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';

import { colors, radius, spacing, typography } from '../tokens';

type AppButtonVariant = 'primary' | 'secondary' | 'ghost';

type AppButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: AppButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AppButton({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: AppButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textStyles[variant].color} />
      ) : (
        <Text style={[styles.text, textStyles[variant], isDisabled && styles.disabledText]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  primary: {
    backgroundColor: colors.accentFill,
    borderColor: colors.borderAccent,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  pressed: {
    opacity: 0.88,
  },
  disabled: {
    backgroundColor: colors.disabledBg,
    borderColor: colors.disabledBorder,
  },
  text: {
    ...typography.button,
    textAlign: 'center',
  },
  primaryText: {
    color: colors.accentBright,
  },
  secondaryText: {
    color: colors.textSoft,
  },
  ghostText: {
    color: colors.textMuted,
  },
  disabledText: {
    color: colors.textDisabled,
  },
});

const variantStyles = StyleSheet.create({
  primary: styles.primary,
  secondary: styles.secondary,
  ghost: styles.ghost,
});

const textStyles = StyleSheet.create({
  primary: styles.primaryText,
  secondary: styles.secondaryText,
  ghost: styles.ghostText,
});
