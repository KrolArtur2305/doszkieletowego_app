import en_auth from '../../locales/en/auth.json';
import en_project from '../../locales/en/project.json';


import en_budget from '../../locales/en/budget.json';
import en_common from '../../locales/en/common.json';
import en_dashboard from '../../locales/en/dashboard.json';
import en_documents from '../../locales/en/documents.json';
import en_navigation from '../../locales/en/navigation.json';
import en_profile from '../../locales/en/profile.json';
import en_settings from '../../locales/en/settings.json';
import en_stages from '../../locales/en/stages.json';
import en_photos from '../../locales/en/photos.json';

import de_auth from '../../locales/de/auth.json';
import de_project from '../../locales/de/project.json';

import de_budget from '../../locales/de/budget.json';
import de_common from '../../locales/de/common.json';
import de_dashboard from '../../locales/de/dashboard.json';
import de_documents from '../../locales/de/documents.json';
import de_navigation from '../../locales/de/navigation.json';
import de_profile from '../../locales/de/profile.json';
import de_settings from '../../locales/de/settings.json';
import de_stages from '../../locales/de/stages.json';
import de_photos from '../../locales/de/photos.json';

import pl_auth from '../../locales/pl/auth.json';
import pl_project from '../../locales/pl/project.json';

import pl_budget from '../../locales/pl/budget.json';
import pl_common from '../../locales/pl/common.json';
import pl_dashboard from '../../locales/pl/dashboard.json';
import pl_documents from '../../locales/pl/documents.json';
import pl_navigation from '../../locales/pl/navigation.json';
import pl_profile from '../../locales/pl/profile.json';
import pl_settings from '../../locales/pl/settings.json';
import pl_stages from '../../locales/pl/stages.json';
import pl_photos from '../../locales/pl/photos.json';

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
    settings: en_settings,
    photos: en_photos,
    project: en_project,
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
    settings: pl_settings,
    photos: pl_photos,
    project: pl_project,
  },
  de: {
    common: de_common,
    auth: de_auth,
    navigation: de_navigation,
    dashboard: de_dashboard,
    stages: de_stages,
    budget: de_budget,
    documents: de_documents,
    profile: de_profile,
    settings: de_settings,
    photos: de_photos,
    project: de_project,
  },
} as const;
