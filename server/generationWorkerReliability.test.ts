import { afterEach, describe, expect, it } from 'vitest';
import {
  calculateGenerationRetryDelayMs,
  classifyGenerationFailure,
  getGenerationWorkerSettings,
} from './generationWorkerReliability';

const originalEnv = {
  GENERATION_RETRY_BASE_DELAY_MS: process.env.GENERATION_RETRY_BASE_DELAY_MS,
  GENERATION_RETRY_MAX_DELAY_MS: process.env.GENERATION_RETRY_MAX_DELAY_MS,
  GENERATION_JOB_LEASE_MS: process.env.GENERATION_JOB_LEASE_MS,
  GENERATION_JOB_HEARTBEAT_MS: process.env.GENERATION_JOB_HEARTBEAT_MS,
  GENERATION_JOB_TIMEOUT_MS: process.env.GENERATION_JOB_TIMEOUT_MS,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('generation worker reliability', () => {
  it('classifies transient provider failures as retryable', () => {
    expect(classifyGenerationFailure(Object.assign(new Error('Too many requests'), { statusCode: 429 }))).toMatchObject({
      category: 'rate_limit',
      retryable: true,
    });
    expect(classifyGenerationFailure(Object.assign(new Error('Provider unavailable'), { statusCode: 503 }))).toMatchObject({
      category: 'provider_unavailable',
      retryable: true,
    });
    expect(classifyGenerationFailure(Object.assign(new Error('request timed out'), { providerError: 'APIYI_TIMEOUT' }))).toMatchObject({
      category: 'timeout',
      retryable: true,
    });
  });

  it('does not retry authentication, invalid input, or safety failures', () => {
    expect(classifyGenerationFailure(Object.assign(new Error('Unauthorized'), { statusCode: 401 }))).toMatchObject({
      category: 'authentication',
      retryable: false,
    });
    expect(classifyGenerationFailure(Object.assign(new Error('Invalid request'), { statusCode: 400 }))).toMatchObject({
      category: 'invalid_request',
      retryable: false,
    });
    expect(classifyGenerationFailure(Object.assign(new Error('Safety policy rejected'), { providerError: 'PROVIDER_SAFETY_REJECTED' }))).toMatchObject({
      category: 'content_policy',
      retryable: false,
    });
  });

  it('uses capped exponential retry delays', () => {
    process.env.GENERATION_RETRY_BASE_DELAY_MS = '1000';
    process.env.GENERATION_RETRY_MAX_DELAY_MS = '5000';
    expect(calculateGenerationRetryDelayMs(1)).toBe(1000);
    expect(calculateGenerationRetryDelayMs(2)).toBe(2000);
    expect(calculateGenerationRetryDelayMs(5)).toBe(5000);
  });

  it('keeps heartbeat shorter than the lease and exposes a job timeout', () => {
    process.env.GENERATION_JOB_LEASE_MS = '30000';
    process.env.GENERATION_JOB_HEARTBEAT_MS = '10000';
    process.env.GENERATION_JOB_TIMEOUT_MS = '120000';
    expect(getGenerationWorkerSettings()).toMatchObject({
      leaseDurationMs: 30000,
      heartbeatIntervalMs: 10000,
      executionTimeoutMs: 120000,
    });
  });
});
