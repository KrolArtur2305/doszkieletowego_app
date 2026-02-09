import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import commonPl from '../locales/pl/common.json';
import authPl from '../locales/pl/auth.json';
import navigationPl from '../locales/pl/navigation.json';
import dashboardPl from '../locales/pl/dashboard.json';

const language = Localization.getLocales()[0]?.languageCode === 'pl' ? 'pl' : 'pl';

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'pl',
    ns: ['common', 'auth', 'navigation', 'dashboard'],
    defaultNS: 'common',
    resources: {
      pl: {
        common: commonPl,
        auth: authPl,
        navigation: navigationPl,
        dashboard: dashboardPl,
      },
    },
    interpolation: {
      escapeValue: false,
    },
    compatibilityJSON: 'v4',
  });
}

export default i18n;
