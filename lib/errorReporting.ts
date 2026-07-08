import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from './supabase';

const LAST_REPORT_STORAGE_KEY = 'buildiq:last-error-report';

type ErrorSeverity = 'fatal' | 'error' | 'warning' | 'info';

export type ErrorReportContext = {
  feature?: string;
  action?: string;
  route?: string;
  severity?: ErrorSeverity;
  userId?: string | null;
  investmentId?: string | null;
  metadata?: Record<string, unknown>;
};

export type LastErrorReport = {
  clientReportId: string;
  message: string;
  feature: string | null;
  action: string | null;
  route: string | null;
  createdAt: string;
};

type ErrorUserContext = {
  userId: string | null;
  investmentId: string | null;
};

let initialized = false;
let userContext: ErrorUserContext = {
  userId: null,
  investmentId: null,
};

function getExpoConfig() {
  return (Constants as any).expoConfig ?? (Constants as any).manifest2?.extra?.expoClient?.appConfig ?? {};
}

function getAppVersion() {
  return (
    Application.nativeApplicationVersion ??
    getExpoConfig()?.version ??
    null
  );
}

function getBuildVersion() {
  return (
    Application.nativeBuildVersion ??
    getExpoConfig()?.ios?.buildNumber ??
    (typeof getExpoConfig()?.android?.versionCode === 'number'
      ? String(getExpoConfig().android.versionCode)
      : null)
  );
}

function serializeValue(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (depth > 3) return '[MaxDepth]';
  if (typeof value === 'string') return value.length > 900 ? `${value.slice(0, 900)}...` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => serializeValue(item, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).slice(0, 40).forEach(([key, item]) => {
      const lower = key.toLowerCase();
      if (
        lower.includes('token') ||
        lower.includes('secret') ||
        lower.includes('password') ||
        lower.includes('anon_key') ||
        lower.includes('authorization')
      ) {
        out[key] = '[Filtered]';
        return;
      }
      out[key] = serializeValue(item, depth + 1);
    });
    return out;
  }
  return String(value);
}

function toErrorParts(error: unknown) {
  const anyError = error as any;
  const message = String(anyError?.message ?? anyError?.error_description ?? error ?? 'Unknown error');
  return {
    name: String(anyError?.name ?? anyError?.code ?? 'Error'),
    message,
    code: anyError?.code ? String(anyError.code) : anyError?.status ? String(anyError.status) : null,
    stack: typeof anyError?.stack === 'string' ? anyError.stack : null,
  };
}

function createClientReportId() {
  return `err_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function storeLastReport(report: LastErrorReport) {
  try {
    await AsyncStorage.setItem(LAST_REPORT_STORAGE_KEY, JSON.stringify(report));
  } catch {
    // Reporting must never crash the app.
  }
}

export async function getLastErrorReport(): Promise<LastErrorReport | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_REPORT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastErrorReport;
    return parsed?.clientReportId ? parsed : null;
  } catch {
    return null;
  }
}

export function initErrorReporting() {
  if (initialized) return;
  initialized = true;
}

export function setErrorReportingUser(userId?: string | null, investmentId?: string | null) {
  userContext = {
    userId: String(userId ?? '').trim() || null,
    investmentId: String(investmentId ?? '').trim() || null,
  };
}

export function clearErrorReportingUser() {
  userContext = { userId: null, investmentId: null };
}

export function addErrorBreadcrumb(message: string, data?: Record<string, unknown>) {
  void message;
  void data;
}

export async function reportError(error: unknown, context: ErrorReportContext = {}): Promise<string> {
  initErrorReporting();

  const clientReportId = createClientReportId();
  const parts = toErrorParts(error);
  const severity = context.severity ?? 'error';
  const userId = context.userId ?? userContext.userId;
  const investmentId = context.investmentId ?? userContext.investmentId;
  const metadata = serializeValue(context.metadata ?? {}) as Record<string, unknown>;
  const createdAt = new Date().toISOString();

  await storeLastReport({
    clientReportId,
    message: parts.message,
    feature: context.feature ?? null,
    action: context.action ?? null,
    route: context.route ?? null,
    createdAt,
  });

  if (!userId) return clientReportId;

  try {
    await supabase.from('app_error_reports').insert({
      client_report_id: clientReportId,
      user_id: userId,
      investment_id: investmentId,
      platform: Platform.OS,
      app_version: getAppVersion(),
      build_version: getBuildVersion(),
      route: context.route ?? null,
      feature: context.feature ?? null,
      action: context.action ?? null,
      severity,
      message: parts.message.slice(0, 1800),
      error_name: parts.name,
      error_code: parts.code,
      stack: parts.stack ? parts.stack.slice(0, 12000) : null,
      metadata,
    });
  } catch {
    // Avoid recursive reporting if the reporting backend is unavailable.
  }

  return clientReportId;
}

export async function reportSupabaseError(
  error: unknown,
  context: Omit<ErrorReportContext, 'metadata'> & { metadata?: Record<string, unknown> } = {}
) {
  if (!error) return null;
  return reportError(error, {
    ...context,
    metadata: {
      kind: 'supabase',
      ...(context.metadata ?? {}),
    },
  });
}
