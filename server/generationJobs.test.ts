import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DEV_AUTH_USER_ID } from './auth';
import type { app as ExpressApp } from './index';
import type * as GenerationService from './generationService';
import type * as Storage from './storage';
import { isUploadOverLimit } from './upload';

type App = typeof ExpressApp;
type StorageModule = typeof Storage;
type GenerationServiceModule = typeof GenerationService;

const tinyPngDataUrl = 'data:image/png;base64,iVBORw0KGgo=';
const validOnePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

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
  process.env.ARCHAI_DISABLE_MODEL_OPTIMIZATION_WORKER = 'true';
  process.env.GENERATION_JOB_RATE_LIMIT_PER_MINUTE = '1000';
  process.env.MAX_IMAGE_MB = '0.0001';
  process.env.MAX_MODEL_MB = '600';
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
  it.each([
    'floorplan',
    'style-render',
    'inpaint',
    'model-render',
    'design-variants',
    'material-replace',
    'plan-colorize',
    'panorama-roam-render',
  ] as const)('creates a generation job for %s mode', async (mode) => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: `Mode ${mode}` });
    const imageAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);
    const maskAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);
    const modelAsset = await createModelAssetForUser(DEV_AUTH_USER_ID);
    const config = createConfigForMode(mode, imageAsset.id, maskAsset.id, modelAsset.id);

    const inputAssetIds = [imageAsset.id];

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode,
        prompt: mode === 'floorplan' || mode === 'style-render' ? 'render this' : '',
        config,
        inputAssetIds,
      });

    expect(response.status).toBe(201);
    expect(response.body.data.job).toMatchObject({
      userId: DEV_AUTH_USER_ID,
      projectId: project.id,
      mode,
      status: 'queued',
      inputAssetIds,
    });
  });

  it('creates an object_insert step job using inpaint mode', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Object insert step' });
    const sourceAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);
    const objectAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);
    const previewAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);
    const maskAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);
    const placement = { x: 12, y: 24, width: 120, height: 80, rotation: 0 };

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'inpaint',
        step: 'object_insert',
        prompt: 'insert the chair',
        config: {
          step: 'object_insert',
          sourceImageAssetId: sourceAsset.id,
          objectInsert: {
            objectReferenceAssetId: objectAsset.id,
            previewAssetId: previewAsset.id,
            maskAssetId: maskAsset.id,
            placement,
          },
        },
        inputAssetIds: [sourceAsset.id, objectAsset.id, previewAsset.id, maskAsset.id],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.job).toMatchObject({
      userId: DEV_AUTH_USER_ID,
      projectId: project.id,
      mode: 'inpaint',
      step: 'object_insert',
      status: 'queued',
      inputAssetIds: [sourceAsset.id, objectAsset.id, previewAsset.id, maskAsset.id],
      config: {
        step: 'object_insert',
        sourceImageAssetId: sourceAsset.id,
        objectReferenceAssetId: objectAsset.id,
        placementPreviewAssetId: previewAsset.id,
        placementMaskAssetId: maskAsset.id,
        maskMode: 'asset-mask',
        maskAssetId: maskAsset.id,
        editTarget: 'furniture',
        objectPlacement: placement,
        objectInsert: {
          sourceImageAssetId: sourceAsset.id,
          objectReferenceAssetId: objectAsset.id,
          previewAssetId: previewAsset.id,
          maskAssetId: maskAsset.id,
          placement,
        },
      },
    });
  });

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
          diagnostics: {
            phase: 'queued',
            timing: { jobCreatedAt: expect.any(String) },
          },
        },
      },
    });
  });

  it('creates a material-replace job with mask, target material, and material references', async () => {
    const originalBalance = await storage.getCreditBalance(DEV_AUTH_USER_ID);
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Material replace project' });
    const sourceAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);
    const maskAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);
    const materialAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'material-replace',
        prompt: '',
        config: {
          sourceImageAssetId: sourceAsset.id,
          maskMode: 'asset-mask',
          maskAssetId: maskAsset.id,
          targetObjectType: 'floor',
          targetMaterial: 'light-wood',
          materialReferenceAssetIds: [materialAsset.id],
          preserveLighting: true,
          preserveGeometry: true,
          strength: 'balanced',
        },
        inputAssetIds: [sourceAsset.id, materialAsset.id],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.job).toMatchObject({
      mode: 'material-replace',
      inputAssetIds: [sourceAsset.id, materialAsset.id],
      config: {
        batchCount: 1,
        editTarget: 'material',
        sourceImageAssetId: sourceAsset.id,
        maskMode: 'asset-mask',
        maskAssetId: maskAsset.id,
        targetObjectType: 'floor',
        targetMaterial: 'light-wood',
        materialReferenceAssetIds: [materialAsset.id],
        preserveLighting: true,
        preserveGeometry: true,
        strength: 'balanced',
      },
    });
    expect((await storage.getCreditBalance(DEV_AUTH_USER_ID)).balance).toBe(originalBalance.balance - 1);
  });

  it('creates a material-replace smart-type job without a mask', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Material replace smart type' });
    const sourceAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'material-replace',
        prompt: '',
        config: {
          editMode: 'smart-type',
          sourceImageAssetId: sourceAsset.id,
          targetObjectType: 'floor',
          targetMaterial: 'dark-wood',
          preserveLighting: true,
          preserveGeometry: true,
          strength: 'balanced',
        },
        inputAssetIds: [sourceAsset.id],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.job).toMatchObject({
      mode: 'material-replace',
      config: {
        editMode: 'smart-type',
        sourceImageAssetId: sourceAsset.id,
        targetObjectType: 'floor',
        targetMaterial: 'dark-wood',
      },
    });
    expect(response.body.data.job.config).not.toHaveProperty('maskMode');
    expect(response.body.data.job.config).not.toHaveProperty('maskAssetId');
  });

  it('accepts material-replace with legacy top-level maskAssetId payload shape', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Material replace top-level mask' });
    const sourceAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);
    const maskAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'material-replace',
        prompt: '',
        sourceImageAssetId: sourceAsset.id,
        maskAssetId: maskAsset.id,
        config: {
          targetObjectType: 'floor',
          targetMaterial: 'microcement',
          materialReferenceAssetIds: [],
        },
        inputAssetIds: [sourceAsset.id],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.job).toMatchObject({
      mode: 'material-replace',
      config: {
        sourceImageAssetId: sourceAsset.id,
        maskMode: 'asset-mask',
        maskAssetId: maskAsset.id,
        targetMaterial: 'microcement',
      },
    });
  });

  it('returns a concrete validation error instead of invalid mode for material-replace', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Material replace concrete error' });
    const sourceAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'material-replace',
        prompt: '',
        config: {
          editMode: 'mask',
          sourceImageAssetId: sourceAsset.id,
          targetMaterial: 'microcement',
        },
        inputAssetIds: [sourceAsset.id],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('GENERATION_JOB_MASK_REQUIRED');
    expect(response.body.error.message).toBe('精细涂抹模式下请先选择需要替换的区域');
  });

  it('rejects smart-type material-replace without target object type', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Material replace missing smart object' });
    const sourceAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'material-replace',
        prompt: '',
        config: {
          editMode: 'smart-type',
          sourceImageAssetId: sourceAsset.id,
          targetMaterial: 'microcement',
        },
        inputAssetIds: [sourceAsset.id],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('GENERATION_JOB_MATERIAL_TARGET_OBJECT_REQUIRED');
  });

  it('rejects material-replace without source image, mask, or target material prompt', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Invalid material replace project' });
    const sourceAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);
    const maskAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);

    const missingSource = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'material-replace',
        prompt: '',
        config: { maskMode: 'asset-mask', maskAssetId: maskAsset.id, targetMaterial: 'light-wood' },
        inputAssetIds: [sourceAsset.id],
      });

    const missingMask = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'material-replace',
        prompt: '',
        config: { editMode: 'mask', sourceImageAssetId: sourceAsset.id, targetMaterial: 'light-wood' },
        inputAssetIds: [sourceAsset.id],
      });

    const missingTarget = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'material-replace',
        prompt: '',
        config: { sourceImageAssetId: sourceAsset.id, targetObjectType: 'floor', maskMode: 'asset-mask', maskAssetId: maskAsset.id },
        inputAssetIds: [sourceAsset.id],
      });

    expect(missingSource.status).toBe(400);
    expect(missingSource.body.error.code).toBe('GENERATION_JOB_SOURCE_IMAGE_REQUIRED');
    expect(missingMask.status).toBe(400);
    expect(missingMask.body.error.code).toBe('GENERATION_JOB_MASK_REQUIRED');
    expect(missingTarget.status).toBe(400);
    expect(missingTarget.body.error.code).toBe('GENERATION_JOB_MATERIAL_TARGET_REQUIRED');
  });

  it('rejects another user material reference for material-replace', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Material reference ownership' });
    const sourceAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);
    const maskAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);
    const otherMaterialAsset = await createImageAssetForUser('other-user');

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'material-replace',
        prompt: '',
        config: {
          sourceImageAssetId: sourceAsset.id,
          maskMode: 'asset-mask',
          maskAssetId: maskAsset.id,
          targetObjectType: 'floor',
          targetMaterial: 'light-wood',
          materialReferenceAssetIds: [otherMaterialAsset.id],
        },
        inputAssetIds: [sourceAsset.id],
      });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('GENERATION_JOB_REFERENCE_ASSET_NOT_FOUND');
  });

  it('creates a model-render generation job with snapshot and source model metadata', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Model render project' });
    const snapshotAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);
    const modelAsset = await createModelAssetForUser(DEV_AUTH_USER_ID);

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'model-render',
        prompt: 'render the white model',
        config: {
          sourceImageAssetId: snapshotAsset.id,
          snapshotAssetId: snapshotAsset.id,
          sourceModelAssetId: modelAsset.id,
          modelSnapshotMetadata: {
            sourceType: 'model-snapshot',
            sourceModelAssetId: modelAsset.id,
            width: 800,
            height: 600,
            createdAt: new Date().toISOString(),
          },
        },
        inputAssetIds: [snapshotAsset.id],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.job).toMatchObject({
      mode: 'model-render',
      inputAssetIds: [snapshotAsset.id],
      config: {
        sourceModelAssetId: modelAsset.id,
        snapshotAssetId: snapshotAsset.id,
      },
    });
  });

  it('creates a model-render job from an uploaded snapshot without a source model asset', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Uploaded model snapshot' });
    const snapshotAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'model-render',
        prompt: 'render the uploaded white model screenshot',
        config: {
          sourceImageAssetId: snapshotAsset.id,
          snapshotAssetId: snapshotAsset.id,
          modelSnapshotMetadata: {
            sourceType: 'model-snapshot',
            inputSource: 'uploaded-snapshot',
            snapshotAssetId: snapshotAsset.id,
            width: 1200,
            height: 800,
            createdAt: new Date().toISOString(),
          },
        },
        inputAssetIds: [snapshotAsset.id],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.job).toMatchObject({
      mode: 'model-render',
      inputAssetIds: [snapshotAsset.id],
      config: {
        sourceImageAssetId: snapshotAsset.id,
        snapshotAssetId: snapshotAsset.id,
      },
    });
    expect(response.body.data.job.config).not.toHaveProperty('sourceModelAssetId');
  });

  it('creates a panorama-roam-render job from a captured panorama image', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Panorama render project' });
    const panoramaAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);
    const modelAsset = await createModelAssetForUser(DEV_AUTH_USER_ID);

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'panorama-roam-render',
        prompt: 'render the panorama',
        config: {
          sourceImageAssetId: panoramaAsset.id,
          panoramaAssetId: panoramaAsset.id,
          sourceModelAssetId: modelAsset.id,
          targetWidth: 2048,
          targetHeight: 1024,
          targetAspectRatio: '2:1',
          buildingType: '住宅',
          spaceType: '客厅',
          renderStyle: '电影级写实',
          atmosphere: '自然日光',
        },
        inputAssetIds: [panoramaAsset.id],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.job).toMatchObject({
      mode: 'panorama-roam-render',
      inputAssetIds: [panoramaAsset.id],
      config: {
        sourceImageAssetId: panoramaAsset.id,
        panoramaAssetId: panoramaAsset.id,
        sourceModelAssetId: modelAsset.id,
        targetAspectRatio: '2:1',
      },
    });
  });

  it('rejects panorama-roam-render jobs without a panorama image asset', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Missing panorama' });
    const panoramaAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'panorama-roam-render',
        prompt: 'render the panorama',
        config: {},
        inputAssetIds: [panoramaAsset.id],
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      ok: false,
      error: { code: 'GENERATION_JOB_PANORAMA_ASSET_REQUIRED' },
    });
  });

  it('rejects model-render jobs without a snapshot image asset field', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Missing snapshot' });
    const snapshotAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'model-render',
        prompt: 'render the white model',
        config: {},
        inputAssetIds: [snapshotAsset.id],
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      ok: false,
      error: { code: 'GENERATION_JOB_SNAPSHOT_ASSET_REQUIRED' },
    });
  });

  it('rejects model-render jobs when source model asset belongs to another user', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Other model owner' });
    const snapshotAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);
    const otherModelAsset = await createModelAssetForUser('other-user');

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'model-render',
        prompt: 'render the white model',
        config: {
          sourceImageAssetId: snapshotAsset.id,
          snapshotAssetId: snapshotAsset.id,
          sourceModelAssetId: otherModelAsset.id,
        },
        inputAssetIds: [snapshotAsset.id],
      });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      ok: false,
      error: { code: 'GENERATION_JOB_SOURCE_MODEL_NOT_FOUND' },
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

  it('rejects another user furniture reference asset id', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Own project furniture' });
    const ownAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);
    const otherFurnitureAsset = await createImageAssetForUser('other-user');

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'inpaint',
        prompt: 'replace selected chair',
        config: { editTarget: 'furniture', furnitureReferenceAssetIds: [otherFurnitureAsset.id] },
        inputAssetIds: [ownAsset.id],
      });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      ok: false,
      error: { code: 'GENERATION_JOB_REFERENCE_ASSET_NOT_FOUND' },
    });
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

  it('creates a plan-colorize job with default expression config', async () => {
    const originalBalance = await storage.getCreditBalance(DEV_AUTH_USER_ID);
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Plan colorize project' });
    const sourceAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'plan-colorize',
        prompt: '',
        config: {},
        inputAssetIds: [sourceAsset.id],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.job).toMatchObject({
      mode: 'plan-colorize',
      inputAssetIds: [sourceAsset.id],
      config: {
        batchCount: 1,
        drawingType: 'residential',
        template: 'colored-plan',
        enableZoningColor: true,
        enableRoomLabels: false,
        enableFurnitureEnhance: true,
        enableCirculationArrows: false,
        enableScaleEnhance: true,
        enableLandscapeFill: false,
        preserveLinework: true,
        manualRoomLabels: [],
      },
    });
    expect((await storage.getCreditBalance(DEV_AUTH_USER_ID)).balance).toBe(originalBalance.balance - 1);
  });

  it('rejects plan-colorize jobs without a source image', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Missing plan source' });

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'plan-colorize',
        prompt: '',
        config: {},
        inputAssetIds: [],
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      ok: false,
      error: {
        code: 'GENERATION_JOB_INPUTS_INVALID',
        message: '请先上传或选择一张平面图',
      },
    });
  });

  it('normalizes plan-colorize config and rejects another user source image', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Plan ownership' });
    const otherAsset = await createImageAssetForUser('other-plan-user');

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'plan-colorize',
        prompt: '',
        config: {
          drawingType: 'invalid',
          template: 'invalid',
          enableRoomLabels: true,
          enableCirculationArrows: true,
          customPrompt: '  Add labels only where readable.  ',
          manualRoomLabels: ['Lobby', '', 'Meeting'],
        },
        inputAssetIds: [otherAsset.id],
      });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      ok: false,
      error: { code: 'GENERATION_JOB_INPUT_ASSET_NOT_FOUND' },
    });
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
    expect((await storage.getCreditBalance(DEV_AUTH_USER_ID)).balance).toBe(originalBalance.balance - 1);

    const jobId = createResponse.body.data.job.id;
    const firstCancel = await request(app).post(`/api/generation-jobs/${encodeURIComponent(jobId)}/cancel`);
    const secondCancel = await request(app).post(`/api/generation-jobs/${encodeURIComponent(jobId)}/cancel`);
    const transactions = await storage.listCreditTransactions(DEV_AUTH_USER_ID);

    expect(firstCancel.status).toBe(200);
    expect(secondCancel.status).toBe(200);
    expect((await storage.getCreditBalance(DEV_AUTH_USER_ID)).balance).toBe(originalBalance.balance);
    expect(transactions.filter(transaction => transaction.type === 'generate_refund' && transaction.referenceId === jobId)).toHaveLength(1);
  });

  it('clamps legacy batchCount requests to one result and single-image credit cost', async () => {
    const originalBalance = await storage.getCreditBalance(DEV_AUTH_USER_ID);
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Single output clamp project' });
    const ownAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'style-render',
        prompt: 'render one option',
        config: { batchCount: 4 },
        inputAssetIds: [ownAsset.id],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.job.config.batchCount).toBe(1);
    expect((await storage.getCreditBalance(DEV_AUTH_USER_ID)).balance).toBe(originalBalance.balance - 1);
  });

  it('creates design-variants jobs with batchCount 2 and charges two outputs', async () => {
    const originalBalance = await storage.getCreditBalance(DEV_AUTH_USER_ID);
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Design variants two' });
    const ownAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'design-variants',
        prompt: '',
        config: { batchCount: 2, variantStrategy: 'style-matrix', variantStyles: [] },
        inputAssetIds: [ownAsset.id],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.job.config).toMatchObject({
      batchCount: 2,
      variantStrategy: 'style-matrix',
      variantStyles: ['modern-minimal', 'natural-wood'],
    });
    expect((await storage.getCreditBalance(DEV_AUTH_USER_ID)).balance).toBe(originalBalance.balance - 2);
  });

  it('creates design-variants jobs with default batchCount 4 and charges four outputs', async () => {
    const originalBalance = await storage.getCreditBalance(DEV_AUTH_USER_ID);
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Design variants four' });
    const ownAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'design-variants',
        prompt: '',
        config: {},
        inputAssetIds: [ownAsset.id],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.job.config.batchCount).toBe(4);
    expect(response.body.data.job.config.variantStyles).toEqual(['modern-minimal', 'cream-style', 'light-luxury', 'natural-wood']);
    expect((await storage.getCreditBalance(DEV_AUTH_USER_ID)).balance).toBe(originalBalance.balance - 4);
  });

  it('creates design-variants jobs with batchCount 8 and charges eight outputs', async () => {
    const originalBalance = await storage.getCreditBalance(DEV_AUTH_USER_ID);
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Design variants eight' });
    const ownAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'design-variants',
        prompt: '',
        config: {
          batchCount: 8,
          stylePackId: 'hotel',
          variantStrategy: 'style-matrix',
          variantNames: ['现代极简', '温润木质'],
        },
        inputAssetIds: [ownAsset.id],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.job.config).toMatchObject({
      batchCount: 8,
      stylePackId: 'hotel',
      variantNames: ['现代极简', '温润木质'],
    });
    expect(response.body.data.job.config.variantStyles).toHaveLength(8);
    expect((await storage.getCreditBalance(DEV_AUTH_USER_ID)).balance).toBe(originalBalance.balance - 8);
  });

  it.each([1, 3, 5, 9])('rejects invalid design-variants batchCount %s', async (batchCount) => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: `Invalid variant ${batchCount}` });
    const ownAsset = await createImageAssetForUser(DEV_AUTH_USER_ID);

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'design-variants',
        prompt: '',
        config: { batchCount },
        inputAssetIds: [ownAsset.id],
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      ok: false,
      error: { code: 'GENERATION_JOB_BATCH_COUNT_INVALID' },
    });
  });

  it('rejects design-variants jobs without input asset ids', async () => {
    const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Missing variant reference' });

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({
        projectId: project.id,
        mode: 'design-variants',
        prompt: '',
        config: { batchCount: 4, variantStrategy: 'style-matrix' },
        inputAssetIds: [],
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      ok: false,
      error: {
        code: 'GENERATION_JOB_INPUTS_INVALID',
        message: '请先上传或选择参考图',
      },
    });
  });

  it('generates and saves all design-variants results sequentially with mock provider', async () => {
    const originalWorkerDisabled = process.env.ARCHAI_DISABLE_GENERATION_WORKER;
    process.env.ARCHAI_DISABLE_GENERATION_WORKER = 'false';

    try {
      const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Variant worker project' });
      const ownAsset = await storage.createImageAsset({
        userId: DEV_AUTH_USER_ID,
        url: `data:image/png;base64,${validOnePixelPng.toString('base64')}`,
        filename: 'variant-input.png',
        mimeType: 'image/png',
        size: validOnePixelPng.length,
      });

      const response = await request(app)
        .post('/api/generation-jobs')
        .send({
          projectId: project.id,
          mode: 'design-variants',
          prompt: '',
          config: {
            batchCount: 8,
            variantStrategy: 'style-matrix',
            stylePackId: 'interior-common',
            variantStyles: ['modern-minimal', 'cream-style', 'wabi-sabi', 'light-luxury', 'natural-wood', 'premium-gray', 'industrial', 'hotel-lobby'],
            variantNames: ['方案 A', '方案 B', '方案 C', '方案 D', '方案 E', '方案 F', '方案 G', '方案 H'],
            customPrompt: 'Keep the original layout and camera angle.',
          },
          inputAssetIds: [ownAsset.id],
        });

      expect(response.status).toBe(201);
      const job = await waitForGenerationJob(response.body.data.job.id, 'succeeded');
      const results = await storage.listGenerationResults(job.id, DEV_AUTH_USER_ID);

      expect(job.outputAssetIds).toHaveLength(8);
      expect(job.outputAssetId).toBe(job.outputAssetIds?.[0]);
      expect(results).toHaveLength(8);
      expect(results[0]).toMatchObject({ isSelected: true, isFavorite: false });
      expect(results[1]).toMatchObject({ isSelected: false, isFavorite: false });
      expect(results.map(result => result.metadata?.variantStyle)).toEqual(['modern-minimal', 'cream-style', 'wabi-sabi', 'light-luxury', 'natural-wood', 'premium-gray', 'industrial', 'hotel-lobby']);
      expect(results[0].metadata).toMatchObject({
        variantIndex: 0,
        variantCode: 'A',
        variantName: '方案 A',
        stylePackId: 'interior-common',
      });
    } finally {
      process.env.ARCHAI_DISABLE_GENERATION_WORKER = originalWorkerDisabled;
    }
  });

  it('generates material-replace with mock provider and saves one selected result', async () => {
    const originalWorkerDisabled = process.env.ARCHAI_DISABLE_GENERATION_WORKER;
    process.env.ARCHAI_DISABLE_GENERATION_WORKER = 'false';

    try {
      const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Material replace worker project' });
      const sourceAsset = await storage.createImageAsset({
        userId: DEV_AUTH_USER_ID,
        url: `data:image/png;base64,${validOnePixelPng.toString('base64')}`,
        filename: 'material-input.png',
        mimeType: 'image/png',
        size: validOnePixelPng.length,
      });
      const maskAsset = await storage.createImageAsset({
        userId: DEV_AUTH_USER_ID,
        url: `data:image/png;base64,${validOnePixelPng.toString('base64')}`,
        filename: 'material-mask.png',
        mimeType: 'image/png',
        size: validOnePixelPng.length,
      });

      const response = await request(app)
        .post('/api/generation-jobs')
        .send({
          projectId: project.id,
          mode: 'material-replace',
          prompt: '',
          config: {
            editMode: 'mask',
            sourceImageAssetId: sourceAsset.id,
            maskMode: 'asset-mask',
            maskAssetId: maskAsset.id,
            targetObjectType: 'wall',
            targetMaterial: 'microcement',
            customMaterialPrompt: 'Use a calm warm gray finish.',
          },
          inputAssetIds: [sourceAsset.id],
        });

      expect(response.status).toBe(201);
      const job = await waitForGenerationJob(response.body.data.job.id, 'succeeded');
      const results = await storage.listGenerationResults(job.id, DEV_AUTH_USER_ID);

      expect(job.mode).toBe('material-replace');
      expect(job.outputAssetIds).toHaveLength(1);
      expect(job.outputAssetId).toBe(job.outputAssetIds?.[0]);
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ isSelected: true, isFavorite: false });
      expect(results[0].metadata?.mode).toBe('material-replace');
    } finally {
      process.env.ARCHAI_DISABLE_GENERATION_WORKER = originalWorkerDisabled;
    }
  });

  it('generates smart-type material-replace without mask using mock provider', async () => {
    const originalWorkerDisabled = process.env.ARCHAI_DISABLE_GENERATION_WORKER;
    process.env.ARCHAI_DISABLE_GENERATION_WORKER = 'false';

    try {
      const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Smart material replace worker project' });
      const sourceAsset = await storage.createImageAsset({
        userId: DEV_AUTH_USER_ID,
        url: `data:image/png;base64,${validOnePixelPng.toString('base64')}`,
        filename: 'smart-material-input.png',
        mimeType: 'image/png',
        size: validOnePixelPng.length,
      });

      const response = await request(app)
        .post('/api/generation-jobs')
        .send({
          projectId: project.id,
          mode: 'material-replace',
          prompt: '',
          config: {
            editMode: 'smart-type',
            sourceImageAssetId: sourceAsset.id,
            targetObjectType: 'floor',
            targetMaterial: 'dark-wood',
          },
          inputAssetIds: [sourceAsset.id],
        });

      expect(response.status).toBe(201);
      const job = await waitForGenerationJob(response.body.data.job.id, 'succeeded');
      const results = await storage.listGenerationResults(job.id, DEV_AUTH_USER_ID);

      expect(job.mode).toBe('material-replace');
      expect(job.config).not.toHaveProperty('maskMode');
      expect(results).toHaveLength(1);
      expect(results[0].metadata?.mode).toBe('material-replace');
    } finally {
      process.env.ARCHAI_DISABLE_GENERATION_WORKER = originalWorkerDisabled;
    }
  });

  it('generates plan-colorize with mock provider and saves expression metadata', async () => {
    const originalWorkerDisabled = process.env.ARCHAI_DISABLE_GENERATION_WORKER;
    process.env.ARCHAI_DISABLE_GENERATION_WORKER = 'false';

    try {
      const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Plan colorize worker project' });
      const sourceAsset = await storage.createImageAsset({
        userId: DEV_AUTH_USER_ID,
        url: `data:image/png;base64,${validOnePixelPng.toString('base64')}`,
        filename: 'plan-input.png',
        mimeType: 'image/png',
        size: validOnePixelPng.length,
      });

      const response = await request(app)
        .post('/api/generation-jobs')
        .send({
          projectId: project.id,
          mode: 'plan-colorize',
          prompt: '',
          config: {
            drawingType: 'landscape',
            template: 'landscape-plan',
            enableRoomLabels: true,
            enableCirculationArrows: true,
            enableLandscapeFill: true,
            preserveLinework: true,
            manualRoomLabels: ['Entry Plaza', 'Garden'],
            customPrompt: 'Use soft green landscape fills.',
          },
          inputAssetIds: [sourceAsset.id],
        });

      expect(response.status).toBe(201);
      expect(response.body.data.job.config.customPrompt).toBe('Use soft green landscape fills.');
      const job = await waitForGenerationJob(response.body.data.job.id, 'succeeded');
      const results = await storage.listGenerationResults(job.id, DEV_AUTH_USER_ID);

      expect(job.mode).toBe('plan-colorize');
      expect(job.outputAssetIds).toHaveLength(1);
      expect(job.outputAssetId).toBe(job.outputAssetIds?.[0]);
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ isSelected: true, isFavorite: false });
      expect(results[0].metadata).toMatchObject({
        mode: 'plan-colorize',
        drawingType: 'landscape',
        template: 'landscape-plan',
        enableRoomLabels: true,
        enableCirculationArrows: true,
        enableLandscapeFill: true,
        preserveLinework: true,
      });
      expect(JSON.stringify(results[0].metadata)).not.toMatch(/undefined|null/);
    } finally {
      process.env.ARCHAI_DISABLE_GENERATION_WORKER = originalWorkerDisabled;
    }
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
    expect(transactions.filter(transaction => transaction.type === 'generate_refund' && transaction.referenceId === jobId)).toHaveLength(1);
  });
});

