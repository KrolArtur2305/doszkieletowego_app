export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.38,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 3,
  },
  cardStrong: {
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 4,
  },
  accentGlow: {
    shadowColor: '#25F0C8',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
} as const;

export type AppShadows = typeof shadows;
