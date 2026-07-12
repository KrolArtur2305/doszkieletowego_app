export type BuildType = 'murowany' | 'szkieletowy' | 'inny';

function normalize(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function normalizeBuildType(value: unknown): BuildType {
  const valueNorm = normalize(value);
  if (valueNorm === 'szkieletowy' || valueNorm === 'timber_frame' || valueNorm === 'timber frame') return 'szkieletowy';
  if (valueNorm === 'murowany' || valueNorm === 'masonry') return 'murowany';
  if (valueNorm === 'inny') return 'inny';
  return 'murowany';
}

export function workflowBuildType(value: unknown): Exclude<BuildType, 'inny'> {
  return normalizeBuildType(value) === 'szkieletowy' ? 'szkieletowy' : 'murowany';
}

export function workflowStagePrefix(value: unknown): 'A' | 'B' {
  return normalizeBuildType(value) === 'szkieletowy' ? 'B' : 'A';
}

function isWorkflowPrefix(code: string) {
  const normalized = code.trim().toUpperCase();
  return normalized.startsWith('A') || normalized.startsWith('B');
}

function stageNumberFromGroupLike(value: unknown): number | null {
  const normalized = normalize(value);
  if (!normalized) return null;
  if (normalized === 'stan_zero' || normalized === 'stan zero' || normalized === 'zero' || normalized === 'foundations' || normalized === 'fundamenty') return 1;
  if (normalized === 'sso' || normalized === 'open_shell' || normalized === 'stan surowy otwarty' || normalized === 'surowy otwarty' || normalized === 'otwarty') return 3;
  if (normalized === 'ssz' || normalized === 'closed_shell' || normalized === 'stan surowy zamkniety' || normalized === 'surowy zamkniety' || normalized === 'zamkniety') return 4;
  if (normalized === 'instalacje' || normalized === 'installations' || normalized === 'instalacja') return 5;
  if (normalized === 'wykonczenie' || normalized === 'developer_state' || normalized === 'stan deweloperski' || normalized === 'deweloperski' || normalized === 'finish' || normalized === 'finishing') return 7;
  return null;
}

function stageCodeFromGroupLike(value: unknown, buildType: unknown): string | null {
  const stageNumber = stageNumberFromGroupLike(value);
  if (!stageNumber) return null;
  return `${workflowStagePrefix(buildType)}${String(stageNumber).padStart(2, '0')}_01`;
}

export function stageCodeMatchesWorkflow(stageCode: unknown, buildType: unknown): boolean {
  const code = String(stageCode ?? '').trim().toUpperCase();
  if (!code) return false;
  return code.startsWith(workflowStagePrefix(buildType));
}

export function filterWorkflowStages<T extends { nazwa_code?: string | null }>(rows: T[], buildType: unknown): T[] {
  return rows.filter((row) => stageCodeMatchesWorkflow(row.nazwa_code, buildType));
}

export function preferredStartStageCode(buildType: unknown, currentStageCode: unknown): string {
  const workflowType = normalizeBuildType(buildType);
  const prefix = workflowType === 'szkieletowy' ? 'B' : 'A';
  const code = String(currentStageCode ?? '').trim().toUpperCase();

  if (!code) return `${prefix}1`;
  if (workflowType === 'szkieletowy' && code.startsWith('A')) return 'B1';
  if (workflowType !== 'szkieletowy' && code.startsWith('B')) return 'A1';
  if (workflowType === 'inny') return 'A1';
  if (!code.startsWith(prefix)) return `${prefix}1`;
  return code;
}

export function remapStageCodeForBuildType(stageCode: unknown, buildType: unknown): string {
  const workflowType = normalizeBuildType(buildType);
  const prefix = workflowStagePrefix(workflowType);
  const code = String(stageCode ?? '').trim().toUpperCase();
  const groupStageCode = stageCodeFromGroupLike(stageCode, workflowType);

  if (!code) return `${prefix}1`;
  if (groupStageCode) return groupStageCode;
  if (code.startsWith(prefix)) return code;
  if (code.startsWith('A') || code.startsWith('B')) {
    return `${prefix}${code.slice(1)}`;
  }
  return `${prefix}1`;
}

export function resolveRuntimeCurrentStageCode<T extends { nazwa_code?: string | null; status?: string | null }>(
  rows: T[],
  buildType: unknown,
  currentStageCode: unknown
): string {
  const workflowType = normalizeBuildType(buildType);
  const prefix = workflowStagePrefix(workflowType);
  const current = String(currentStageCode ?? '').trim().toUpperCase();
  const groupStageCode = stageCodeFromGroupLike(currentStageCode, workflowType);

  if (current.startsWith(prefix)) return current;
  if (groupStageCode) return groupStageCode;
  if (isWorkflowPrefix(current)) return `${prefix}1`;

  const workflowRows = filterWorkflowStages(rows, workflowType);
  const active = workflowRows.find((row) => !isDoneStageStatus(row.status));
  const fallback = workflowRows[0] ?? null;
  const preferred = active ?? fallback;
  const preferredCode = String(preferred?.nazwa_code ?? '').trim().toUpperCase();

  if (preferredCode.startsWith(prefix)) return preferredCode;
  return `${prefix}1`;
}

export function getSuggestionStageCodesFromCurrentStageCode(
  buildType: unknown,
  currentStageCode: unknown
): string[] {
  const workflowType = normalizeBuildType(buildType);
  const prefix = workflowType === 'szkieletowy' ? 'B' : 'A';
  const rawCode = String(currentStageCode ?? '').trim().toUpperCase();
  const match = rawCode.match(/^([AB])(\d{1,2})$/);

  const normalizedCode = match && match[1] === prefix ? rawCode : `${prefix}1`;
  const normalizedMatch = normalizedCode.match(/^([AB])(\d{1,2})$/);
  const start = normalizedMatch ? Number(normalizedMatch[2]) : 1;
  const safeStart = Number.isFinite(start) && start > 0 ? start : 1;
  const end = Math.min(safeStart + 2, 13);

  const out: string[] = [];
  for (let n = safeStart; n <= end; n += 1) {
    out.push(`${prefix}${n}`);
  }
  return out;
}

export function getSuggestionStageCodes<T extends { nazwa_code?: string | null; status?: string | null }>(
  rows: T[],
  buildType: unknown,
  currentStageCode: unknown,
  windowSize = 3
): string[] {
  const workflowRows = filterWorkflowStages(rows, buildType);
  if (!workflowRows.length) return [];

  const resolvedCode = resolveRuntimeCurrentStageCode(rows, buildType, currentStageCode);
  const resolvedIndex = workflowRows.findIndex(
    (row) => String(row.nazwa_code ?? '').trim().toUpperCase() === resolvedCode
  );
  const startIndex = resolvedIndex >= 0 ? resolvedIndex : 0;

  return workflowRows
    .slice(startIndex, startIndex + windowSize)
    .map((row) => String(row.nazwa_code ?? '').trim().toUpperCase())
    .filter(Boolean);
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

export function resolveOnboardingCurrentStageCode(buildType: unknown, buildStage: unknown): string {
  const workflowType = normalizeBuildType(buildType);
  const prefix = workflowType === 'szkieletowy' ? 'B' : 'A';
  const value = normalize(buildStage);

  let stageNumber = 1;
  if (value.includes('otwart')) stageNumber = 3;
  else if (value.includes('zamkn')) stageNumber = 4;
  else if (value.includes('instal')) stageNumber = 5;
  else if (value.includes('wykoncz')) stageNumber = 7;
  else stageNumber = 1;

  return `${prefix}${pad2(stageNumber)}_01`;
}

export function isDoneStageStatus(status: unknown): boolean {
  const value = normalize(status);
  return ['zrealizowany', 'wykonany', 'done', 'completed', 'ukończony'].includes(value);
}
