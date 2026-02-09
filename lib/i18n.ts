import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import commonPl from '../locales/pl/common.json';
import authPl from '../locales/pl/auth.json';
import navigationPl from '../locales/pl/navigation.json';
import dashboardPl from '../locales/pl/dashboard.json';
import commonEn from '../locales/en/common.json';
import authEn from '../locales/en/auth.json';
import navigationEn from '../locales/en/navigation.json';
import dashboardEn from '../locales/en/dashboard.json';

// TEMP: set to 'pl' after verification
const language = 'en';

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    ns: ['common', 'auth', 'navigation', 'dashboard'],
    defaultNS: 'common',
    resources: {
      pl: {
        common: commonPl,
        auth: authPl,
        navigation: navigationPl,
        dashboard: dashboardPl,
      },
      en: {
        common: commonEn,
        auth: authEn,
        navigation: navigationEn,
        dashboard: dashboardEn,
      },
    },
    interpolation: {
      escapeValue: false,
    },
    compatibilityJSON: 'v4',
  });
}

export default i18n;
