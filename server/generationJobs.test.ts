import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DEV_AUTH_USER_ID } from './auth';
import type { app as ExpressApp } from './index';
import type * as GenerationService from './generationService';
import type * as Storage from './storage';

type App = typeof ExpressApp;
type StorageModule = typeof Storage;
type GenerationServiceModule = typeof GenerationService;

const tinyPngDataUrl = 'data:image/png;base64,iVBORw0KGgo=';

let app: App;
let storage: StorageModule;
let generationService: GenerationServiceModule;
let tempRoot: string;

beforeAll(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'archai-generation-jobs-'));

  process.env.AUTH_MODE = 'dev';
  process.env.DATA_BACKEND = 'json';
  process.env.FILE_STORAGE = 'local';
  process.env.GENERATION_PROVIDER = 'mock';
  process.env.AI_PROVIDER = 'mock';
  process.env.ARCHAI_DISABLE_GENERATION_WORKER = 'true';
  process.env.GENERATION_JOB_RATE_LIMIT_PER_MINUTE = '1000';
  process.env.MAX_IMAGE_MB = '0.0001';
  process.env.DATA_DIR = path.join(tempRoot, 'data');
  process.env.UPLOADS_DIR = path.join(tempRoot, 'uploads');

  [{ app }, storage, generationService] = await Promise.all([
    import('./index'),
    import('./storage'),
    import('./generationService'),
  ]);
});

afterAll(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe('POST /api/generation-jobs asset ownership', () => {
  it('rejects a project owned by another user', async () => {
    const otherProject = await storage.createProject({ userId: 'other-user', name: 'Other project' });
    const ownAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: otherProject.id,
        mode: 'style-render',
        prompt: 'render this',
        config: {},
        inputAssetIds: [ownAsset.id],
      });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      ok: false,
      error: { code: 'PROJECT_NOT_FOUND' },
    });
  });

  it('rejects another user input asset id', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Own project' });
    const otherAsset = await createImageAssetForUser('other-user');

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'style-render',
        prompt: 'render this',
        config: {},
        inputAssetIds: [otherAsset.id],
      });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      ok: false,
      error: { code: 'GENERATION_JOB_INPUT_ASSET_NOT_FOUND' },
    });
  });

  it('rejects another user mask asset id', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Own project' });
    const ownAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);
    const otherMaskAsset = await createImageAssetForUser('other-user');

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'inpaint',
        prompt: 'replace selected area',
        config: { maskMode: 'asset-mask', maskAssetId: otherMaskAsset.id },
        inputAssetIds: [ownAsset.id],
      });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      ok: false,
      error: { code: 'GENERATION_JOB_MASK_ASSET_NOT_FOUND' },
    });
  });

  it('creates a generation job with owned input and mask assets', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Own project' });
    const ownAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);
    const ownMaskAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'inpaint',
        prompt: 'replace selected area',
        config: { maskMode: 'asset-mask', maskAssetId: ownMaskAsset.id },
        inputAssetIds: [ownAsset.id],
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      ok: true,
      data: {
        job: {
          userId: DEV_AUTH_USER_ID,
          projectId: project.id,
          inputAssetIds: [ownAsset.id],
          status: 'queued',
        },
      },
    });
  });

  it('creates an inpaint generation job with full-image mask mode and no mask asset', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Full image inpaint' });
    const ownAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'inpaint',
        prompt: 'repaint the whole image',
        config: { maskMode: 'full-image' },
        inputAssetIds: [ownAsset.id],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.job.config).toMatchObject({ maskMode: 'full-image' });
    expect(response.body.data.job.config).not.toHaveProperty('maskAssetId');
  });

  it('creates a prompt-only inpaint generation job without mask fields', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Prompt only inpaint' });
    const ownAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'inpaint',
        prompt: 'make the sofa warmer and improve lighting',
        config: {},
        inputAssetIds: [ownAsset.id],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.job.config).not.toHaveProperty('maskMode');
    expect(response.body.data.job.config).not.toHaveProperty('maskAssetId');
  });

  it('rejects an inpaint asset-mask job without maskAssetId', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Missing mask' });
    const ownAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'inpaint',
        prompt: 'replace selected area',
        config: { maskMode: 'asset-mask' },
        inputAssetIds: [ownAsset.id],
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      ok: false,
      error: { code: 'GENERATION_JOB_MASK_ASSET_REQUIRED' },
    });
  });

  it('rejects an inpaint generation job with invalid mask mode', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Invalid mask mode' });
    const ownAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'inpaint',
        prompt: 'replace selected area',
        config: { maskMode: 'invalid' },
        inputAssetIds: [ownAsset.id],
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      ok: false,
      error: { code: 'GENERATION_JOB_MASK_MODE_INVALID' },
    });
  });

  it('normalizes empty inpaint mask fields as prompt-only editing', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Empty mask fields' });
    const ownAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'inpaint',
        prompt: 'improve the lighting without a drawn mask',
        config: { maskMode: '', maskAssetId: 'image_unused' },
        inputAssetIds: [ownAsset.id],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.job.config).not.toHaveProperty('maskMode');
    expect(response.body.data.job.config).not.toHaveProperty('maskAssetId');
  });

  it('ignores mask fields on non-inpaint generation jobs', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Style render' });
    const ownAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'style-render',
        prompt: 'render this',
        config: { maskMode: 'asset-mask', maskAssetId: 'image_other' },
        inputAssetIds: [ownAsset.id],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.job.config).not.toHaveProperty('maskMode');
    expect(response.body.data.job.config).not.toHaveProperty('maskAssetId');
  });
});

