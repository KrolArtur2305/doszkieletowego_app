import AsyncStorage from '@react-native-async-storage/async-storage';

import { workflowBuildType } from './buildWorkflow';
import { normalizeStageGroupCode, stageGroupCodeFromStageCode, type StageGroupCode } from './stageModel';

export type ExpenseSuggestionBuildType = 'murowany' | 'szkieletowy';
export type ExpenseSuggestionStage = 'stan_zero' | 'stan_sso' | 'stan_ssz' | 'instalacje' | 'wykonczenie';
export type ExpenseSuggestionSource = 'system' | 'custom';

export type ExpenseSuggestionItem = {
  id: string;
  build_type: ExpenseSuggestionBuildType;
  stage_key: ExpenseSuggestionStage;
  stage_group_code: StageGroupCode;
  stage_code: string | null;
  expense_key: string;
  expense_name: string;
  expense_name_key: string | null;
  default_type: 'material';
  priority: number;
  is_active: boolean;
  source: ExpenseSuggestionSource;
  hidden?: boolean;
  notApplicable?: boolean;
};

type StoredCustomSuggestion = {
  id: string;
  build_type: ExpenseSuggestionBuildType;
  stage_key: ExpenseSuggestionStage;
  expense_name: string;
  created_at: string;
};

export type StoredExpenseSuggestionPrefs = {
  hidden: string[];
  notApplicable: string[];
  custom: StoredCustomSuggestion[];
};

export const EXPENSE_SUGGESTION_STAGES: ExpenseSuggestionStage[] = [
  'stan_zero',
  'stan_sso',
  'stan_ssz',
  'instalacje',
  'wykonczenie',
];

export const expenseSuggestions = {
  murowany: {
    stan_zero: [
      'kruszywo',
      'beton',
      'stal zbrojeniowa',
      'bloczki fundamentowe',
      'izolacja fundamentów',
      'kanalizacja podposadzkowa',
    ],
    stan_sso: [
      'pustaki / bloczki',
      'zaprawa murarska',
      'beton konstrukcyjny',
      'stal zbrojeniowa',
      'nadproża',
      'konstrukcja stropu',
      'konstrukcja dachu',
    ],
    stan_ssz: [
      'pokrycie dachowe',
      'membrana dachowa',
      'okna',
      'drzwi zewnętrzne',
      'brama garażowa',
      'rynny i obróbki',
      'styropian',
      'elewacja',
    ],
    instalacje: [
      'przewody elektryczne',
      'osprzęt elektryczny',
      'rury wod-kan',
      'pompa ciepła',
      'rekuperacja',
      'materiały instalacyjne',
    ],
    wykonczenie: [
      'tynki',
      'wylewki',
      'gładź',
      'szpachla',
      'drzwi wewnętrzne',
      'parapety wewnętrzne',
    ],
  },
  szkieletowy: {
    stan_zero: [
      'kruszywo',
      'izolacja pod płytę',
      'kanalizacja podposadzkowa',
      'stal zbrojeniowa',
      'beton',
    ],
    stan_sso: [
      'drewno konstrukcyjne',
      'płyty konstrukcyjne',
      'membrana wiatroizolacyjna',
      'izolacja ścian',
      'folia paroizolacyjna',
      'taśmy łączeniowe',
      'wkręty konstrukcyjne',
      'konstrukcja dachu',
    ],
    stan_ssz: [
      'pokrycie dachowe',
      'membrana dachowa',
      'okna',
      'taśmy montażowe',
      'drzwi zewnętrzne',
      'brama garażowa',
      'rynny i obróbki',
      'materiał elewacyjny',
    ],
    instalacje: [
      'przewody elektryczne',
      'osprzęt elektryczny',
      'rury wod-kan',
      'pompa ciepła',
      'rekuperacja',
      'materiały instalacyjne',
    ],
    wykonczenie: [
      'płyty g-k',
      'gładź',
      'szpachla',
      'drzwi wewnętrzne',
      'parapety wewnętrzne',
      'osprzęt elektryczny',
      'materiały wykończeniowe',
    ],
  },
} as const;

const emptyPrefs: StoredExpenseSuggestionPrefs = {
  hidden: [],
  notApplicable: [],
  custom: [],
};

const prefsKey = (userId: string) => `buildiq:expense-suggestions:v1:${userId}`;

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function normalizeSuggestionBuildType(value: unknown): ExpenseSuggestionBuildType {
  return workflowBuildType(String(value ?? '')) === 'szkieletowy' ? 'szkieletowy' : 'murowany';
}

