import * as ImageManipulator from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import type { ImagePickerAsset } from 'expo-image-picker';

import type { BudgetScanFile } from './types';

const SCANNED_RECEIPT_MAX_WIDTH = 1800;
const SCANNED_RECEIPT_JPEG_QUALITY = 0.86;

async function getLocalFileSize(uri: string): Promise<number | undefined> {
  try {
    const file = new File(uri);
    return file.exists && typeof file.size === 'number' ? file.size : undefined;
  } catch {
    return undefined;
  }
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
  const optimizedSize = await getLocalFileSize(optimized.uri);

  return {
    name: `scan_${Date.now()}.jpg`,
    uri: optimized.uri,
    mimeType: 'image/jpeg',
    size: optimizedSize ?? asset.fileSize,
  };
}
