export const SUPPORTED_LANGUAGES = ['en', 'pl', 'de'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export type AppLanguageOption = {
  key: AppLanguage;
  shortLabel: string;
  labelKey: `appSettings.language.options.${AppLanguage}`;
  flag: string;
  locale: string;
  defaultCountry: string;
};

export const LANGUAGE_OPTIONS: AppLanguageOption[] = [
  { key: 'pl', shortLabel: 'PL', labelKey: 'appSettings.language.options.pl', flag: '🇵🇱', locale: 'pl-PL', defaultCountry: 'pl' },
  { key: 'en', shortLabel: 'EN', labelKey: 'appSettings.language.options.en', flag: '🇬🇧', locale: 'en-US', defaultCountry: 'gb' },
  { key: 'de', shortLabel: 'DE', labelKey: 'appSettings.language.options.de', flag: '🇩🇪', locale: 'de-DE', defaultCountry: 'de' },
];

export const FALLBACK_LANGUAGE: AppLanguage = 'en';

export function normalizeAppLanguage(lng: string | null | undefined): AppLanguage | null {
  if (!lng) return null;
  const base = lng.split('-')[0]?.toLowerCase();
  if (SUPPORTED_LANGUAGES.includes(base as AppLanguage)) return base as AppLanguage;
  return null;
}

export function getLanguageOption(lng: string | null | undefined): AppLanguageOption {
  const key = normalizeAppLanguage(lng) ?? FALLBACK_LANGUAGE;
  return LANGUAGE_OPTIONS.find((option) => option.key === key) ?? LANGUAGE_OPTIONS[0];
}

export function getAppLocale(lng: string | null | undefined): string {
  return getLanguageOption(lng).locale;
}

export function getDefaultCountry(lng: string | null | undefined): string {
  return getLanguageOption(lng).defaultCountry;
}

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
  'tasks',
  'contacts',
  'onboarding',
  'buddy',
  'journal',
  'investment',
  'plan',
  'project',
  'subscription',
] as const;

export type AppNamespace = (typeof NAMESPACES)[number];
