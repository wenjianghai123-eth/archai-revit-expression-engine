import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiOk, createErrorHandler } from './http';
import { SupabaseStorageError } from './storage/supabaseStorage';

describe('createErrorHandler', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  it('returns sanitized error code and message outside production', async () => {
    process.env.NODE_ENV = 'test';
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = express();
    app.get('/boom', (_req: Request, _res: Response, next: NextFunction) => {
      next(new SupabaseStorageError('SUPABASE_SCHEMA_MISMATCH', 'missing column output_asset_ids\nsecret'));
    });
    app.use(createErrorHandler('1mb'));

    const response = await request(app)
      .get('/boom')
      .set('X-Request-Id', 'req-123');

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      ok: false,
      error: {
        code: 'SUPABASE_SCHEMA_MISMATCH',
        message: 'missing column output_asset_ids secret',
      },
    });
    expect(console.error).toHaveBeenCalledWith('API error', expect.objectContaining({
      requestId: 'req-123',
      method: 'GET',
      path: '/boom',
      errorName: 'SupabaseStorageError',
      errorMessage: 'missing column output_asset_ids secret',
      errorCode: 'SUPABASE_SCHEMA_MISMATCH',
      errorStack: expect.any(Array),
    }));
  });

  it('keeps production 500 messages generic while preserving diagnostic code', async () => {
    process.env.NODE_ENV = 'production';
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = express();
    app.get('/boom', (_req: Request, _res: Response, next: NextFunction) => {
      next(new SupabaseStorageError('CREDIT_RPC_MISSING', 'adjust_credits_atomic failed'));
    });
    app.get('/ok', (_req: Request, res: Response) => res.json(apiOk({ ok: true })));
    app.use(createErrorHandler('1mb'));

    const response = await request(app).get('/boom');

    expect(response.status).toBe(500);
    expect(response.body.error).toEqual({
      code: 'CREDIT_RPC_MISSING',
      message: 'Server failed to process the request. Please try again later.',
    });
  });

  it('returns a public 503 response when the floor plan schema is not ready', async () => {
    process.env.NODE_ENV = 'production';
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = express();
    app.get('/floor-plan', (_req: Request, _res: Response, next: NextFunction) => {
      next(new SupabaseStorageError('FLOOR_PLAN_SCHEMA_NOT_READY', 'database details'));
    });
    app.use(createErrorHandler('1mb'));

    const response = await request(app).get('/floor-plan');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      ok: false,
      error: {
        code: 'FLOOR_PLAN_SCHEMA_NOT_READY',
        message: '平面图区域数据库尚未初始化，请管理员执行 Supabase migration 后重试。',
      },
    });
  });
});
