import { normalizeBuildType } from './buildWorkflow';

export type ExpenseCategoryCode =
  | 'foundations'
  | 'open_shell'
  | 'closed_shell'
  | 'installations'
  | 'developer_state'
  | 'other';

export type StageGroupCode =
  | 'stan_zero'
  | 'sso'
  | 'ssz'
  | 'instalacje'
  | 'wykonczenie'
  | 'other';

export type ExpenseType = 'material' | 'service' | 'mixed' | 'other';

type Translate = (key: string, options?: any) => string;

type LegacyStageLike = {
  id?: string | null;
  nazwa?: string | null;
  nazwa_code?: string | null;
  status?: string | null;
  kolejnosc?: number | null;
};

export type StageTemplateLike = {
  id: string;
  workflow_code?: string | null;
  stage_group_code?: string | null;
  stage_code?: string | null;
  name_key?: string | null;
  order_index?: number | null;
  is_active?: boolean | null;
};

export type UserStageLike = {
  id: string;
  template_id?: string | null;
  workflow_code?: string | null;
  stage_group_code?: string | null;
  stage_code?: string | null;
  source?: string | null;
  status?: string | null;
  custom_name?: string | null;
  custom_name_key?: string | null;
  order_index?: number | null;
};

export type StagePickerOption = {
  key: string;
  label: string;
  stageCode: string | null;
  stageGroupCode: StageGroupCode;
  legacyId: string | null;
  source: 'user' | 'template' | 'legacy';
  orderIndex: number;
};

const MAIN_STAGE_GROUP_ORDER: StageGroupCode[] = ['stan_zero', 'sso', 'ssz', 'instalacje', 'wykonczenie'];

