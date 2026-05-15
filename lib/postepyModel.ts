import { workflowBuildType } from './buildWorkflow';

export type WorkflowCode = 'masonry' | 'timber_frame';

export type StageGroupCode =
  | 'foundations'
  | 'open_shell'
  | 'roof'
  | 'closed_shell'
  | 'installations'
  | 'developer_state';

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
  { stage_group_code: 'foundations', label_key: 'mainTimeline.stanZero' },
  { stage_group_code: 'open_shell', label_key: 'mainTimeline.foundations' },
  { stage_group_code: 'roof', label_key: 'mainTimeline.construction' },
  { stage_group_code: 'closed_shell', label_key: 'mainTimeline.ssz' },
  { stage_group_code: 'installations', label_key: 'mainTimeline.installations' },
  { stage_group_code: 'developer_state', label_key: 'mainTimeline.developerState' },
];

export const ORDER_NOW_BY_GROUP: Record<StageGroupCode, Array<{ name_key: string; lead_time_key: string }>> = {
  foundations: [
    { name_key: 'orderNow.geodetist', lead_time_key: 'orderNow.leadTime.short' },
    { name_key: 'orderNow.rebar', lead_time_key: 'orderNow.leadTime.medium' },
    { name_key: 'orderNow.concrete', lead_time_key: 'orderNow.leadTime.medium' },
  ],
  open_shell: [
    { name_key: 'orderNow.windows', lead_time_key: 'orderNow.leadTime.long' },
    { name_key: 'orderNow.roofTruss', lead_time_key: 'orderNow.leadTime.long' },
    { name_key: 'orderNow.joinery', lead_time_key: 'orderNow.leadTime.medium' },
  ],
  roof: [
    { name_key: 'orderNow.roofing', lead_time_key: 'orderNow.leadTime.long' },
    { name_key: 'orderNow.gutters', lead_time_key: 'orderNow.leadTime.medium' },
    { name_key: 'orderNow.scaffolding', lead_time_key: 'orderNow.leadTime.short' },
  ],
  closed_shell: [
    { name_key: 'orderNow.doors', lead_time_key: 'orderNow.leadTime.long' },
    { name_key: 'orderNow.sills', lead_time_key: 'orderNow.leadTime.medium' },
    { name_key: 'orderNow.foils', lead_time_key: 'orderNow.leadTime.short' },
  ],
  installations: [
    { name_key: 'orderNow.electrical', lead_time_key: 'orderNow.leadTime.medium' },
    { name_key: 'orderNow.plumbing', lead_time_key: 'orderNow.leadTime.medium' },
    { name_key: 'orderNow.ventilation', lead_time_key: 'orderNow.leadTime.medium' },
  ],
  developer_state: [
    { name_key: 'orderNow.plasters', lead_time_key: 'orderNow.leadTime.medium' },
    { name_key: 'orderNow.screeds', lead_time_key: 'orderNow.leadTime.medium' },
    { name_key: 'orderNow.painting', lead_time_key: 'orderNow.leadTime.short' },
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
  if (value.includes('ssz') || value.includes('zamkn')) return 'closed_shell';
  if (value.includes('sso') || value.includes('otwart')) return 'open_shell';
  if (value.includes('zero') || value.includes('ground') || value.includes('fund')) return 'foundations';
  if (value.includes('roof') || value.includes('dach')) return 'roof';
  if (value.includes('instal')) return 'installations';
  if (value.includes('dewel') || value.includes('wykoncz') || value.includes('finish')) return 'developer_state';
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
      if (n <= 2) return 'foundations';
      if (n <= 4) return 'open_shell';
      if (n <= 5) return 'closed_shell';
      if (n <= 6) return 'roof';
      if (n <= 8) return 'installations';
      return 'developer_state';
    }
  }
  if (/^[AB]01_/.test(value)) return 'foundations';
  if (/^[AB]03_/.test(value)) return 'open_shell';
  if (/^[AB]04_/.test(value)) return 'closed_shell';
  if (/^[AB]05_/.test(value)) return 'roof';
  if (/^[AB]06_/.test(value)) return 'installations';
  return 'developer_state';
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
  if (directMatch?.stage_group_code) return directMatch.stage_group_code as StageGroupCode;

  const legacyMatch = legacyStageGroupFromCode(currentCode);
  if (legacyMatch) return legacyMatch;

  if (currentCode) return fallbackGroupFromStageCode(currentCode);

  const firstActive = templates.find(
    (row) => normalize(row.workflow_code) === workflowCode && row.is_active !== false
  );
  return (firstActive?.stage_group_code as StageGroupCode) ?? 'foundations';
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
        String(row.stage_group_code ?? '').trim() === groupCode &&
        row.is_active !== false
    ) ??
    templates.find((row) => normalize(row.workflow_code) === workflowCode && row.is_active !== false) ??
    null
  );
}

export function summarizeGroupProgress(
  userStages: UserStageRow[],
  legacyStages: LegacyStageRow[],
  groupCode: StageGroupCode
): { done: number; total: number } {
  const groupRows = userStages.filter((row) => String(row.stage_group_code ?? '').trim() === groupCode);
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

export function getGroupDisplayKey(groupCode: StageGroupCode): string {
  switch (groupCode) {
    case 'foundations':
      return 'mainTimeline.stanZero';
    case 'open_shell':
      return 'mainTimeline.foundations';
    case 'roof':
      return 'mainTimeline.construction';
    case 'closed_shell':
      return 'mainTimeline.ssz';
    case 'installations':
      return 'mainTimeline.installations';
    case 'developer_state':
    default:
      return 'mainTimeline.developerState';
  }
}

export function getLegacyStageLabelFromGroupCode(groupCode: StageGroupCode): string {
  switch (groupCode) {
    case 'foundations':
      return 'Stan zero';
    case 'open_shell':
      return 'Stan surowy otwarty';
    case 'roof':
      return 'Konstrukcja';
    case 'closed_shell':
      return 'Stan surowy zamknięty';
    case 'installations':
      return 'Instalacje';
    case 'developer_state':
    default:
      return 'Stan deweloperski';
  }
}
