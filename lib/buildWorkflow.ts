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
  if (valueNorm === 'szkieletowy') return 'szkieletowy';
  if (valueNorm === 'murowany') return 'murowany';
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

export function resolveRuntimeCurrentStageCode<T extends { nazwa_code?: string | null; status?: string | null }>(
  rows: T[],
  buildType: unknown,
  currentStageCode: unknown
): string {
  const workflowType = normalizeBuildType(buildType);
  const prefix = workflowStagePrefix(workflowType);
  const current = String(currentStageCode ?? '').trim().toUpperCase();

  if (current.startsWith(prefix)) return current;
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

export function isDoneStageStatus(status: unknown): boolean {
  const value = normalize(status);
  return ['zrealizowany', 'wykonany', 'done', 'completed', 'ukończony'].includes(value);
}
