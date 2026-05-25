import { GenerationRecord, Project } from './storage';
import { isGenerationMode as isSharedGenerationMode } from '../shared/generation';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isProjectStatus(value: unknown): value is Project['status'] {
  return value === 'active' || value === 'archived';
}

export function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

export function isGenerationMode(value: unknown): value is GenerationRecord['mode'] {
  return isSharedGenerationMode(value);
}

export function isGenerationStatus(value: unknown): value is GenerationRecord['status'] {
  return value === 'succeeded' || value === 'failed';
}

export function isBatchCount(value: unknown): value is 1 | 2 | 4 | 8 {
  return value === 1 || value === 2 || value === 4 || value === 8;
}

export function readBatchCount(value: unknown): 1 | 2 | 4 | 8 {
  return isBatchCount(value) ? value : 1;
}

export function readOptionalNullableString(
  value: unknown,
  code: string,
): { ok: true; value?: string | null } | { ok: false; error: { message: string; code: string } } {
  if (value === undefined) return { ok: true };
  if (value === null) return { ok: true, value: null };
  if (typeof value === 'string') return { ok: true, value };
  return { ok: false, error: { message: `${code} must be a string or null.`, code } };
}

export function validateDataUrlSize(fieldName: string, dataUrl: string, maxImageMb: number): string | null {
  const base64 = dataUrl.split(',')[1] || '';
  const approxBytes = Math.floor((base64.length * 3) / 4);
  if (approxBytes > maxImageMb * 1024 * 1024) {
    return `${fieldName} cannot exceed ${maxImageMb}MB.`;
  }
  return null;
}