describe('generation worker image inputs', () => {
  it('downloads a Supabase-style public image URL before sending provider input', async () => {
    const originalWorkerDisabled = process.env.ARCHAI_DISABLE_GENERATION_WORKER;
    const imageServer = createServer((req, res) => {
      if (req.url === '/storage/v1/object/public/archai-assets/users/dev-user/images/input.png') {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(validOnePixelPng);
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>(resolve => imageServer.listen(0, '127.0.0.1', resolve));

    try {
      process.env.ARCHAI_DISABLE_GENERATION_WORKER = 'false';
      const address = imageServer.address() as AddressInfo;
      const publicImageUrl = `http://127.0.0.1:${address.port}/storage/v1/object/public/archai-assets/users/dev-user/images/input.png`;
      const project = await storage.createProject({ userId: DEV_AUTH_USER_ID, name: 'Remote storage input' });
      const remoteAsset = await storage.createImageAsset({
        userId: DEV_AUTH_USER_ID,
        url: publicImageUrl,
        filename: 'users/dev-user/images/input.png',
        mimeType: 'image/png',
        size: validOnePixelPng.length,
      });

      const response = await request(app)
        .post('/api/generation-jobs')
        .send({
          projectId: project.id,
          mode: 'style-render',
          prompt: 'render remote storage input',
          config: {},
          inputAssetIds: [remoteAsset.id],
        });

      expect(response.status).toBe(201);
      const job = await waitForGenerationJob(response.body.data.job.id, 'succeeded');

      expect(job.status).toBe('succeeded');
      expect(job.outputAssetId).toEqual(expect.any(String));
      expect(job.diagnostics?.images?.inputImages).toBe(1);
      expect(job.diagnostics?.images?.qualityMode).toBe('fast');
      expect(job.diagnostics?.images?.payloadBytesApprox).toEqual(expect.any(Number));
      expect(job.diagnostics?.images?.referenceCount).toBe(0);
      expect(job.diagnostics?.timing?.providerMs).toEqual(expect.any(Number));
      expect(job.diagnostics?.provider?.providerMs).toEqual(expect.any(Number));
      expect(job.diagnostics?.provider?.name).toBe('mock');
      expect(job.diagnostics?.images?.prepared?.[0]).toMatchObject({
        role: 'input',
        mime: expect.stringMatching(/^image\//u),
      });
    } finally {
      process.env.ARCHAI_DISABLE_GENERATION_WORKER = originalWorkerDisabled;
      await new Promise<void>((resolve, reject) => {
        imageServer.close(error => (error ? reject(error) : resolve()));
      });
    }
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

  it('requires authentication even when explicitly enabled for debugging', async () => {
    const originalAuthMode = process.env.AUTH_MODE;
    const originalLegacyFlag = process.env.ENABLE_LEGACY_GENERATION_ENDPOINTS;
    process.env.AUTH_MODE = 'unknown';
    process.env.ENABLE_LEGACY_GENERATION_ENDPOINTS = 'true';

    try {
      const response = await request(app)
        .post('/api/generate/style-render')
        .send({
          inputImageDataUrl: tinyPngDataUrl,
          prompt: 'render this',
          config: {},
        });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'AUTH_REQUIRED' },
      });
    } finally {
      restoreEnv('AUTH_MODE', originalAuthMode);
      restoreEnv('ENABLE_LEGACY_GENERATION_ENDPOINTS', originalLegacyFlag);
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
    expect(response.body.error.message).toContain('图片文件过大');
  });

  it.each([
    ['jpg', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0x00]), Buffer.alloc(200)]), 'image/jpeg'],
    ['png', Buffer.concat([tinyPngBuffer(), Buffer.alloc(200)]), 'image/png'],
    ['webp', Buffer.concat([webpHeaderBuffer(), Buffer.alloc(200)]), 'image/webp'],
  ])('uses the image upload limit for oversized .%s images', async (extension, content, contentType) => {
    const response = await request(app)
      .post('/api/assets/images')
      .attach('file', content, { filename: `large.${extension}`, contentType });

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({
      ok: false,
      error: { code: 'UPLOAD_FILE_TOO_LARGE' },
    });
    expect(response.body.error.message).toContain('图片文件过大');
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

  it.each([
    ['glb', Buffer.from('glTFmock'), 'model/gltf-binary'],
    ['gltf', Buffer.from('{"asset":{"version":"2.0"}}'), 'model/gltf+json'],
    ['obj', Buffer.from('o cube\nv 0 0 0\nf 1 1 1\n'), 'application/octet-stream'],
    ['dae', Buffer.from('<?xml version="1.0"?><COLLADA></COLLADA>'), 'application/octet-stream'],
    ['stl', Buffer.from([0, 1, 2, 3, 4, 5]), 'application/octet-stream'],
  ])('uploads a valid .%s model asset', async (extension, content, contentType) => {
    const response = await request(app)
      .post('/api/assets/models')
      .attach('file', content, { filename: `model.${extension}`, contentType });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      ok: true,
      data: {
        asset: {
          userId: DEV_AUTH_USER_ID,
          fileType: extension,
          format: extension,
          originalFilename: `model.${extension}`,
          mimeType: expect.any(String),
          size: content.length,
        },
      },
    });
  });

  it('allows a .glb model over 50MB when it is below the 600MB model limit', async () => {
    const fiftyOneMbGlb = Buffer.concat([
      Buffer.from('glTF'),
      Buffer.alloc(51 * 1024 * 1024 - 4),
    ]);

    const response = await request(app)
      .post('/api/assets/models')
      .attach('file', fiftyOneMbGlb, { filename: 'large-model.glb', contentType: 'model/gltf-binary' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      ok: true,
      data: {
        asset: {
          fileType: 'glb',
          format: 'glb',
          size: fiftyOneMbGlb.length,
          metadata: {
            optimizationStatus: expect.stringMatching(/pending|processing|succeeded|failed|skipped/),
            originalFileSize: fiftyOneMbGlb.length,
          },
        },
      },
    });
  });

  it('marks large STL uploads for model preview optimization without failing upload', async () => {
    const originalThreshold = process.env.MODEL_OPTIMIZATION_THRESHOLD_MB;
    process.env.MODEL_OPTIMIZATION_THRESHOLD_MB = '0';

    try {
      const response = await request(app)
        .post('/api/assets/models')
        .attach('file', Buffer.from([0, 1, 2, 3, 4, 5]), { filename: 'large-preview.stl', contentType: 'application/octet-stream' });

      expect(response.status).toBe(201);
      expect(response.body.data.asset).toMatchObject({
        fileType: 'stl',
        metadata: {
          originalUrl: expect.any(String),
          format: 'stl',
          originalFileSize: 6,
          optimizationStatus: 'pending',
        },
      });

      const assetId = response.body.data.asset.id;
      const getResponse = await request(app).get(`/api/assets/models/${encodeURIComponent(assetId)}`);
      expect(getResponse.status).toBe(200);
      expect(getResponse.body.data.asset.metadata).toMatchObject({
        format: 'stl',
        originalFileSize: 6,
      });
    } finally {
      if (originalThreshold === undefined) delete process.env.MODEL_OPTIMIZATION_THRESHOLD_MB;
      else process.env.MODEL_OPTIMIZATION_THRESHOLD_MB = originalThreshold;
    }
  });

  it('can manually trigger optimization for an uploaded GLB and write preview urls', async () => {
    const response = await request(app)
      .post('/api/assets/models')
      .attach('file', Buffer.from('glTFmock'), { filename: 'manual-preview.glb', contentType: 'model/gltf-binary' });

    expect(response.status).toBe(201);
    const assetId = response.body.data.asset.id;

    const optimizeResponse = await request(app).post(`/api/assets/models/${encodeURIComponent(assetId)}/optimize`);
    expect(optimizeResponse.status).toBe(200);
    expect(optimizeResponse.body.data.asset.metadata.optimizationStatus).toBe('processing');

    const deadline = Date.now() + 3000;
    let optimizedAsset = optimizeResponse.body.data.asset;
    while (Date.now() < deadline) {
      const getResponse = await request(app).get(`/api/assets/models/${encodeURIComponent(assetId)}`);
      optimizedAsset = getResponse.body.data.asset;
      if (optimizedAsset.metadata?.optimizationStatus === 'succeeded') break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    expect(optimizedAsset.metadata.optimizationStatus).toBe('succeeded');
    expect(optimizedAsset.previewUrl || optimizedAsset.optimizedUrl).toContain('/uploads/models/preview/');
  });

  it('treats files over 600MB as over the model upload limit', () => {
    expect(isUploadOverLimit(50 * 1024 * 1024 + 1, 600)).toBe(false);
    expect(isUploadOverLimit(600 * 1024 * 1024, 600)).toBe(false);
    expect(isUploadOverLimit(600 * 1024 * 1024 + 1, 600)).toBe(true);
  });

  it.each(['fbx', 'skp'])('rejects unsupported .%s model uploads', async (extension) => {
    const response = await request(app)
      .post('/api/assets/models')
      .attach('file', Buffer.from('unsupported model'), { filename: `model.${extension}`, contentType: 'application/octet-stream' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      ok: false,
      error: { code: 'MODEL_ASSET_TYPE_INVALID' },
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
      type: 'generate_charge',
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
      type: 'admin_grant',
      amount: 30,
      reason: 'Test grant',
      referenceType: 'system',
      referenceId: 'grant_debit_user',
    });

    const result = await storage.adjustCredits({
      userId: 'credit-debit-user',
      type: 'generate_charge',
      amount: -10,
      reason: 'Generation job',
      referenceType: 'generation_job',
      referenceId: 'job_debit_user',
    });

    const balance = await storage.getCreditBalance('credit-debit-user');
    const transaction = await storage.getCreditTransactionByReference('credit-debit-user', 'generate_charge', 'job_debit_user');

    expect(result?.balance.balance).toBe(20);
    expect(result?.transaction.balanceAfter).toBe(20);
    expect(balance.balance).toBe(20);
    expect(transaction?.amount).toBe(-10);
    expect(transaction?.balanceAfter).toBe(20);
  });

  it('does not apply the same refund twice', async () => {
    await storage.adjustCredits({
      userId: 'credit-refund-user',
      type: 'admin_grant',
      amount: 20,
      reason: 'Test grant',
      referenceType: 'system',
      referenceId: 'grant_refund_user',
    });
    await storage.adjustCredits({
      userId: 'credit-refund-user',
      type: 'generate_charge',
      amount: -10,
      reason: 'Generation job',
      referenceType: 'generation_job',
      referenceId: 'job_refund_user',
    });

    const firstRefund = await storage.adjustCredits({
      userId: 'credit-refund-user',
      type: 'generate_refund',
      amount: 10,
      reason: 'Refund generation job',
      referenceType: 'generation_job',
      referenceId: 'job_refund_user',
    });
    const secondRefund = await storage.adjustCredits({
      userId: 'credit-refund-user',
      type: 'generate_refund',
      amount: 10,
      reason: 'Refund generation job',
      referenceType: 'generation_job',
      referenceId: 'job_refund_user',
    });

    const balance = await storage.getCreditBalance('credit-refund-user');
    const transactions = await storage.listCreditTransactions('credit-refund-user');

    expect(firstRefund?.transaction.id).toBe(secondRefund?.transaction.id);
    expect(balance.balance).toBe(20);
    expect(transactions.filter(transaction => transaction.type === 'generate_refund' && transaction.referenceId === 'job_refund_user')).toHaveLength(1);
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

function createConfigForMode(mode: string, imageAssetId: string, maskAssetId: string, modelAssetId: string): Record<string, unknown> {
  if (mode === 'inpaint') {
    return { maskMode: 'asset-mask', maskAssetId };
  }

  if (mode === 'model-render') {
    return {
      sourceImageAssetId: imageAssetId,
      snapshotAssetId: imageAssetId,
      sourceModelAssetId: modelAssetId,
    };
  }

  if (mode === 'design-variants') {
    return { batchCount: 2, variantStrategy: 'style-matrix' };
  }

  if (mode === 'material-replace') {
    return {
      editMode: 'smart-type',
      sourceImageAssetId: imageAssetId,
      targetObjectType: 'floor',
      targetMaterial: 'light-wood',
    };
  }

  if (mode === 'panorama-roam-render') {
    return {
      sourceImageAssetId: imageAssetId,
      panoramaAssetId: imageAssetId,
      sourceModelAssetId: modelAssetId,
    };
  }

  return {};
}

function tinyPngBuffer() {
  return Buffer.from('iVBORw0KGgo=', 'base64');
}

function webpHeaderBuffer() {
  return Buffer.from('RIFF0000WEBP', 'ascii');
}

async function drainDevUserCredits(label: string) {
  const balance = await storage.getCreditBalance(DEV_AUTH_USER_ID);
  if (balance.balance <= 0) return;

  await storage.adjustCredits({
    userId: DEV_AUTH_USER_ID,
    type: 'generate_charge',
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
    type: 'admin_grant',
    amount: delta,
    reason: `Restore credits for ${label}`,
    referenceType: 'system',
    referenceId: `restore_${label}_${Date.now()}`,
  });
}

function createModelAssetForUser(userId: string) {
  return storage.createModelAsset({
    userId,
    url: `/uploads/users/${userId}/models/model.glb`,
    filename: `${userId}-model.glb`,
    originalFilename: `${userId}-model.glb`,
    fileType: 'glb',
    mimeType: 'model/gltf-binary',
    size: 32,
  });
}

async function waitForGenerationJob(jobId: string, status: 'succeeded' | 'failed') {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const job = await storage.getGenerationJob(jobId, DEV_AUTH_USER_ID);
    if (job?.status === status) return job;
    if (job?.status === 'failed' && status !== 'failed') {
      throw new Error(job.errorMessage || 'Generation job failed.');
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for generation job ${jobId} to become ${status}.`);
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
