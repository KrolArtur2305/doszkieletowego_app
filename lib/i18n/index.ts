import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import { resources } from './resources';
import { getStoredLanguage, setStoredLanguage } from './storage';
import {
  SUPPORTED_LANGUAGES,
  FALLBACK_LANGUAGE,
  DEFAULT_NS,
  NAMESPACES,
  type AppLanguage,
} from './languages';

let initPromise: Promise<void> | null = null;

function normalizeToSupported(lng: string | null | undefined): AppLanguage | null {
  if (!lng) return null;
  const base = lng.split('-')[0]?.toLowerCase();
  if (SUPPORTED_LANGUAGES.includes(base as AppLanguage)) return base as AppLanguage;
  return null;
}

function resolveInitialLanguage(saved: string | null): AppLanguage {
  const fromStorage = normalizeToSupported(saved);
  if (fromStorage) return fromStorage;

  const sys = Localization.getLocales?.()[0];
  const sysCode = normalizeToSupported(sys?.languageTag || sys?.languageCode);
  if (sysCode) return sysCode;

  return FALLBACK_LANGUAGE;
}

export async function initI18n(): Promise<void> {
  if (i18n.isInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const saved = await getStoredLanguage();
    const lng = resolveInitialLanguage(saved);

    await i18n.use(initReactI18next).init({
      resources,
      lng,
      fallbackLng: FALLBACK_LANGUAGE,
      supportedLngs: [...SUPPORTED_LANGUAGES],
      nonExplicitSupportedLngs: true,
      ns: [...NAMESPACES],
      defaultNS: DEFAULT_NS,
      interpolation: { escapeValue: false },
      returnNull: false,
      returnEmptyString: false,
      compatibilityJSON: 'v4',
      react: { useSuspense: false },
    });
  })();

  return initPromise;
}

export async function setAppLanguage(lng: AppLanguage): Promise<void> {
  await setStoredLanguage(lng);
  await i18n.changeLanguage(lng);
}

export { SUPPORTED_LANGUAGES };
export type { AppLanguage };

export default i18n;
