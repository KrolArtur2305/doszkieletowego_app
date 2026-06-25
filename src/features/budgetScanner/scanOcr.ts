import * as FileSystem from 'expo-file-system';

import { normalizeAppLanguage } from '../../../lib/i18n';
import { supabase } from '../../../lib/supabase';
import type { BudgetScanFile } from './types';

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
};

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

async function readImageAsBase64(file: BudgetScanFile): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(file.uri, {
    encoding: 'base64',
  });
  return `data:${file.mimeType || 'image/jpeg'};base64,${base64}`;
}

export async function runBudgetScanOcr(
  file: BudgetScanFile,
  appLanguage?: string | null,
): Promise<BudgetScanOcrResult> {
  const imageDataUrl = await readImageAsBase64(file);
  const normalizedLanguage = normalizeAppLanguage(appLanguage);

  const { data, error } = await supabase.functions.invoke('budget-scan-ocr', {
    body: {
      image_data_url: imageDataUrl,
      file_name: file.name,
      mime_type: file.mimeType,
      size: file.size ?? null,
      app_language: normalizedLanguage,
    },
  });

  if (error) {
    throw error;
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
