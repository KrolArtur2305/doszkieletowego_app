import React, { forwardRef, useState } from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';

import { colors, radius, spacing, typography } from '../tokens';

type AppInputProps = TextInputProps & {
  label?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

export const AppInput = forwardRef<TextInput, AppInputProps>(function AppInput(
  {
    label,
    error,
    style,
    containerStyle,
    onFocus,
    onBlur,
    editable = true,
    placeholderTextColor = colors.placeholder,
    ...props
  },
  ref
) {
  const [focused, setFocused] = useState(false);

  const handleFocus: NonNullable<TextInputProps['onFocus']> = (event) => {
    setFocused(true);
    onFocus?.(event);
  };

  const handleBlur: NonNullable<TextInputProps['onBlur']> = (event) => {
    setFocused(false);
    onBlur?.(event);
  };

  return (
    <View style={containerStyle}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <TextInput
        ref={ref}
        editable={editable}
        placeholderTextColor={placeholderTextColor}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={[
          styles.input,
          focused && styles.inputFocused,
          !editable && styles.inputDisabled,
          !!error && styles.inputError,
          style,
        ]}
        {...props}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  label: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  input: {
    ...typography.body,
    minHeight: 52,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  inputFocused: {
    borderColor: colors.borderFocus,
    backgroundColor: colors.inputBgFocused,
  },
  inputDisabled: {
    backgroundColor: colors.disabledBg,
    borderColor: colors.disabledBorder,
    color: colors.textDisabled,
  },
  inputError: {
    borderColor: colors.dangerBorder,
  },
  error: {
    ...typography.meta,
    color: colors.danger,
    marginTop: spacing.sm,
  },
});
