import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

import commonPl from '../locales/pl/common.json';
import authPl from '../locales/pl/auth.json';
import navigationPl from '../locales/pl/navigation.json';
import dashboardPl from '../locales/pl/dashboard.json';
import stagesPl from '../locales/pl/stages.json';
import budgetPl from '../locales/pl/budget.json';
import documentsPl from '../locales/pl/documents.json';
import profilePl from '../locales/pl/profile.json';

import commonEn from '../locales/en/common.json';
import authEn from '../locales/en/auth.json';
import navigationEn from '../locales/en/navigation.json';
import dashboardEn from '../locales/en/dashboard.json';
import stagesEn from '../locales/en/stages.json';
import budgetEn from '../locales/en/budget.json';
import documentsEn from '../locales/en/documents.json';
import profileEn from '../locales/en/profile.json';

const LANG_KEY = 'app_language';

const resources = {
  pl: {
    common: commonPl,
    auth: authPl,
    navigation: navigationPl,
    dashboard: dashboardPl,
    stages: stagesPl,
    budget: budgetPl,
    documents: documentsPl,
    profile: profilePl,
  },
  en: {
    common: commonEn,
    auth: authEn,
    navigation: navigationEn,
    dashboard: dashboardEn,
    stages: stagesEn,
    budget: budgetEn,
    documents: documentsEn,
    profile: profileEn,
  },
} as const;

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: 'pl', // startowo PL, zaraz nadpiszemy z AsyncStorage jeśli user wybrał EN
    fallbackLng: 'pl',
    ns: ['common', 'auth', 'navigation', 'dashboard', 'stages', 'budget', 'documents', 'profile'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    compatibilityJSON: 'v4',
  });

  // Wczytaj zapisany język (jeśli istnieje) i przełącz
  AsyncStorage.getItem(LANG_KEY)
    .then((saved) => {
      if (saved === 'pl' || saved === 'en') {
        i18n.changeLanguage(saved);
      }
    })
    .catch(() => {
      // nic - zostaje fallback
    });
}

export { LANG_KEY };
export default i18n;
