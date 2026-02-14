export const SUPPORTED_LANGUAGES = ['en', 'pl'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const FALLBACK_LANGUAGE: AppLanguage = 'en';

export const DEFAULT_NS = 'common';

export const NAMESPACES = [
  'common',
  'auth',
  'navigation',
  'dashboard',
  'stages',
  'budget',
  'documents',
  'profile',
  'settings',
  'photos',
] as const;

export type AppNamespace = (typeof NAMESPACES)[number];