export function buildStageGroupPickerOptions(
  t: Translate,
  stageOptions: StagePickerOption[]
): StagePickerOption[] {
  const grouped = new Map<StageGroupCode, StagePickerOption>();
  for (const option of stageOptions ?? []) {
    const key = option.stageGroupCode || 'other';
    if (grouped.has(key)) continue;
    grouped.set(key, {
      ...option,
      key: `group:${key}`,
      label: getStageGroupDisplayName(t, key)});
  }
  return [...grouped.values()].sort((a, b) => {
    const ai = MAIN_STAGE_GROUP_ORDER.indexOf(a.stageGroupCode);
    const bi = MAIN_STAGE_GROUP_ORDER.indexOf(b.stageGroupCode);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

function normalize(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function looksLikeTechnicalStageCode(value: unknown) {
  const raw = normalize(value).replace(/\s+/g, '');
  if (!raw) return false;
  return /^([ab]\d{2}_\d{2}|\d+|ssz|sso)$/i.test(raw);
}

export function normalizeStageGroupCode(value: unknown): StageGroupCode {
  const raw = normalize(value);
  if (!raw) return 'other';
  if (raw === 'stan_zero' || raw === 'stan zero' || raw === 'zero' || raw === 'fundations' || raw === 'foundations' || raw === 'fundamenty') return 'stan_zero';
  if (raw === 'sso' || raw === 'open_shell' || raw === 'stan surowy otwarty' || raw === 'surowy otwarty' || raw === 'otwarty') return 'sso';
  if (raw === 'ssz' || raw === 'closed_shell' || raw === 'stan surowy zamkniety' || raw === 'stan surowy zamknięty' || raw === 'surowy zamkniety' || raw === 'zamkniety') return 'ssz';
  if (raw === 'installations' || raw === 'instalacje' || raw === 'instalacja' || raw === 'roof' || raw === 'dach') return 'instalacje';
  if (raw === 'wykonczenie' || raw === 'wykończenie' || raw === 'developer_state' || raw === 'stan deweloperski' || raw === 'deweloperski' || raw === 'finish' || raw === 'finishing') return 'wykonczenie';
  return 'other';
}

export function normalizeExpenseCategoryCode(value: unknown): ExpenseCategoryCode {
  const raw = normalize(value);
  if (!raw) return 'other';

  if (raw === 'foundations' || raw === 'stan zero' || raw === 'zero' || raw === 'fundamenty') return 'foundations';
  if (raw === 'open_shell' || raw === 'sso' || raw === 'stan surowy otwarty') return 'open_shell';
  if (raw === 'closed_shell' || raw === 'ssz' || raw === 'stan surowy zamkniety') return 'closed_shell';
  if (raw === 'installations' || raw === 'instalacje' || raw === 'instalacja') return 'installations';
  if (raw === 'developer_state' || raw === 'stan deweloperski' || raw === 'deweloperski') return 'developer_state';
  return 'other';
}

export function expenseCategoryCodeFromLegacyLabel(value: unknown): ExpenseCategoryCode {
  return normalizeExpenseCategoryCode(value);
}

export function expenseCategoryCodeToLegacyLabel(code: unknown): string {
  switch (normalizeExpenseCategoryCode(code)) {
    case 'foundations':
      return 'Stan zero';
    case 'open_shell':
      return 'Stan surowy otwarty';
    case 'closed_shell':
      return 'Stan surowy zamknięty';
    case 'installations':
      return 'Instalacje';
    case 'developer_state':
      return 'Stan deweloperski';
    default:
      return 'Inne';
  }
}

export function normalizeExpenseType(value: unknown): ExpenseType {
  const raw = normalize(value);
  if (raw === 'service' || raw === 'usluga') return 'service';
  if (raw === 'mixed' || raw === 'material + usluga' || raw === 'material+usluga') return 'mixed';
  if (raw === 'other' || raw === 'inne') return 'other';
  return 'material';
}

export function stageCodeFromLegacyCode(value: unknown): string | null {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return null;

  const stableMatch = raw.match(/^([AB])(\d{2})_(\d{2})$/);
  if (stableMatch) return `${stableMatch[1]}${stableMatch[2]}_${stableMatch[3]}`;

  const simpleMatch = raw.match(/^([AB])(\d{1,2})$/);
  if (simpleMatch) return `${simpleMatch[1]}${simpleMatch[2].padStart(2, '0')}_01`;

  return null;
}

export function stageGroupCodeFromStageCode(
  stageCode: unknown,
  stageTemplates?: Pick<StageTemplateLike, 'stage_code' | 'stage_group_code'>[]
): StageGroupCode {
  const raw = String(stageCode ?? '').trim().toUpperCase();
  if (!raw) return 'other';

  const compact = raw.replace(/[^A-Z0-9]/g, '');
  if (!compact) return 'other';

  const templateMatch = (stageTemplates ?? []).find((row) => {
    const templateCode = String(row.stage_code ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return templateCode === compact && normalizeStageGroupCode(row.stage_group_code) !== 'other';
  });
  if (templateMatch?.stage_group_code) {
    return normalizeStageGroupCode(templateMatch.stage_group_code);
  }

  const prefixMatch = compact.match(/^([AB])(\d{1,2})/);
  if (!prefixMatch) return 'other';

  const n = Number.parseInt(prefixMatch[2], 10);
  if (!Number.isFinite(n)) return 'other';
  if (n <= 2) return 'stan_zero';
  if (n <= 3) return 'sso';
  if (n <= 4) return 'ssz';
  if (n <= 6) return 'instalacje';
  return 'wykonczenie';
}

function stageGroupFromStageName(stageName: string) {
  if (!stageName) return 'other';

  const normalized = normalize(stageName);
  if (normalized.includes('fund') || normalized.includes('zero') || normalized.includes('podstaw')) return 'stan_zero';
  if (normalized.includes('otwart') || normalized.includes('open') || normalized.includes('sso') || normalized.includes('surow')) return 'sso';
  if (normalized.includes('zamkni') || normalized.includes('closed') || normalized.includes('ssz')) return 'ssz';
  if (normalized.includes('instal') || normalized.includes('dach') || normalized.includes('roof')) return 'instalacje';
  if (normalized.includes('dewel') || normalized.includes('wykoncz') || normalized.includes('finish')) return 'wykonczenie';
  return 'other';
}

export function stageGroupCodeFromLegacyStage(stage?: LegacyStageLike | null): StageGroupCode {
  if (!stage) return 'other';

  const byName = stageGroupFromStageName(String(stage.nazwa ?? '').trim());
  if (byName !== 'other') return byName as StageGroupCode;

  const legacyCode = String(stage.nazwa_code ?? '').trim().toUpperCase();
  if (legacyCode.startsWith('A') || legacyCode.startsWith('B')) {
    const n = Number.parseInt(legacyCode.slice(1), 10);
    if (Number.isFinite(n)) {
      if (n <= 2) return 'stan_zero';
      if (n <= 3) return 'sso';
      if (n <= 4) return 'ssz';
      if (n <= 6) return 'instalacje';
      return 'wykonczenie';
    }
  }

  return 'other';
}

export function stageCodeFromLegacyStage(stage?: LegacyStageLike | null, index?: number): string | null {
  const raw = stageCodeFromLegacyCode(stage?.nazwa_code);
  if (raw) return raw;

  if (typeof index === 'number' && index >= 0) {
    const fallbackPrefix = 'A';
    return `${fallbackPrefix}${String(index + 1).padStart(2, '0')}_01`;
  }

  return null;
}

export function getStageDisplayName(
  t: Translate,
  options: {
    stageCode?: string | null;
    nameKey?: string | null;
    legacyName?: string | null;
    fallback?: string;
  }
) {
  const fallback = options.fallback || 'Etap budowy';
  const nameKey = String(options.nameKey ?? '').trim();
  if (nameKey) {
    const translated = String(t(nameKey, { ns: 'stages'}) ?? '').trim();
    if (translated && translated !== nameKey) return translated;
  }

  const legacyName = String(options.legacyName ?? '').trim();
  if (legacyName && !looksLikeTechnicalStageCode(legacyName)) {
    return legacyName;
  }

  const stageCode = String(options.stageCode ?? '').trim();
  if (stageCode && !looksLikeTechnicalStageCode(stageCode)) {
    return stageCode;
  }

  return t('fallback.stage');
}

export function getStageGroupDisplayName(t: Translate, groupCode: unknown, fallback = 'Etap budowy') {
  const normalized = normalizeStageGroupCode(groupCode);
  if (!normalized) return t('fallback.stage');

  switch (normalized) {
    case 'stan_zero':
      return t('mainTimeline.stanZero', { ns: 'stages'});
    case 'sso':
      return t('mainTimeline.sso', { ns: 'stages'});
    case 'ssz':
      return t('mainTimeline.ssz', { ns: 'stages'});
    case 'instalacje':
      return t('mainTimeline.installations', { ns: 'stages'});
    case 'wykonczenie':
      return t('mainTimeline.finishing', { ns: 'stages'});
    default:
      return t('fallback.stage');
  }
}

export function getStageGroupCompactLabel(t: Translate, groupCode: unknown) {
  const normalized = normalizeStageGroupCode(groupCode);
  switch (normalized) {
    case 'stan_zero':
      return 'S0';
    case 'sso':
      return 'SSO';
    case 'ssz':
      return 'SSZ';
    case 'instalacje':
      return 'INST';
    case 'wykonczenie':
      return 'WYK';
    default:
      return getStageGroupDisplayName(t, groupCode);
  }
}

export function buildStagePickerOptions(
  t: Translate,
  buildType: unknown,
  stageTemplates: StageTemplateLike[],
  userStages: UserStageLike[],
  legacyStages: LegacyStageLike[]
): StagePickerOption[] {
  const workflowCode = normalizeBuildType(buildType) === 'szkieletowy' ? 'timber_frame' : 'masonry';
  const templateRows = (stageTemplates ?? [])
    .filter((row) => String(row.workflow_code ?? '').trim() === workflowCode && row.is_active !== false)
    .sort((a, b) => {
      const ao = typeof a.order_index === 'number' && Number.isFinite(a.order_index) ? a.order_index : 0;
      const bo = typeof b.order_index === 'number' && Number.isFinite(b.order_index) ? b.order_index : 0;
      if (ao !== bo) return ao - bo;
      return String(a.stage_code ?? '').localeCompare(String(b.stage_code ?? ''));
    });

  const userRows = (userStages ?? [])
    .filter((row) => String(row.workflow_code ?? '').trim() === workflowCode)
    .sort((a, b) => {
      const ao = typeof a.order_index === 'number' && Number.isFinite(a.order_index) ? a.order_index : 0;
      const bo = typeof b.order_index === 'number' && Number.isFinite(b.order_index) ? b.order_index : 0;
      if (ao !== bo) return ao - bo;
      return String(a.stage_code ?? '').localeCompare(String(b.stage_code ?? ''));
    });

  const legacyRows = (legacyStages ?? []).slice().sort((a, b) => {
    const ao = typeof a.kolejnosc === 'number' && Number.isFinite(a.kolejnosc) ? a.kolejnosc : 0;
    const bo = typeof b.kolejnosc === 'number' && Number.isFinite(b.kolejnosc) ? b.kolejnosc : 0;
    if (ao !== bo) return ao - bo;
    return String(a.nazwa_code ?? '').localeCompare(String(b.nazwa_code ?? ''));
  });

  const legacyByCode = new Map<string, LegacyStageLike>();
  const legacyByName = new Map<string, LegacyStageLike>();
  for (const row of legacyRows) {
    const code = stageCodeFromLegacyCode(row.nazwa_code);
    if (code) legacyByCode.set(code, row);
    const name = normalize(row.nazwa);
    if (name) legacyByName.set(name, row);
  }

  const mapTemplate = (row: StageTemplateLike): StagePickerOption => {
    const stageCode = String(row.stage_code ?? '').trim().toUpperCase() || null;
    const groupCode = normalizeStageGroupCode(row.stage_group_code);
    const label = getStageDisplayName(t, {
      stageCode,
      nameKey: row.name_key,
      fallback: 'Etap budowy'});
    const legacy = stageCode ? legacyByCode.get(stageCode) ?? null : null;
    return {
      key: `template:${row.id}`,
      label,
      stageCode,
      stageGroupCode: groupCode,
      legacyId: legacy?.id ?? null,
      source: 'template',
      orderIndex: typeof row.order_index === 'number' && Number.isFinite(row.order_index) ? row.order_index : 0};
  };

  const mapUserStage = (row: UserStageLike): StagePickerOption => {
    const matchedTemplate = (stageTemplates ?? []).find(
      (template) => String(template.id ?? '') === String(row.template_id ?? '')
    ) ?? (row.stage_code ? templateRows.find((template) => String(template.stage_code ?? '').trim().toUpperCase() === String(row.stage_code ?? '').trim().toUpperCase()) ?? null : null);
    const stageCode = String(row.stage_code ?? matchedTemplate?.stage_code ?? '').trim().toUpperCase() || null;
    const groupCode = normalizeStageGroupCode(row.stage_group_code ?? matchedTemplate?.stage_group_code);
    const label = getStageDisplayName(t, {
      stageCode,
      nameKey: row.custom_name_key || matchedTemplate?.name_key,
      legacyName: row.custom_name,
      fallback: 'Etap budowy'});
    const legacy = stageCode ? legacyByCode.get(stageCode) ?? null : row.custom_name ? legacyByName.get(normalize(row.custom_name)) ?? null : null;
    return {
      key: `user:${row.id}`,
      label,
      stageCode,
      stageGroupCode: groupCode,
      legacyId: legacy?.id ?? null,
      source: row.source === 'custom' ? 'user' : 'template',
      orderIndex: typeof row.order_index === 'number' && Number.isFinite(row.order_index) ? row.order_index : 0};
  };

  const templateOptions = templateRows.map(mapTemplate);
  const customUserOptions = userRows
    .filter((row) => String(row.source ?? '').trim().toLowerCase() === 'custom')
    .map(mapUserStage);
  const preferred = [...templateOptions, ...customUserOptions];
  const fallback = legacyRows.map((row, index) => {
    const stageCode = stageCodeFromLegacyCode(row.nazwa_code);
    const groupCode = stageGroupCodeFromLegacyStage(row);
    const label = getStageDisplayName(t, {
      stageCode,
      legacyName: row.nazwa,
      fallback: 'Etap budowy'});
    return {
      key: `legacy:${row.id}`,
      label,
      stageCode,
      stageGroupCode: groupCode,
      legacyId: row.id ?? null,
      source: 'legacy' as const,
      orderIndex: typeof row.kolejnosc === 'number' && Number.isFinite(row.kolejnosc) ? row.kolejnosc : index};
  });

  const options = preferred.length > 0 ? preferred : fallback;
  return options.filter((option) => !!option.label || !!option.stageCode || !!option.legacyId);
}
