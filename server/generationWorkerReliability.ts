import { randomUUID } from 'node:crypto';
import type { GenerationErrorCategory, GenerationJob } from './storage';

export interface GenerationFailureClassification {
  code: string;
  category: GenerationErrorCategory;
  retryable: boolean;
  statusCode?: number;
}

export function createGenerationWorkerId(prefix = 'worker'): string {
  return `${prefix}:${process.pid}:${randomUUID().slice(0, 8)}`;
}

export function classifyGenerationFailure(error: unknown): GenerationFailureClassification {
  const statusCode = readErrorStatus(error);
  const explicitCode = readErrorField(error, 'providerError') || readErrorField(error, 'code');
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const code = explicitCode || (statusCode ? `HTTP_${statusCode}` : 'GENERATION_UNKNOWN_ERROR');

  if (code === 'GENERATION_LEASE_LOST') {
    return { code, category: 'lease_lost', retryable: true, statusCode };
  }
  if (statusCode === 408 || statusCode === 504 || /timeout|timed out|aborterror|aborted/u.test(message)) {
    return { code: explicitCode || 'GENERATION_TIMEOUT', category: 'timeout', retryable: true, statusCode };
  }
  if (statusCode === 429 || /rate limit|too many requests/u.test(message)) {
    return { code, category: 'rate_limit', retryable: true, statusCode };
  }
  if (statusCode === 401 || statusCode === 403 || /api[_ -]?key|unauthori[sz]ed|forbidden|missing_provider_secret/u.test(`${code} ${message}`)) {
    return { code, category: 'authentication', retryable: false, statusCode };
  }
  if (/safety|policy|moderation|violation|rejected|blocked|unsafe|sensitive/u.test(`${code} ${message}`)) {
    return { code, category: 'content_policy', retryable: false, statusCode };
  }
  if (statusCode === 400 || statusCode === 404 || statusCode === 422 || /invalid request|unsupported|not found/u.test(message)) {
    return { code, category: 'invalid_request', retryable: false, statusCode };
  }
  if (typeof statusCode === 'number' && statusCode >= 500) {
    return { code, category: 'provider_unavailable', retryable: true, statusCode };
  }
  if (/fetch failed|econnreset|enotfound|eai_again|network|socket|connection/u.test(message)) {
    return { code, category: 'network', retryable: true, statusCode };
  }
  if (/input image asset|reference image asset|mask image asset/u.test(message)) {
    return { code, category: 'input_asset', retryable: false, statusCode };
  }
  if (/storage|upload|save generated|bucket/u.test(message)) {
    return { code, category: 'storage', retryable: true, statusCode };
  }
  if (/supabase|postgrest|database|schema cache/u.test(message)) {
    return { code, category: 'database', retryable: true, statusCode };
  }
  if (/cancelled|canceled/u.test(message)) {
    return { code: explicitCode || 'GENERATION_CANCELLED', category: 'cancelled', retryable: false, statusCode };
  }
  return { code, category: 'unknown', retryable: false, statusCode };
}

export function calculateGenerationRetryDelayMs(attemptCount: number): number {
  const baseMs = readPositiveInteger(process.env.GENERATION_RETRY_BASE_DELAY_MS, 2_000);
  const maxMs = readPositiveInteger(process.env.GENERATION_RETRY_MAX_DELAY_MS, 60_000);
  return Math.min(maxMs, baseMs * (2 ** Math.max(0, attemptCount - 1)));
}

export function getGenerationWorkerSettings(): {
  leaseDurationMs: number;
  heartbeatIntervalMs: number;
  executionTimeoutMs: number;
  pollIntervalMs: number;
  concurrency: number;
} {
  const leaseDurationMs = readPositiveInteger(process.env.GENERATION_JOB_LEASE_MS, 60_000);
  return {
    leaseDurationMs,
    heartbeatIntervalMs: Math.min(
      Math.max(1_000, readPositiveInteger(process.env.GENERATION_JOB_HEARTBEAT_MS, Math.floor(leaseDurationMs / 3))),
      Math.max(1_000, leaseDurationMs - 1_000),
    ),
    executionTimeoutMs: readPositiveInteger(process.env.GENERATION_JOB_TIMEOUT_MS, 600_000),
    pollIntervalMs: readPositiveInteger(process.env.GENERATION_WORKER_POLL_MS, 2_000),
    concurrency: readPositiveInteger(process.env.GENERATION_WORKER_CONCURRENCY, 1),
  };
}

export function logGenerationWorkerEvent(
  level: 'debug' | 'info' | 'warn' | 'error',
  event: string,
  fields: {
    workerId?: string;
    job?: Pick<GenerationJob, 'id' | 'userId' | 'projectId' | 'provider' | 'attemptCount' | 'maxAttempts'>;
    [key: string]: unknown;
  } = {},
): void {
  const { job, ...rest } = fields;
  const payload = {
    timestamp: new Date().toISOString(),
    service: 'generation-worker',
    event,
    workerId: fields.workerId,
    jobId: job?.id,
    userId: job?.userId,
    projectId: job?.projectId,
    provider: job?.provider,
    attemptCount: job?.attemptCount,
    maxAttempts: job?.maxAttempts,
    ...sanitizeFields(rest),
  };
  console[level](JSON.stringify(payload));
}

function sanitizeFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields)
    .filter(([key]) => !/key|token|password|secret|base64/iu.test(key))
    .map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 1_000) : value]));
}

function readErrorField(error: unknown, field: string): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const value = (error as Record<string, unknown>)[field];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const record = error as Record<string, unknown>;
  const status = record.status ?? record.statusCode ?? record.httpStatus;
  if (typeof status === 'number' && Number.isFinite(status)) return status;
  const message = error instanceof Error ? error.message : '';
  const match = /HTTP\s+(\d{3})|returned\s+(\d{3})/iu.exec(message);
  const parsed = Number(match?.[1] || match?.[2]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}
