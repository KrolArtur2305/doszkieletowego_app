import { File } from 'expo-file-system';

import { normalizeAppLanguage } from '../../../lib/i18n';
import { publicConfig, supabase } from '../../../lib/supabase';
import type { BudgetScanFile } from './types';

const BUDGET_SCAN_OCR_TIMEOUT_MS = 75_000;

export type BudgetScanOcrItem = {
  name: string;
  amount: number | null;
  confidence: number;
  rawText: string | null;
};

export type BudgetScanOcrResult = {
  readable: boolean;
  confidence: number;
  documentType: 'invoice' | 'receipt' | 'unknown';
  supplierName: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  currency: string | null;
  totalAmount: number | null;
  rawText: string | null;
  issues: string[];
  items: BudgetScanOcrItem[];
  message: string | null;
};

type BudgetScanOcrResponse = Partial<BudgetScanOcrResult> & {
  items?: Array<Partial<BudgetScanOcrItem> | null> | null;
  issues?: unknown;
  error?: unknown;
  details?: unknown;
};

class BudgetScanOcrHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: string | null,
  ) {
    super(message);
    this.name = 'BudgetScanOcrHttpError';
  }
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text : null;
}

function createTimeoutController(timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
  };
}

async function readImageAsBase64(file: BudgetScanFile): Promise<string> {
  const base64 = await new File(file.uri).base64();
  return `data:${file.mimeType || 'image/jpeg'};base64,${base64}`;
}

export async function runBudgetScanOcr(
  file: BudgetScanFile,
  appLanguage?: string | null,
): Promise<BudgetScanOcrResult> {
  const imageDataUrl = await readImageAsBase64(file);
  const normalizedLanguage = normalizeAppLanguage(appLanguage);
  const session = (await supabase.auth.getSession()).data.session;
  const accessToken = session?.access_token;

  if (!accessToken) {
    throw new Error('Brak aktywnej sesji uzytkownika.');
  }

  const requestTimeout = createTimeoutController(BUDGET_SCAN_OCR_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(publicConfig.budgetScanOcrEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: publicConfig.supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_data_url: imageDataUrl,
        file_name: file.name,
        mime_type: file.mimeType,
        size: file.size ?? null,
        app_language: normalizedLanguage,
      }),
      signal: requestTimeout.signal,
    });
  } catch (error: any) {
    if (requestTimeout.signal.aborted) {
      throw new Error('OCR request timed out.');
    }
    throw error;
  } finally {
    requestTimeout.clear();
  }

  const data = await response.json().catch(() => null) as BudgetScanOcrResponse | null;

  if (!response.ok) {
    const message = normalizeText(data?.error) ?? `OCR request failed with status ${response.status}`;
    const details = normalizeText(data?.details);
    throw new BudgetScanOcrHttpError(message, response.status, details);
  }

  const payload = (data ?? {}) as BudgetScanOcrResponse;
  const rawItems = Array.isArray(payload.items)
    ? payload.items.filter((item) => !!item && typeof item === 'object')
    : [];
  const items = rawItems
    .map((item) => {
      const row = item as Partial<BudgetScanOcrItem>;
      return {
        name: normalizeText(row.name) ?? '',
        amount: toNumber(row.amount),
        confidence: toNumber(row.confidence) ?? 0,
        rawText: normalizeText(row.rawText),
      };
    })
    .filter((item) => item.name || item.amount !== null);

  return {
    readable: Boolean(payload.readable),
    confidence: toNumber(payload.confidence) ?? 0,
    documentType: payload.documentType === 'invoice' || payload.documentType === 'receipt'
      ? payload.documentType
      : 'unknown',
    supplierName: normalizeText(payload.supplierName),
    documentNumber: normalizeText(payload.documentNumber),
    documentDate: normalizeText(payload.documentDate),
    currency: normalizeText(payload.currency),
    totalAmount: toNumber(payload.totalAmount),
    rawText: normalizeText(payload.rawText),
    issues: Array.isArray(payload.issues)
      ? payload.issues.map((issue) => String(issue)).filter(Boolean)
      : [],
    items,
    message: normalizeText(payload.message),
  };
}