describe('project soft deletion', () => {
  it('soft deletes the current user project and hides it from reads', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Delete me' });

    const deleteResponse = await request(app).delete(`/api/projects/${encodeURIComponent(project.id)}`);
    const listResponse = await request(app).get('/api/projects');
    const getResponse = await request(app).get(`/api/projects/${encodeURIComponent(project.id)}`);

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.data.project).toMatchObject({
      id: project.id,
      status: 'archived',
    });
    expect(deleteResponse.body.data.project.deletedAt).toEqual(expect.any(String));
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data.projects.map((item: { id: string }) => item.id)).not.toContain(project.id);
    expect(getResponse.status).toBe(404);
  });

  it('rejects generation jobs for a deleted project', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Deleted generation target' });
    const ownAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);
    await request(app).delete(`/api/projects/${encodeURIComponent(project.id)}`);

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'style-render',
        prompt: 'render this',
        config: {},
        inputAssetIds: [ownAsset.id],
      });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      ok: false,
      error: { code: 'PROJECT_NOT_FOUND' },
    });
  });

  it('does not allow deleting another user project', async () => {
    const otherProject = await storage.createProject({ userId: 'other-user', name: 'Other delete target' });

    const response = await request(app).delete(`/api/projects/${encodeURIComponent(otherProject.id)}`);

    expect(response.status).toBe(404);
    expect(await storage.getProject(otherProject.id, 'other-user')).not.toBeNull();
  });

  it('returns 404 when deleting an already deleted project again', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Double delete target' });

    const firstDelete = await request(app).delete(`/api/projects/${encodeURIComponent(project.id)}`);
    const secondDelete = await request(app).delete(`/api/projects/${encodeURIComponent(project.id)}`);

    expect(firstDelete.status).toBe(200);
    expect(secondDelete.status).toBe(404);
  });
});

