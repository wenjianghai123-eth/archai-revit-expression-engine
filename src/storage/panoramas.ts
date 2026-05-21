import { PanoramaRecord } from '../types';

const panoramaKey = 'archai:panorama-records:v1';
const maxRecords = 50;

export function savePanoramaRecord(record: PanoramaRecord): PanoramaRecord {
  const records = [record, ...listPanoramaRecords().filter(item => item.id !== record.id)].slice(0, maxRecords);
  writeRecords(records);
  return record;
}

export function listPanoramaRecords(projectId?: string | null): PanoramaRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(panoramaKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const records = parsed.filter(isPanoramaRecord);
    if (projectId === undefined) return records;
    return records.filter(record => record.projectId === projectId);
  } catch {
    return [];
  }
}

function writeRecords(records: PanoramaRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(panoramaKey, JSON.stringify(records));
  } catch {
    // Panorama generation should still succeed even if local metadata storage is full.
  }
}

function isPanoramaRecord(value: unknown): value is PanoramaRecord {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && (value.projectId === undefined || value.projectId === null || typeof value.projectId === 'string')
    && typeof value.modelUrl === 'string'
    && isRecord(value.cameraState)
    && typeof value.panoramaUrl === 'string'
    && (value.renderedPanoramaUrl === undefined || typeof value.renderedPanoramaUrl === 'string')
    && (value.thumbnailUrl === undefined || typeof value.thumbnailUrl === 'string')
    && typeof value.shareId === 'string'
    && typeof value.createdAt === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
