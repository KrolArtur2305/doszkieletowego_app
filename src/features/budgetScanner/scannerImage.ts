import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { File } from 'expo-file-system';
import type { ImagePickerAsset } from 'expo-image-picker';

import type { BudgetScanFile } from './types';

const SCANNED_RECEIPT_MAX_WIDTH = 1600;
const SCANNED_RECEIPT_JPEG_QUALITY = 0.82;
const SCANNED_RECEIPT_DIR = `${FileSystem.documentDirectory ?? ''}budget-scans/`;

async function getLocalFileSize(uri: string): Promise<number | undefined> {
  try {
    const file = new File(uri);
    return file.exists && typeof file.size === 'number' ? file.size : undefined;
  } catch {
    return undefined;
  }
}

async function ensureScanDirectory() {
  if (!FileSystem.documentDirectory) return;
  const info = await FileSystem.getInfoAsync(SCANNED_RECEIPT_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(SCANNED_RECEIPT_DIR, { intermediates: true });
  }
}

function getMimeExtension(mimeType?: string | null) {
  const mime = String(mimeType ?? '').toLowerCase();
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/heic' || mime === 'image/heif') return 'heic';
  return 'jpg';
}

export async function optimizeBudgetScanImage(asset: ImagePickerAsset): Promise<BudgetScanFile | null> {
  if (!asset.uri) return null;

  const shouldResize = typeof asset.width === 'number' && asset.width > SCANNED_RECEIPT_MAX_WIDTH;
  const optimized = await ImageManipulator.manipulateAsync(
    asset.uri,
    shouldResize ? [{ resize: { width: SCANNED_RECEIPT_MAX_WIDTH } }] : [],
    {
      compress: SCANNED_RECEIPT_JPEG_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );

  await ensureScanDirectory();
  const extension = getMimeExtension('image/jpeg');
  const storedUri = FileSystem.documentDirectory
    ? `${SCANNED_RECEIPT_DIR}scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extension}`
    : optimized.uri;

  if (FileSystem.documentDirectory) {
    try {
      await FileSystem.copyAsync({ from: optimized.uri, to: storedUri });
    } catch {
      // Keep the optimized cache file if persistent copy fails.
    }
  }

  const finalUri = FileSystem.documentDirectory ? storedUri : optimized.uri;
  const optimizedSize = await getLocalFileSize(finalUri);

  return {
    name: `scan_${Date.now()}.${extension}`,
    uri: finalUri,
    mimeType: 'image/jpeg',
    size: optimizedSize ?? asset.fileSize,
  };
}