describe('generation job credits', () => {
  it('rejects job creation when credits are insufficient', async () => {
    const originalBalance = await storage.getCreditBalance(DEV_AUTH_USER_ID);
    await drainDevUserCredits('insufficient');

    try {
      const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'No credits project' });
      const ownAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);

      const response = await request(app)
        .post('/api/generation-jobs')
        .send({
          projectId: project.id,
          mode: 'style-render',
          prompt: 'render this',
          config: {},
          inputAssetIds: [ownAsset.id],
        });

      expect(response.status).toBe(402);
      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'CREDITS_INSUFFICIENT' },
      });
    } finally {
      await restoreDevUserCredits(originalBalance.balance, 'insufficient');
    }
  });

  it('refunds credits when a queued job is cancelled and does not double refund', async () => {
    const originalBalance = await storage.getCreditBalance(DEV_AUTH_USER_ID);
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Cancel refund project' });
    const ownAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);

    const createResponse = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'style-render',
        prompt: 'render this',
        config: {},
        inputAssetIds: [ownAsset.id],
      });

    expect(createResponse.status).toBe(201);
    expect((await storage.getCreditBalance(DEV_AUTH_USER_ID)).balance).toBe(originalBalance.balance - 10);

    const jobId = createResponse.body.data.job.id;
    const firstCancel = await request(app).post(`/api/generation-jobs/${encodeURIComponent(jobId)}/cancel`);
    const secondCancel = await request(app).post(`/api/generation-jobs/${encodeURIComponent(jobId)}/cancel`);
    const transactions = await storage.listCreditTransactions(DEV_AUTH_USER_ID);

    expect(firstCancel.status).toBe(200);
    expect(secondCancel.status).toBe(200);
    expect((await storage.getCreditBalance(DEV_AUTH_USER_ID)).balance).toBe(originalBalance.balance);
    expect(transactions.filter(transaction => transaction.type === 'refund' && transaction.referenceId === jobId)).toHaveLength(1);
  });

  it('refunds credits when a job fails and does not double refund', async () => {
    const originalBalance = await storage.getCreditBalance(DEV_AUTH_USER_ID);
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Failed refund project' });
    const ownAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);

    const createResponse = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'style-render',
        prompt: 'render this',
        config: {},
        inputAssetIds: [ownAsset.id],
      });

    expect(createResponse.status).toBe(201);
    const jobId = createResponse.body.data.job.id;
    await storage.updateGenerationJob(jobId, {
      status: 'failed',
      progress: 100,
      errorMessage: 'Provider returned an invalid image data URL.',
      finishedAt: new Date().toISOString(),
    });

    await generationService.refundGenerationJobCredits(jobId);
    await generationService.refundGenerationJobCredits(jobId);

    const transactions = await storage.listCreditTransactions(DEV_AUTH_USER_ID);
    expect((await storage.getCreditBalance(DEV_AUTH_USER_ID)).balance).toBe(originalBalance.balance);
    expect(transactions.filter(transaction => transaction.type === 'refund' && transaction.referenceId === jobId)).toHaveLength(1);
  });
});

describe('legacy generation endpoints', () => {
  it('remain available for explicit dev mock debugging', async () => {
    const originalLegacyFlag = process.env.ENABLE_LEGACY_GENERATION_ENDPOINTS;
    process.env.ENABLE_LEGACY_GENERATION_ENDPOINTS = 'true';

    try {
      const response = await request(app)
        .post('/api/generate/style-render')
        .send({
          inputImageDataUrl: tinyPngDataUrl,
          prompt: 'render this',
          config: {},
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        provider: 'mock',
      });
      expect(response.body.imageDataUrl).toMatch(/^data:image\/svg\+xml;base64,/u);
    } finally {
      if (originalLegacyFlag === undefined) {
        delete process.env.ENABLE_LEGACY_GENERATION_ENDPOINTS;
      } else {
        process.env.ENABLE_LEGACY_GENERATION_ENDPOINTS = originalLegacyFlag;
      }
    }
  });

  it('are disabled by default in production-like configuration', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalLegacyFlag = process.env.ENABLE_LEGACY_GENERATION_ENDPOINTS;
    process.env.NODE_ENV = 'production';
    delete process.env.ENABLE_LEGACY_GENERATION_ENDPOINTS;

    try {
      const response = await request(app)
        .post('/api/generate/style-render')
        .send({
          inputImageDataUrl: tinyPngDataUrl,
          prompt: 'render this',
          config: {},
        });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'LEGACY_GENERATION_ENDPOINT_DISABLED' },
      });
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }

      if (originalLegacyFlag === undefined) {
        delete process.env.ENABLE_LEGACY_GENERATION_ENDPOINTS;
      } else {
        process.env.ENABLE_LEGACY_GENERATION_ENDPOINTS = originalLegacyFlag;
      }
    }
  });
});

