import en_auth from '../../locales/en/auth.json';
import en_budget from '../../locales/en/budget.json';
import en_common from '../../locales/en/common.json';
import en_dashboard from '../../locales/en/dashboard.json';
import en_documents from '../../locales/en/documents.json';
import en_navigation from '../../locales/en/navigation.json';
import en_profile from '../../locales/en/profile.json';
import en_stages from '../../locales/en/stages.json';

import pl_auth from '../../locales/pl/auth.json';
import pl_budget from '../../locales/pl/budget.json';
import pl_common from '../../locales/pl/common.json';
import pl_dashboard from '../../locales/pl/dashboard.json';
import pl_documents from '../../locales/pl/documents.json';
import pl_navigation from '../../locales/pl/navigation.json';
import pl_profile from '../../locales/pl/profile.json';
import pl_stages from '../../locales/pl/stages.json';

export const resources = {
  en: {
    common: en_common,
    auth: en_auth,
    navigation: en_navigation,
    dashboard: en_dashboard,
    stages: en_stages,
    budget: en_budget,
    documents: en_documents,
    profile: en_profile,
  },
  pl: {
    common: pl_common,
    auth: pl_auth,
    navigation: pl_navigation,
    dashboard: pl_dashboard,
    stages: pl_stages,
    budget: pl_budget,
    documents: pl_documents,
    profile: pl_profile,
  },
} as const;
