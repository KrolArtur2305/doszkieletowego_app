import {
  expenseCategoryCodeFromLegacyLabel,
  expenseCategoryCodeToLegacyLabel,
  normalizeExpenseCategoryCode} from './stageModel';

type Translate = (key: string, options?: any) => string;

export type BudgetCategoryValue =
  | 'Stan zero'
  | 'Stan surowy otwarty'
  | 'Stan surowy zamknięty'
  | 'Instalacje'
  | 'Stan deweloperski'
  | 'Inne';

const CATEGORY_KEYS: Record<BudgetCategoryValue, string> = {
  'Stan zero': 'categories.stanZero',
  'Stan surowy otwarty': 'categories.openShell',
  'Stan surowy zamknięty': 'categories.closedShell',
  Instalacje: 'categories.installations',
  'Stan deweloperski': 'categories.developerState',
  Inne: 'categories.other'};

const CATEGORY_SHORT_KEYS: Record<BudgetCategoryValue, string> = {
  'Stan zero': 'categoryShort.stanZero',
  'Stan surowy otwarty': 'categoryShort.openShell',
  'Stan surowy zamknięty': 'categoryShort.closedShell',
  Instalacje: 'categoryShort.installations',
  'Stan deweloperski': 'categoryShort.developerState',
  Inne: 'categoryShort.other'};

function normalize(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function looksLikeStageCode(value: unknown) {
  const raw = normalize(value).replace(/\s+/g, '');
  if (!raw) return false;
  return /^([ab]\d{2}_\d{2}|\d+|ssz|sso)$/i.test(raw);
}

export function getBudgetCategoryKey(value: unknown): BudgetCategoryValue {
  const normalized = normalize(value);
  const code = normalizeExpenseCategoryCode(value);
  const legacyLabel = expenseCategoryCodeToLegacyLabel(code) as BudgetCategoryValue;
  if (legacyLabel !== 'Inne') return legacyLabel;
  if (normalized.includes('zero')) return 'Stan zero';
  if (normalized.includes('otwart') || normalized === 'sso') return 'Stan surowy otwarty';
  if (normalized.includes('zamkni') || normalized.includes('zamkn') || normalized === 'ssz') return 'Stan surowy zamknięty';
  if (normalized.includes('instal')) return 'Instalacje';
  if (normalized.includes('dewel')) return 'Stan deweloperski';
  return 'Inne';
}

export function getBudgetCategoryLabel(value: unknown, t: Translate, short = false) {
  const category = getBudgetCategoryKey(value);
  const key = short ? CATEGORY_SHORT_KEYS[category] : CATEGORY_KEYS[category];
  return t(key);
}

export function getExpenseCategoryCode(value: unknown) {
  return expenseCategoryCodeFromLegacyLabel(value);
}

export function getStageLabel(name: unknown, t: Translate) {
  const normalized = normalize(name);
  const fallback = String(name ?? '').trim();

  if (!normalized) return t('fallback.stage');
  if (normalized.includes('plan')) return t('names.planning');
  if (normalized.includes('zero')) return t('names.stanZero');
  if (normalized.includes('otwart')) return t('names.openShell');
  if (normalized.includes('zamkni') || normalized.includes('zamkn') || normalized === 'ssz') {
    return t('names.closedShell');
  }
  if (normalized.includes('instal')) return t('names.installations');
  if (normalized.includes('dewel')) return t('names.developerState');
  if (normalized.includes('wykoncz') || normalized.includes('finish')) {
    return t('names.finishing');
  }

  if (looksLikeStageCode(normalized) || looksLikeStageCode(fallback)) {
    return t('fallback.stage');
  }

  return fallback;
}
