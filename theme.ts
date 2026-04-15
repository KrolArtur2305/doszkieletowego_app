import { colors, effects, radius, spacing, typography, shadows } from './src/ui/theme';

export const COLORS = {
  bg: 'transparent',
  accent: colors.accent,
  neon: colors.accentBright,
  text: colors.text,
  textMuted: colors.textMuted,
  textSoft: 'rgba(255,255,255,0.70)',
  cardBorder: 'rgba(255,255,255,0.06)',
  cardBorderNeon: colors.borderAccent,
  cardBg: colors.surfaceAlt,
  danger: colors.danger,
  dangerBorder: colors.dangerBorder,
  brand: colors.accent,
};

export const RADIUS = {
  card: radius.xl,
  button: radius.md,
  input: radius.sm,
};

export const SPACING = spacing;
export const TYPOGRAPHY = typography;
export const SHADOWS = shadows;
export const EFFECTS = effects;

export { colors, effects, radius, spacing, typography, shadows };
