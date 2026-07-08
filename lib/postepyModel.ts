import { workflowBuildType } from './buildWorkflow';

export type WorkflowCode = 'masonry' | 'timber_frame';

export type StageGroupCode =
  | 'stan_zero'
  | 'sso'
  | 'ssz'
  | 'instalacje'
  | 'wykonczenie';

export type StageTemplateRow = {
  id: string;
  workflow_code?: string | null;
  stage_group_code?: string | null;
  stage_code?: string | null;
  name_key?: string | null;
  order_index?: number | null;
  is_active?: boolean | null;
};

export type UserStageRow = {
  id: string;
  user_id?: string | null;
  investment_id?: string | null;
  project_id?: string | null;
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

export type LegacyStageRow = {
  id: string;
  user_id?: string | null;
  nazwa?: string | null;
  nazwa_code?: string | null;
  kolejnosc?: number | null;
  status?: string | null;
  data_wykonania?: string | null;
  notatka?: string | null;
};

export const MAIN_STAGE_TIMELINE: Array<{ stage_group_code: StageGroupCode; label_key: string }> = [
  { stage_group_code: 'stan_zero', label_key: 'mainTimeline.stanZero' },
  { stage_group_code: 'sso', label_key: 'mainTimeline.sso' },
  { stage_group_code: 'ssz', label_key: 'mainTimeline.ssz' },
  { stage_group_code: 'instalacje', label_key: 'mainTimeline.installations' },
  { stage_group_code: 'wykonczenie', label_key: 'mainTimeline.finishing' },
];

export const ORDER_NOW_BY_GROUP: Record<StageGroupCode, Array<{ name_key: string; lead_time_key: string }>> = {
  stan_zero: [
    { name_key: 'orders.geodetist', lead_time_key: 'orders.leadTime.short' },
    { name_key: 'orders.rebar', lead_time_key: 'orders.leadTime.medium' },
    { name_key: 'orders.concrete', lead_time_key: 'orders.leadTime.medium' },
  ],
  sso: [
    { name_key: 'orders.windows', lead_time_key: 'orders.leadTime.long' },
    { name_key: 'orders.roofTruss', lead_time_key: 'orders.leadTime.long' },
    { name_key: 'orders.joinery', lead_time_key: 'orders.leadTime.medium' },
  ],
  ssz: [
    { name_key: 'orders.roofing', lead_time_key: 'orders.leadTime.long' },
    { name_key: 'orders.doors', lead_time_key: 'orders.leadTime.long' },
    { name_key: 'orders.gutters', lead_time_key: 'orders.leadTime.medium' },
  ],
  instalacje: [
    { name_key: 'orders.electrical', lead_time_key: 'orders.leadTime.medium' },
    { name_key: 'orders.plumbing', lead_time_key: 'orders.leadTime.medium' },
    { name_key: 'orders.ventilation', lead_time_key: 'orders.leadTime.medium' },
  ],
  wykonczenie: [
    { name_key: 'orders.plasters', lead_time_key: 'orders.leadTime.medium' },
    { name_key: 'orders.screeds', lead_time_key: 'orders.leadTime.medium' },
    { name_key: 'orders.painting', lead_time_key: 'orders.leadTime.short' },
  ],
};

function normalize(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function legacyStageGroupFromCode(stageCode: unknown): StageGroupCode | null {
  const value = normalize(stageCode);
  if (!value) return null;
  if (value.includes('ssz') || value.includes('zamkn')) return 'ssz';
  if (value.includes('sso') || value.includes('otwart')) return 'sso';
  if (value.includes('zero') || value.includes('ground') || value.includes('fund')) return 'stan_zero';
  if (value.includes('instal') || value.includes('roof') || value.includes('dach')) return 'instalacje';
  if (value.includes('dewel') || value.includes('wykoncz') || value.includes('finish')) return 'wykonczenie';
  return null;
}

export function normalizeStageGroupCode(value: unknown): StageGroupCode | null {
  const raw = normalize(value);
  if (!raw) return null;
  if (raw === 'stan_zero' || raw === 'stan zero' || raw === 'zero' || raw === 'foundations' || raw === 'fundamenty') return 'stan_zero';
  if (raw === 'sso' || raw === 'open_shell' || raw === 'stan surowy otwarty' || raw === 'surowy otwarty' || raw === 'otwarty') return 'sso';
  if (raw === 'ssz' || raw === 'closed_shell' || raw === 'stan surowy zamkniety' || raw === 'surowy zamkniety' || raw === 'zamkniety') return 'ssz';
  if (raw === 'instalacje' || raw === 'installations' || raw === 'instalacja' || raw === 'roof' || raw === 'dach') return 'instalacje';
  if (raw === 'wykonczenie' || raw === 'developer_state' || raw === 'stan deweloperski' || raw === 'deweloperski' || raw === 'finish' || raw === 'finishing') return 'wykonczenie';
  return null;
}

export function normalizeWorkflowCode(buildType: unknown): WorkflowCode {
  return workflowBuildType(buildType) === 'szkieletowy' ? 'timber_frame' : 'masonry';
}

export function isDoneStageStatus(status: unknown): boolean {
  const value = normalize(status);
  return ['done', 'completed', 'zrealizowany', 'wykonany', 'ukończony', 'ukonczony'].includes(value);
}

export function isHiddenStageStatus(status: unknown): boolean {
  const value = normalize(status);
  return ['hidden', 'not_applicable', 'not applicable', 'skipped', 'pominiety', 'pominięty'].includes(value);
}

export function isVisibleStageStatus(status: unknown): boolean {
  return !isHiddenStageStatus(status);
}

export function fallbackGroupFromStageCode(stageCode: unknown): StageGroupCode {
  const value = String(stageCode ?? '').trim().toUpperCase();
  const shortMatch = value.match(/^([AB])(\d{1,2})$/);
  if (shortMatch) {
    const n = Number.parseInt(shortMatch[2], 10);
    if (Number.isFinite(n)) {
      if (n <= 2) return 'stan_zero';
      if (n <= 3) return 'sso';
      if (n <= 4) return 'ssz';
      if (n <= 6) return 'instalacje';
      return 'wykonczenie';
    }
  }
  if (/^[AB]01_/.test(value)) return 'stan_zero';
  if (/^[AB]02_/.test(value)) return 'stan_zero';
  if (/^[AB]03_/.test(value)) return 'sso';
  if (/^[AB]04_/.test(value)) return 'ssz';
  if (/^[AB]0[56]_/.test(value)) return 'instalacje';
  return 'wykonczenie';
}

function stageCodeKey(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

export function resolveCurrentStageGroupCode(
  templates: StageTemplateRow[],
  buildType: unknown,
  currentStageCode: unknown
): StageGroupCode {
  const workflowCode = normalizeWorkflowCode(buildType);
  const currentCode = String(currentStageCode ?? '').trim().toUpperCase();

  const directMatch = templates.find(
    (row) =>
      normalize(row.workflow_code) === workflowCode &&
      String(row.stage_code ?? '').trim().toUpperCase() === currentCode
  );
  const directGroup = normalizeStageGroupCode(directMatch?.stage_group_code);
  if (directGroup) return directGroup;

  const legacyMatch = legacyStageGroupFromCode(currentCode);
  if (legacyMatch) return legacyMatch;

  if (currentCode) return fallbackGroupFromStageCode(currentCode);

  const firstActive = templates.find(
    (row) => normalize(row.workflow_code) === workflowCode && row.is_active !== false
  );
  return normalizeStageGroupCode(firstActive?.stage_group_code) ?? 'stan_zero';
}

export function getCurrentStageTemplate(
  templates: StageTemplateRow[],
  buildType: unknown,
  currentStageCode: unknown
): StageTemplateRow | null {
  const workflowCode = normalizeWorkflowCode(buildType);
  const currentCode = String(currentStageCode ?? '').trim().toUpperCase();
  const groupCode = resolveCurrentStageGroupCode(templates, buildType, currentStageCode);
  return (
    templates.find(
      (row) =>
        normalize(row.workflow_code) === workflowCode &&
        String(row.stage_code ?? '').trim().toUpperCase() === currentCode
    ) ??
    templates.find(
      (row) =>
        normalize(row.workflow_code) === workflowCode &&
        normalizeStageGroupCode(row.stage_group_code) === groupCode &&
        row.is_active !== false
    ) ??
    templates.find((row) => normalize(row.workflow_code) === workflowCode && row.is_active !== false) ??
    null
  );
}

export function summarizeGroupProgress(
  userStages: UserStageRow[],
  legacyStages: LegacyStageRow[],
  groupCode: StageGroupCode,
  stageTemplates: StageTemplateRow[] = []
): { done: number; total: number } {
  const activeTemplates = stageTemplates.filter(
    (row) => row.is_active !== false && normalizeStageGroupCode(row.stage_group_code) === groupCode
  );

  if (activeTemplates.length > 0) {
    const matchedUserStageIds = new Set<string>();
    let done = 0;
    let total = 0;

    activeTemplates.forEach((template) => {
      const templateId = String(template.id ?? '').trim();
      const templateStageCode = stageCodeKey(template.stage_code);
      const match = userStages.find((row) => {
        const rowTemplateId = String(row.template_id ?? '').trim();
        const rowStageCode = stageCodeKey(row.stage_code);
        return (
          (!!templateId && rowTemplateId === templateId) ||
          (!!templateStageCode && rowStageCode === templateStageCode)
        );
      });

      if (match?.id) matchedUserStageIds.add(String(match.id));
      if (isHiddenStageStatus(match?.status)) return;

      total += 1;
      if (isDoneStageStatus(match?.status)) done += 1;
    });

    const customRows = userStages.filter((row) => {
      if (matchedUserStageIds.has(String(row.id))) return false;
      if (String(row.source ?? '').trim().toLowerCase() !== 'custom') return false;
      return normalizeStageGroupCode(row.stage_group_code) === groupCode && isVisibleStageStatus(row.status);
    });

    return {
      done: done + customRows.filter((row) => isDoneStageStatus(row.status)).length,
      total: total + customRows.length,
    };
  }

  const groupRows = userStages.filter((row) => normalizeStageGroupCode(row.stage_group_code) === groupCode);
  const visible = groupRows.filter((row) => isVisibleStageStatus(row.status));
  const visibleTotal = visible.length;
  const visibleDone = visible.filter((row) => isDoneStageStatus(row.status)).length;
  if (visibleTotal > 0) return { done: visibleDone, total: visibleTotal };

  const legacyVisible = legacyStages.filter((row) => isVisibleStageStatus(row.status));
  return {
    done: legacyVisible.filter((row) => isDoneStageStatus(row.status)).length,
    total: legacyVisible.length,
  };
}

export function summarizeOverallProgressBySubstages(
  userStages: UserStageRow[],
  legacyStages: LegacyStageRow[],
  currentGroupCode: StageGroupCode,
  stageTemplates: StageTemplateRow[] = []
): { done: number; total: number; value: number; percent: number } {
  const currentGroupIndex = Math.max(
    0,
    MAIN_STAGE_TIMELINE.findIndex((item) => item.stage_group_code === currentGroupCode)
  );

  const overall = MAIN_STAGE_TIMELINE.reduce(
    (acc, item, index) => {
      const progress = summarizeGroupProgress(userStages, legacyStages, item.stage_group_code, stageTemplates);
      acc.done += index < currentGroupIndex ? progress.total : progress.done;
      acc.total += progress.total;
      return acc;
    },
    { done: 0, total: 0 }
  );
  const value = overall.total > 0 ? Math.max(0, Math.min(1, overall.done / overall.total)) : 0;

  return {
    ...overall,
    value,
    percent: Math.round(value * 100),
  };
}

export function getGroupDisplayKey(groupCode: StageGroupCode): string {
  switch (groupCode) {
    case 'stan_zero':
      return 'mainTimeline.stanZero';
    case 'sso':
      return 'mainTimeline.sso';
    case 'ssz':
      return 'mainTimeline.ssz';
    case 'instalacje':
      return 'mainTimeline.installations';
    case 'wykonczenie':
    default:
      return 'mainTimeline.finishing';
  }
}
export function getLegacyStageLabelFromGroupCode(groupCode: StageGroupCode): string {
  switch (groupCode) {
    case 'stan_zero':
      return 'Stan zero';
    case 'sso':
      return 'Stan surowy otwarty';
    case 'ssz':
      return 'Stan surowy zamknięty';
    case 'instalacje':
      return 'Instalacje';
    case 'wykonczenie':
    default:
      return 'Wykończenie';
  }
}
