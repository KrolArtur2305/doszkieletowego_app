import type { ExpenseCategoryCode, ExpenseType } from '../../../lib/stageModel';
import type { BudgetScanFile } from './types';

export type BudgetScanDocumentType = 'invoice' | 'receipt' | 'unknown';

export type BudgetScanValidationIssue =
  | 'not_a_document'
  | 'not_an_invoice_or_receipt'
  | 'low_text_confidence'
  | 'blurred'
  | 'too_dark'
  | 'partial_document'
  | 'unsupported_language'
  | 'parser_failed';

export type BudgetScanValidationResult = {
  documentDetected: boolean;
  documentType: BudgetScanDocumentType;
  readable: boolean;
  confidence: number;
  issues: BudgetScanValidationIssue[];
  message?: string | null;
};

export type BudgetScanStageRef = {
  key: string | null;
  legacyId?: string | null;
  stageCode?: string | null;
  stageGroupCode?: string | null;
  label: string;
};

export type BudgetScanDraftItem = {
  id: string;
  name: string;
  total: number;
  currency: string | null;
  date: string | null;
  status: 'poniesiony' | 'zaplanowany';
  expenseType: ExpenseType;
  categoryCode: ExpenseCategoryCode;
  stage: BudgetScanStageRef | null;
  description: string | null;
  store: string | null;
  confidence: number;
  selected: boolean;
  sourceText?: string | null;
};

export type BudgetScanDraft = {
  id: string;
  file: BudgetScanFile;
  validation: BudgetScanValidationResult;
  supplierName: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  totalAmount: number | null;
  currency: string | null;
  defaultStage: BudgetScanStageRef | null;
  items: BudgetScanDraftItem[];
  status: 'ready' | 'processing' | 'error';
  errorMessage?: string | null;
  rawText?: string | null;
  createdAt: string;
};

export const BUDGET_SCAN_MAX_ITEMS = 50;

export function createEmptyBudgetScanValidation(message?: string): BudgetScanValidationResult {
  return {
    documentDetected: false,
    documentType: 'unknown',
    readable: false,
    confidence: 0,
    issues: [],
    message: message ?? null,
  };
}

export function createManualBudgetScanDraft({
  file,
  defaultStage,
}: {
  file: BudgetScanFile;
  defaultStage: BudgetScanStageRef | null;
}): BudgetScanDraft {
  return {
    id: `scan_draft_${Date.now()}`,
    file,
    validation: createEmptyBudgetScanValidation(),
    supplierName: null,
    documentNumber: null,
    documentDate: null,
    totalAmount: null,
    currency: null,
    defaultStage,
    items: [],
    status: 'ready',
    errorMessage: null,
    rawText: null,
    createdAt: new Date().toISOString(),
  };
}
