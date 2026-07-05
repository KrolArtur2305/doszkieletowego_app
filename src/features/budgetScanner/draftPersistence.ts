import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

import type { BudgetScanDraft } from './draftTypes';

const STORAGE_PREFIX = 'budget_scan_draft';
const STORAGE_DIR = `${FileSystem.documentDirectory ?? ''}budget-scans/`;

function getStorageKey(userId: string, investmentId: string | null) {
  return `${STORAGE_PREFIX}:${userId}:${investmentId ?? 'global'}`;
}

async function ensureStorageDir() {
  if (!FileSystem.documentDirectory) return;
  const info = await FileSystem.getInfoAsync(STORAGE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(STORAGE_DIR, { intermediates: true });
  }
}

async function deleteFileIfExists(uri?: string | null) {
  const path = String(uri ?? '').trim();
  if (!path) return;
  const info = await FileSystem.getInfoAsync(path);
  if (info.exists) {
    await FileSystem.deleteAsync(path, { idempotent: true });
  }
}

export async function persistBudgetScanDraft(
  key: string,
  draft: BudgetScanDraft,
): Promise<void> {
  try {
    const previousRaw = await AsyncStorage.getItem(key);
    const previousDraft = previousRaw ? JSON.parse(previousRaw) as BudgetScanDraft : null;
    if (previousDraft?.file?.uri && previousDraft.file.uri !== draft.file.uri) {
      await deleteFileIfExists(previousDraft.file.uri);
    }

    await AsyncStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Draft persistence should never block the scanner flow.
  }
}

export async function loadBudgetScanDraft(key: string): Promise<BudgetScanDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as BudgetScanDraft;
    const fileUri = String(draft?.file?.uri ?? '').trim();
    if (!fileUri) return null;
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export async function clearBudgetScanDraft(key: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const draft = JSON.parse(raw) as BudgetScanDraft;
      await deleteFileIfExists(draft?.file?.uri);
    }
    await AsyncStorage.removeItem(key);
  } catch {
    // Ignore storage cleanup issues.
  }
}

export function getBudgetScanDraftKey(userId: string, investmentId: string | null) {
  return getStorageKey(userId, investmentId);
}