describe('public share links', () => {
  it('does not expose a private project without a share token', async () => {
    const response = await request(app).get('/api/share/not-a-real-token');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      ok: false,
      error: { code: 'SHARE_LINK_NOT_FOUND' },
    });
  });

  it('returns only the public share payload for a valid share link', async () => {
    const project = await storage.createProject({
      userId: DEV_AUTH_USER_ID,
      name: 'Shared project',
      description: 'Public preview',
    });
    await storage.createGenerationRecord({
      userId: DEV_AUTH_USER_ID,
      projectId: project.id,
      mode: 'style-render',
      prompt: 'public prompt',
      inputImageUrl: '/uploads/input.png',
      outputImageUrl: '/uploads/output.png',
      provider: 'mock',
      status: 'succeeded',
    });

    const createShare = await request(app)
      .post(`/api/projects/${encodeURIComponent(project.id)}/share-links`)
      .send({});

    expect(createShare.status).toBe(201);
    const token = createShare.body.data.shareLink.token;

    const response = await request(app).get(`/api/share/${encodeURIComponent(token)}`);

    expect(response.status).toBe(200);
    expect(response.body.data.share).toMatchObject({
      project: { name: 'Shared project', description: 'Public preview' },
      generations: [{ prompt: 'public prompt', outputImageUrl: '/uploads/output.png' }],
    });
    expect(response.body.data.share).not.toHaveProperty('userId');
    expect(response.body.data.share.project).not.toHaveProperty('userId');
    expect(response.body.data.share.generations[0]).not.toHaveProperty('userId');
    expect(response.body.data.share.generations[0]).not.toHaveProperty('projectId');
  });
});

describe('asset uploads', () => {
  it('uploads a valid image asset', async () => {
    const response = await request(app)
      .post('/api/assets/images')
      .attach('file', tinyPngBuffer(), { filename: 'floor.png', contentType: 'image/png' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      ok: true,
      data: {
        asset: {
          userId: DEV_AUTH_USER_ID,
          filename: expect.stringMatching(/\.png$/),
          mimeType: 'image/png',
        },
      },
    });
  });

  it('rejects non-image content disguised as an image', async () => {
    const response = await request(app)
      .post('/api/assets/images')
      .attach('file', Buffer.from('not actually an image'), { filename: 'fake.png', contentType: 'image/png' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      ok: false,
      error: { code: 'UPLOAD_IMAGE_TYPE_INVALID' },
    });
  });

  it('rejects an oversized image upload', async () => {
    const oversizedPng = Buffer.concat([tinyPngBuffer(), Buffer.alloc(200)]);

    const response = await request(app)
      .post('/api/assets/images')
      .attach('file', oversizedPng, { filename: 'large.png', contentType: 'image/png' });

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({
      ok: false,
      error: { code: 'UPLOAD_FILE_TOO_LARGE' },
    });
  });

  it('rejects multipart uploads without a file field', async () => {
    const response = await request(app)
      .post('/api/assets/images')
      .field('name', 'missing-file');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      ok: false,
      error: { code: 'UPLOAD_FILE_MISSING' },
    });
  });

  it('rejects malformed multipart uploads', async () => {
    const response = await request(app)
      .post('/api/assets/images')
      .set('Content-Type', 'multipart/form-data; boundary=broken')
      .send('--broken\r\nContent-Disposition: form-data; name="file"; filename="bad.png"\r\nContent-Type: image/png\r\n\r\n');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      ok: false,
      error: { code: 'UPLOAD_MULTIPART_INVALID' },
    });
  });
});

