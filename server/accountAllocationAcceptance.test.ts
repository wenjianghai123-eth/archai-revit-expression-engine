import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { app as ExpressApp } from './index';

type App = typeof ExpressApp;

let app: App;
let validateAuthEnvironment: () => void;
let tempRoot: string;

beforeAll(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'archai-account-allocation-'));

  process.env.AUTH_MODE = 'dev';
  process.env.DATA_BACKEND = 'json';
  process.env.FILE_STORAGE = 'local';
  process.env.GENERATION_PROVIDER = 'mock';
  process.env.AI_PROVIDER = 'mock';
  process.env.ARCHAI_DISABLE_GENERATION_WORKER = 'true';
  process.env.GENERATION_JOB_RATE_LIMIT_PER_MINUTE = '1000';
  process.env.DATA_DIR = path.join(tempRoot, 'data');
  process.env.UPLOADS_DIR = path.join(tempRoot, 'uploads');

  ({ app, validateAuthEnvironment } = await import('./index'));
});

afterAll(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe('account allocation acceptance', () => {
  it('returns 401 for unauthenticated business API access', async () => {
    const oldAuthMode = process.env.AUTH_MODE;
    process.env.AUTH_MODE = 'supabase';

    try {
      const response = await request(app).get('/api/projects');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'AUTH_REQUIRED' },
      });
    } finally {
      restoreEnv('AUTH_MODE', oldAuthMode);
    }
  });

  it('returns 403 when a member accesses admin APIs', async () => {
    const response = await request(app)
      .get('/api/admin/dashboard')
      .set('x-dev-user-role', 'member');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      ok: false,
      error: { code: 'ADMIN_FORBIDDEN' },
    });
  });

  it('allows an admin to create a member account', async () => {
    const response = await request(app)
      .post('/api/admin/users')
      .send({
        name: 'Acceptance Member',
        email: 'acceptance-member@example.com',
        password: 'strong-password-1',
        role: 'member',
        initialCredits: 25,
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      ok: true,
      data: {
        user: {
          email: 'acceptance-member@example.com',
          role: 'member',
          status: 'active',
        },
        balance: {
          balance: 25,
        },
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('strong-password-1');
  });

  it('returns 403 when a disabled user accesses business APIs', async () => {
    const response = await request(app)
      .get('/api/projects')
      .set('x-dev-user-status', 'disabled');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      ok: false,
      error: { code: 'AUTH_USER_DISABLED' },
    });
  });

  it.each([
    ['dev', 'AUTH_MODE=dev is not allowed'],
    ['unknown', 'AUTH_MODE must be dev or supabase'],
  ])('fails startup in production when AUTH_MODE=%s', (authMode, message) => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldAuthMode = process.env.AUTH_MODE;
    process.env.NODE_ENV = 'production';
    process.env.AUTH_MODE = authMode;

    try {
      expect(() => validateAuthEnvironment()).toThrow(message);
    } finally {
      restoreEnv('NODE_ENV', oldNodeEnv);
      restoreEnv('AUTH_MODE', oldAuthMode);
    }
  });

  it('keeps legacy generation endpoints closed in production', async () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldLegacyFlag = process.env.ENABLE_LEGACY_GENERATION_ENDPOINTS;
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_LEGACY_GENERATION_ENDPOINTS = 'true';

    try {
      const response = await request(app)
        .post('/api/generate/style-render')
        .send({
          inputImageDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
          prompt: 'render this',
          config: {},
        });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'LEGACY_GENERATION_ENDPOINT_DISABLED' },
      });
    } finally {
      restoreEnv('NODE_ENV', oldNodeEnv);
      restoreEnv('ENABLE_LEGACY_GENERATION_ENDPOINTS', oldLegacyFlag);
    }
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
