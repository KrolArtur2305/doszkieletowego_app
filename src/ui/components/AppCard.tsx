import React from 'react';
import {
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';

import { colors, effects, radius, shadows } from '../tokens';

type AppCardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  blurIntensity?: number;
  tint?: 'light' | 'dark' | 'default' | 'systemMaterial';
  withShadow?: boolean;
  glow?: boolean;
};

export function AppCard({
  children,
  style,
  contentStyle,
  blurIntensity = effects.blur.card,
  tint = 'dark',
  withShadow = true,
  glow = false,
}: AppCardProps) {
  return (
    <View style={[styles.outer, withShadow && styles.shadow, glow && styles.glow, style]}>
      <View style={styles.frame}>
        <View pointerEvents="none" style={styles.underlay} />
        <BlurView intensity={blurIntensity} tint={tint} style={[styles.card, contentStyle]}>
          {children}
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    borderRadius: radius.lg,
  },
  shadow: {
    ...shadows.card,
  },
  glow: {
    ...shadows.accentGlow,
  },
  frame: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderAccentSoft,
    backgroundColor: colors.surfaceFrame,
    padding: 1,
    overflow: 'hidden',
  },
  underlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surfaceOverlay,
  },
  card: {
    borderRadius: radius.lg - 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
});
