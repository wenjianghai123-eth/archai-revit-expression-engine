import { GenerationHistoryItem } from '../types';

const historyKey = 'archai:generation-history:v1';
const maxRecords = 30;
const maxStoredDataUrlLength = 900_000;

export interface StoredGenerationRecord extends GenerationHistoryItem {
  outputImage: string;
}

export function saveGenerationRecord(record: GenerationHistoryItem): StoredGenerationRecord {
  const storedRecord = trimRecordForStorage(record);
  const records = [storedRecord, ...listGenerationRecords().filter(item => item.id !== record.id)].slice(0, maxRecords);
  writeRecords(records);
  return storedRecord;
}

export function listGenerationRecords(projectId?: string | null): StoredGenerationRecord[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(historyKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const records = parsed.filter(isStoredGenerationRecord);
    if (projectId === undefined) return records;
    return records.filter(record => record.projectId === projectId);
  } catch {
    return [];
  }
}

export function deleteGenerationRecord(id: string): void {
  writeRecords(listGenerationRecords().filter(record => record.id !== id));
}

export function clearGenerationHistory(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(historyKey);
}

function trimRecordForStorage(record: GenerationHistoryItem): StoredGenerationRecord {
  const inputImageDataPreview = record.inputImageDataPreview && record.inputImageDataPreview.length <= maxStoredDataUrlLength
    ? record.inputImageDataPreview
    : undefined;
  const inputStorageWarning = record.inputImageDataPreview && !inputImageDataPreview
    ? '原图预览较大，localStorage 仅保存原图文件链接或元数据。'
    : undefined;

  if (record.outputImage.length <= maxStoredDataUrlLength) {
    return {
      ...record,
      inputImageDataPreview,
      resultStored: true,
      storageWarning: record.storageWarning || inputStorageWarning,
    };
  }

  return {
    ...record,
    inputImageDataPreview,
    outputImage: '',
    resultStored: false,
    storageWarning: inputStorageWarning
      ? '结果图和原图预览较大，localStorage 仅保存元数据。'
      : '结果图片较大，localStorage 仅保存元数据。',
  };
}

function writeRecords(records: StoredGenerationRecord[]): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(historyKey, JSON.stringify(records));
  } catch {
    const metadataOnly = records.map(record => ({
      ...record,
      outputImage: '',
      inputImageDataPreview: undefined,
      resultStored: false,
      storageWarning: record.storageWarning || 'localStorage 空间不足，已仅保存元数据。',
    }));
    try {
      window.localStorage.setItem(historyKey, JSON.stringify(metadataOnly));
    } catch {
      // localStorage may be disabled or completely full. Generation should still succeed.
    }
  }
}

function isStoredGenerationRecord(value: unknown): value is StoredGenerationRecord {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === 'string' &&
    (value.projectId === undefined || typeof value.projectId === 'string' || value.projectId === null) &&
    typeof value.step === 'number' &&
    typeof value.prompt === 'string' &&
    typeof value.style === 'string' &&
    typeof value.createdAt === 'string' &&
    (value.provider === 'mock'
      || value.provider === 'gemini'
      || value.provider === 'grsai-banana2'
      || value.provider === 'grsai-nano-banana'
      || value.provider === 'apiyi-nano-banana2-edit') &&
    typeof value.outputImage === 'string' &&
    (value.inputImageUrl === undefined || typeof value.inputImageUrl === 'string') &&
    (value.inputImageDataPreview === undefined || typeof value.inputImageDataPreview === 'string') &&
    (value.inputImageAssetId === undefined || typeof value.inputImageAssetId === 'string')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