export function groupCodeToSuggestionStage(groupCode: unknown): ExpenseSuggestionStage {
  switch (normalizeStageGroupCode(groupCode)) {
    case 'stan_zero':
      return 'stan_zero';
    case 'sso':
      return 'stan_sso';
    case 'ssz':
      return 'stan_ssz';
    case 'instalacje':
      return 'instalacje';
    case 'wykonczenie':
      return 'wykonczenie';
    default:
      return 'stan_zero';
  }
}

export function suggestionStageToGroupCode(stage: ExpenseSuggestionStage): StageGroupCode {
  if (stage === 'stan_sso') return 'sso';
  if (stage === 'stan_ssz') return 'ssz';
  return stage;
}

export function currentSuggestionStage(currentStageCode: unknown, fallbackGroupCode?: unknown): ExpenseSuggestionStage {
  const groupFromCode = stageGroupCodeFromStageCode(currentStageCode);
  if (groupFromCode !== 'other') return groupCodeToSuggestionStage(groupFromCode);
  return groupCodeToSuggestionStage(fallbackGroupCode);
}

export function getStageSuggestionItems(
  buildType: ExpenseSuggestionBuildType,
  stage: ExpenseSuggestionStage
): ExpenseSuggestionItem[] {
  return (expenseSuggestions[buildType][stage] ?? []).map((name, index) => {
    const expenseKey = `${buildType}.${stage}.${slugify(name) || index}`;
    return {
      id: `system:${expenseKey}`,
      build_type: buildType,
      stage_key: stage,
      stage_group_code: suggestionStageToGroupCode(stage),
      stage_code: null,
      expense_key: expenseKey,
      expense_name: name,
      expense_name_key: null,
      default_type: 'material',
      priority: index + 1,
      is_active: true,
      source: 'system',
    };
  });
}

export function getAllSystemExpenseSuggestions(buildType: ExpenseSuggestionBuildType): ExpenseSuggestionItem[] {
  return EXPENSE_SUGGESTION_STAGES.flatMap((stage) => getStageSuggestionItems(buildType, stage));
}

export function mergeSuggestionPrefs(
  systemSuggestions: ExpenseSuggestionItem[],
  prefs: StoredExpenseSuggestionPrefs,
  buildType: ExpenseSuggestionBuildType
): ExpenseSuggestionItem[] {
  const hidden = new Set(prefs.hidden ?? []);
  const notApplicable = new Set(prefs.notApplicable ?? []);
  const custom = (prefs.custom ?? [])
    .filter((item) => item.build_type === buildType)
    .map((item, index): ExpenseSuggestionItem => ({
      id: item.id,
      build_type: item.build_type,
      stage_key: item.stage_key,
      stage_group_code: suggestionStageToGroupCode(item.stage_key),
      stage_code: null,
      expense_key: item.id,
      expense_name: item.expense_name,
      expense_name_key: null,
      default_type: 'material',
      priority: 1000 + index,
      is_active: true,
      source: 'custom',
      hidden: hidden.has(item.id),
      notApplicable: notApplicable.has(item.id),
    }));

  return [...systemSuggestions, ...custom].map((item) => ({
    ...item,
    hidden: hidden.has(item.id),
    notApplicable: notApplicable.has(item.id),
  }));
}

export async function loadExpenseSuggestionPrefs(userId: string): Promise<StoredExpenseSuggestionPrefs> {
  try {
    const raw = await AsyncStorage.getItem(prefsKey(userId));
    if (!raw) return { ...emptyPrefs };
    const parsed = JSON.parse(raw);
    return {
      hidden: Array.isArray(parsed?.hidden) ? parsed.hidden.filter(Boolean) : [],
      notApplicable: Array.isArray(parsed?.notApplicable) ? parsed.notApplicable.filter(Boolean) : [],
      custom: Array.isArray(parsed?.custom) ? parsed.custom.filter((item: any) => item?.id && item?.expense_name) : [],
    };
  } catch {
    return { ...emptyPrefs };
  }
}

export async function saveExpenseSuggestionPrefs(userId: string, prefs: StoredExpenseSuggestionPrefs) {
  await AsyncStorage.setItem(prefsKey(userId), JSON.stringify(prefs));
}

export function createCustomExpenseSuggestion(
  buildType: ExpenseSuggestionBuildType,
  stage: ExpenseSuggestionStage,
  name: string
): StoredCustomSuggestion {
  const cleanName = name.trim();
  const now = Date.now();
  return {
    id: `custom:${buildType}.${stage}.${now}.${slugify(cleanName) || 'expense'}`,
    build_type: buildType,
    stage_key: stage,
    expense_name: cleanName,
    created_at: new Date(now).toISOString(),
  };
}