describe('credit adjustments', () => {
  it('rejects debit when balance is insufficient', async () => {
    const result = await storage.adjustCredits({
      userId: 'credit-insufficient-user',
      type: 'debit',
      amount: -10,
      reason: 'Generation job',
      referenceType: 'generation_job',
      referenceId: 'job_insufficient',
    });

    const balance = await storage.getCreditBalance('credit-insufficient-user');

    expect(result).toBeNull();
    expect(balance.balance).toBe(0);
  });

  it('keeps balance and transaction consistent after a successful debit', async () => {
    await storage.adjustCredits({
      userId: 'credit-debit-user',
      type: 'grant',
      amount: 30,
      reason: 'Test grant',
      referenceType: 'system',
      referenceId: 'grant_debit_user',
    });

    const result = await storage.adjustCredits({
      userId: 'credit-debit-user',
      type: 'debit',
      amount: -10,
      reason: 'Generation job',
      referenceType: 'generation_job',
      referenceId: 'job_debit_user',
    });

    const balance = await storage.getCreditBalance('credit-debit-user');
    const transaction = await storage.getCreditTransactionByReference('credit-debit-user', 'debit', 'job_debit_user');

    expect(result?.balance.balance).toBe(20);
    expect(result?.transaction.balanceAfter).toBe(20);
    expect(balance.balance).toBe(20);
    expect(transaction?.amount).toBe(-10);
    expect(transaction?.balanceAfter).toBe(20);
  });

  it('does not apply the same refund twice', async () => {
    await storage.adjustCredits({
      userId: 'credit-refund-user',
      type: 'grant',
      amount: 20,
      reason: 'Test grant',
      referenceType: 'system',
      referenceId: 'grant_refund_user',
    });
    await storage.adjustCredits({
      userId: 'credit-refund-user',
      type: 'debit',
      amount: -10,
      reason: 'Generation job',
      referenceType: 'generation_job',
      referenceId: 'job_refund_user',
    });

    const firstRefund = await storage.adjustCredits({
      userId: 'credit-refund-user',
      type: 'refund',
      amount: 10,
      reason: 'Refund generation job',
      referenceType: 'generation_job',
      referenceId: 'job_refund_user',
    });
    const secondRefund = await storage.adjustCredits({
      userId: 'credit-refund-user',
      type: 'refund',
      amount: 10,
      reason: 'Refund generation job',
      referenceType: 'generation_job',
      referenceId: 'job_refund_user',
    });

    const balance = await storage.getCreditBalance('credit-refund-user');
    const transactions = await storage.listCreditTransactions('credit-refund-user');

    expect(firstRefund?.transaction.id).toBe(secondRefund?.transaction.id);
    expect(balance.balance).toBe(20);
    expect(transactions.filter(transaction => transaction.type === 'refund' && transaction.referenceId === 'job_refund_user')).toHaveLength(1);
  });
});

function createImageAssetForUser(userId: string) {
  return storage.createImageAsset({
    userId,
    url: tinyPngDataUrl,
    filename: `${userId}-asset.png`,
    mimeType: 'image/png',
    size: 16,
  });
}

function tinyPngBuffer() {
  return Buffer.from('iVBORw0KGgo=', 'base64');
}

async function drainDevUserCredits(label: string) {
  const balance = await storage.getCreditBalance(DEV_AUTH_USER_ID);
  if (balance.balance <= 0) return;

  await storage.adjustCredits({
    userId: DEV_AUTH_USER_ID,
    type: 'debit',
    amount: -balance.balance,
    reason: `Drain credits for ${label}`,
    referenceType: 'system',
    referenceId: `drain_${label}_${Date.now()}`,
  });
}

async function restoreDevUserCredits(targetBalance: number, label: string) {
  const balance = await storage.getCreditBalance(DEV_AUTH_USER_ID);
  const delta = targetBalance - balance.balance;
  if (delta <= 0) return;

  await storage.adjustCredits({
    userId: DEV_AUTH_USER_ID,
    type: 'grant',
    amount: delta,
    reason: `Restore credits for ${label}`,
    referenceType: 'system',
    referenceId: `restore_${label}_${Date.now()}`,
  });
}
