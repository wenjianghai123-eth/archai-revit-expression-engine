import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { app as ExpressApp } from './index';
import type * as Storage from './storage';

type App = typeof ExpressApp;
type StorageModule = typeof Storage;

let app: App;
let storage: StorageModule;
let validateAuthEnvironment: () => void;
let tempRoot: string;

beforeAll(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'archai-admin-users-'));

  process.env.AUTH_MODE = 'dev';
  process.env.DATA_BACKEND = 'json';
  process.env.FILE_STORAGE = 'local';
  process.env.GENERATION_PROVIDER = 'mock';
  process.env.AI_PROVIDER = 'mock';
  process.env.ARCHAI_DISABLE_GENERATION_WORKER = 'true';
  process.env.GENERATION_JOB_RATE_LIMIT_PER_MINUTE = '1000';
  process.env.DATA_DIR = path.join(tempRoot, 'data');
  process.env.UPLOADS_DIR = path.join(tempRoot, 'uploads');

  [{ app, validateAuthEnvironment }, storage] = await Promise.all([
    import('./index'),
    import('./storage'),
  ]);
});

afterAll(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe('admin user management', () => {
  it('returns 401 instead of route-not-found for unauthenticated admin user creation', async () => {
    const oldAuthMode = process.env.AUTH_MODE;
    process.env.AUTH_MODE = 'supabase';

    const response = await request(app)
      .post('/api/admin/users')
      .send({});

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_REQUIRED');

    process.env.AUTH_MODE = oldAuthMode;
  });

  it('returns 403 when a member accesses admin users', async () => {
    const response = await request(app)
      .get('/api/admin/users')
      .set('x-dev-user-role', 'member');

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ADMIN_FORBIDDEN');
  });

  it('allows an admin to access dashboard and create users without returning passwords', async () => {
    const dashboardResponse = await request(app).get('/api/admin/dashboard');
    expect(dashboardResponse.status).toBe(200);

    const createResponse = await request(app)
      .post('/api/admin/users')
      .send({
        name: 'User B',
        email: 'user-b@example.com',
        password: 'strong-password-1',
        role: 'member',
        initialCredits: 123,
      });

    expect(createResponse.status).toBe(201);
    expect(JSON.stringify(createResponse.body)).not.toContain('strong-password-1');
    expect(createResponse.body.data.user).toMatchObject({
      email: 'user-b@example.com',
      role: 'member',
      status: 'active',
    });

    const profile = await storage.getUserProfile(createResponse.body.data.user.id);
    const balance = await storage.getCreditBalance(createResponse.body.data.user.id);
    expect(profile).toMatchObject({ email: 'user-b@example.com' });
    expect(balance.balance).toBe(123);
  });

  it('does not expose reset passwords in responses', async () => {
    const created = await request(app)
      .post('/api/admin/users')
      .send({
        name: 'Reset Target',
        email: 'reset-target@example.com',
        password: 'strong-password-1',
        role: 'member',
        initialCredits: 0,
      });

    const response = await request(app)
      .post(`/api/admin/users/${encodeURIComponent(created.body.data.user.id)}/reset-password`)
      .send({ password: 'new-strong-password' });

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain('new-strong-password');
  });

  it('blocks disabled users from business APIs', async () => {
    const response = await request(app)
      .get('/api/projects')
      .set('x-dev-user-status', 'disabled');

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('AUTH_USER_DISABLED');
  });

  it('keeps member project data isolated by user id', async () => {
    const userAProject = await storage.createProject({ userId: 'user-a', name: 'User A Project' });
    const userBProject = await storage.createProject({ userId: 'user-b', name: 'User B Project' });

    const listResponse = await request(app)
      .get('/api/projects')
      .set('x-dev-user-role', 'member')
      .set('x-dev-user-id', 'user-b');
    const getOtherResponse = await request(app)
      .get(`/api/projects/${encodeURIComponent(userAProject.id)}`)
      .set('x-dev-user-role', 'member')
      .set('x-dev-user-id', 'user-b');

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data.projects.map((project: { id: string }) => project.id)).toEqual([userBProject.id]);
    expect(getOtherResponse.status).toBe(404);
  });

  it('keeps credits isolated by user id', async () => {
    await storage.adjustCredits({ userId: 'user-a', type: 'grant', amount: 20, reason: 'test', referenceType: 'system', referenceId: 'a' });
    await storage.adjustCredits({ userId: 'user-b', type: 'grant', amount: 5, reason: 'test', referenceType: 'system', referenceId: 'b' });

    const response = await request(app)
      .get('/api/billing/credits')
      .set('x-dev-user-role', 'member')
      .set('x-dev-user-id', 'user-b');

    expect(response.status).toBe(200);
    expect(response.body.data.balance).toMatchObject({ userId: 'user-b', balance: 5 });
  });

  it('rejects AUTH_MODE=dev in production', () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldAuthMode = process.env.AUTH_MODE;
    process.env.NODE_ENV = 'production';
    process.env.AUTH_MODE = 'dev';

    expect(() => validateAuthEnvironment()).toThrow('AUTH_MODE=dev is not allowed');

    process.env.NODE_ENV = oldNodeEnv;
    process.env.AUTH_MODE = oldAuthMode;
  });
});
