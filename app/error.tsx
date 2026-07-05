import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';

import { RuntimeCrashReport } from '../components/RuntimeCrashReport';
import {
  clearRuntimeDiagnostics,
  readRuntimeDiagnostics,
  recordCheckpoint,
  type RuntimeDiagnosticSnapshot,
} from '../lib/runtimeDiagnostics';

type ErrorProps = {
  error: Error;
  retry: () => void;
};

export default function GlobalError({ error, retry }: ErrorProps) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<RuntimeDiagnosticSnapshot | null>(null);

  useEffect(() => {
    void recordCheckpoint('route-error');
    void readRuntimeDiagnostics().then((value) => setSnapshot(value));
  }, []);

  return (
    <RuntimeCrashReport
      title="Błąd aplikacji"
      subtitle="To jest błąd przechwycony przez aplikację. Skopiuj go razem z ostatnim stanem startu."
      snapshot={snapshot}
      errorText={error?.stack || error?.message || String(error)}
      onDismiss={async () => {
        await clearRuntimeDiagnostics();
        retry();
        router.replace('/(auth)/welcome');
      }}
    />
  );
}
