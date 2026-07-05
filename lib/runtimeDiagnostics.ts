import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const STORAGE_KEY = 'buildiq:runtime-diagnostics';

export type RuntimeDiagnosticSnapshot = {
  version: 1;
  lastCheckpoint: string | null;
  lastError: {
    name: string;
    message: string;
    stack: string | null;
    componentStack: string | null;
    phase: string | null;
    timestamp: string;
  } | null;
  updatedAt: string;
};

let installed = false;
let currentCheckpoint = 'boot';

function nowIso() {
  return new Date().toISOString();
}

function optionalErrorText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value);
  return text.trim() ? text : null;
}

function getBuildLabel() {
  const expoConfig = (Constants as any).expoConfig ?? (Constants as any).manifest2?.extra?.expoClient?.appConfig;
  const version = expoConfig?.version ?? null;
  const buildNumber = expoConfig?.ios?.buildNumber ?? expoConfig?.android?.versionCode ?? null;
  return [version, buildNumber ? `build ${buildNumber}` : null].filter(Boolean).join(' | ') || null;
}

async function writeSnapshot(snapshot: RuntimeDiagnosticSnapshot): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

async function updateCheckpointStorage(checkpoint: string): Promise<void> {
  const snapshot = await readRuntimeDiagnostics();
  await writeSnapshot({
    version: 1,
    lastCheckpoint: checkpoint,
    lastError: snapshot?.lastError ?? null,
    updatedAt: nowIso(),
  });
}

export async function readRuntimeDiagnostics(): Promise<RuntimeDiagnosticSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RuntimeDiagnosticSnapshot;
    if (!parsed || parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearRuntimeDiagnostics(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore storage issues in crash handling paths
  }
}

export async function recordCheckpoint(checkpoint: string): Promise<void> {
  currentCheckpoint = String(checkpoint || 'boot');
  await updateCheckpointStorage(currentCheckpoint);
}

export function installRuntimeDiagnostics(): void {
  if (installed) return;
  installed = true;

  const errorUtils = (globalThis as any).ErrorUtils as
    | {
        getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | null;
        setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
      }
    | undefined;

  const previousHandler = errorUtils?.getGlobalHandler?.() ?? null;

  errorUtils?.setGlobalHandler?.((error, isFatal) => {
    void (async () => {
      const nextError = error as any;
      const snapshot: RuntimeDiagnosticSnapshot = {
        version: 1,
        lastCheckpoint: currentCheckpoint,
        lastError: {
          name: String(nextError?.name ?? 'Error'),
          message: String(nextError?.message ?? nextError ?? 'Unknown error'),
          stack: optionalErrorText(nextError?.stack),
          componentStack: optionalErrorText(nextError?.componentStack),
          phase: isFatal ? 'fatal' : 'recoverable',
          timestamp: nowIso(),
        },
        updatedAt: nowIso(),
      };

      try {
        await writeSnapshot(snapshot);
      } catch {
        // nothing else we can do here
      }
    })()
      .catch(() => {
        // no-op
      })
      .finally(() => {
        previousHandler?.(error, isFatal);
      });
  });
}

export function getBuildInfoLabel(): string | null {
  return getBuildLabel();
}
