export const typography = {
  screenTitle: {
    fontSize: 34,
    fontWeight: '900' as const,
    letterSpacing: -0.2,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '900' as const,
    letterSpacing: -0.2,
  },
  cardTitle: {
    fontSize: 17.5,
    fontWeight: '700' as const,
    letterSpacing: -0.1,
  },
  body: {
    fontSize: 14,
    fontWeight: '500' as const,
  },
  meta: {
    fontSize: 13,
    fontWeight: '500' as const,
  },
  button: {
    fontSize: 16.5,
    fontWeight: '700' as const,
    letterSpacing: -0.1,
  },
  label: {
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 0,
  },
} as const;

export type AppTypography = typeof typography;
