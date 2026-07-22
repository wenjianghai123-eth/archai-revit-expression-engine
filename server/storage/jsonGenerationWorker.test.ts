import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JsonStorageAdapter as JsonStorageAdapterType } from './jsonStorage';

let dataDir = '';
let adapter: JsonStorageAdapterType;
const originalDataDir = process.env.DATA_DIR;

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'archai-worker-test-'));
  process.env.DATA_DIR = dataDir;
  vi.resetModules();
  const module = await import('./jsonStorage');
  adapter = new module.JsonStorageAdapter();
  await adapter.ensureReady();
});

afterEach(async () => {
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
  await rm(dataDir, { recursive: true, force: true });
});

describe('JSON generation worker storage', () => {
  it('leases one job at a time and recovers it after lease expiry', async () => {
    const project = await adapter.createProject({ userId: 'worker-user', name: 'Worker reliability' });
    const job = await adapter.createGenerationJob({
      userId: 'worker-user',
      projectId: project.id,
      mode: 'style-render',
      prompt: 'test',
      config: {},
      inputAssetIds: ['asset-input'],
      provider: 'mock',
      maxAttempts: 2,
    });
    expect(job).not.toBeNull();

    const firstClaim = await adapter.claimGenerationJob({
      workerId: 'worker-a',
      leaseDurationMs: 30_000,
      executionTimeoutMs: 120_000,
    });
    expect(firstClaim).toMatchObject({ id: job?.id, leaseOwner: 'worker-a', attemptCount: 1, status: 'running' });
    expect(await adapter.claimGenerationJob({
      workerId: 'worker-b',
      leaseDurationMs: 30_000,
      executionTimeoutMs: 120_000,
    })).toBeNull();

    await adapter.updateGenerationJob(job!.id, { leaseExpiresAt: new Date(Date.now() - 1_000).toISOString() });
    const recovered = await adapter.claimGenerationJob({
      workerId: 'worker-b',
      leaseDurationMs: 30_000,
      executionTimeoutMs: 120_000,
    });
    expect(recovered).toMatchObject({ id: job?.id, leaseOwner: 'worker-b', attemptCount: 2, status: 'running' });
    expect(await adapter.renewGenerationJobLease(job!.id, 'worker-a', 30_000)).toBe(false);
    expect(await adapter.renewGenerationJobLease(job!.id, 'worker-b', 30_000)).toBe(true);
    await adapter.updateGenerationJob(job!.id, { leaseExpiresAt: new Date(Date.now() - 1_000).toISOString() });
    const finalRecovery = await adapter.claimGenerationJob({
      workerId: 'worker-c',
      leaseDurationMs: 30_000,
      executionTimeoutMs: 120_000,
      preferredJobId: job!.id,
    });
    expect(finalRecovery).toMatchObject({ attemptCount: 3, leaseOwner: 'worker-c' });
    await adapter.updateGenerationJob(job!.id, { leaseExpiresAt: new Date(Date.now() - 1_000).toISOString() });
    expect(await adapter.claimGenerationJob({
      workerId: 'worker-d',
      leaseDurationMs: 30_000,
      executionTimeoutMs: 120_000,
      preferredJobId: job!.id,
    })).toBeNull();
  });

  it('refunds a terminal job once even when refund is requested concurrently', async () => {
    const userId = 'refund-user';
    await adapter.adjustCredits({
      userId,
      type: 'grant',
      amount: 5,
      reason: 'test grant',
      referenceType: 'system',
      referenceId: 'test-grant',
    });
    const project = await adapter.createProject({ userId, name: 'Refund reliability' });
    const job = await adapter.createGenerationJob({
      userId,
      projectId: project.id,
      mode: 'style-render',
      prompt: 'test',
      config: {},
      inputAssetIds: ['asset-input'],
      provider: 'mock',
      creditCost: 1,
    });
    await adapter.adjustCredits({
      userId,
      type: 'generate_charge',
      amount: -1,
      reason: 'test debit',
      referenceType: 'generation_job',
      referenceId: job!.id,
    });
    await adapter.updateGenerationJob(job!.id, { status: 'failed', failureReason: 'provider failed' });

    const results = await Promise.all([
      adapter.refundGenerationJobOnce(job!.id),
      adapter.refundGenerationJobOnce(job!.id),
    ]);
    const refunds = (await adapter.listCreditTransactions(userId))
      .filter(transaction => transaction.type === 'generate_refund' && transaction.referenceId === job!.id);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(refunds).toHaveLength(1);
    expect((await adapter.getCreditBalance(userId)).balance).toBe(5);
    expect((await adapter.getGenerationJob(job!.id))?.creditRefunded).toBe(true);
  });
});
