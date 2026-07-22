import express from 'express';
import request from 'supertest';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachAuthUser } from '../auth';
import { createErrorHandler } from '../http';
import { toImageDataUrl } from '../image/imageMetadata';
import { createImageRouter } from './image';

describe('POST /api/image/refine-mask', () => {
  const originalAuthMode = process.env.AUTH_MODE;

  beforeEach(() => {
    process.env.AUTH_MODE = 'dev';
  });

  afterEach(() => {
    if (originalAuthMode === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = originalAuthMode;
  });

  it('returns a reviewable smart mask without starting generation', async () => {
    const app = express();
    app.use(express.json({ limit: '5mb' }));
    app.use(attachAuthUser);
    app.use('/api/image', createImageRouter());
    app.use(createErrorHandler('5mb'));
    const image = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#eeeeee' } })
      .composite([{ input: Buffer.from('<svg width="40" height="30" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="30" fill="#54708a"/></svg>'), left: 20, top: 15 }])
      .png()
      .toBuffer();
    const mask = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#000000' } })
      .composite([{ input: Buffer.from('<svg width="8" height="8" xmlns="http://www.w3.org/2000/svg"><rect width="8" height="8" fill="#ffffff"/></svg>'), left: 36, top: 26 }])
      .png()
      .toBuffer();

    const response = await request(app)
      .post('/api/image/refine-mask')
      .send({
        image: toImageDataUrl(image, 'image/png'),
        roughMask: toImageDataUrl(mask, 'image/png'),
        maskMode: 'smart',
        targetObject: 'sofa',
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      data: {
        detectedObject: 'sofa',
        method: 'edge-aware-seeded-region-growing',
      },
    });
    expect(response.body.data.refinedMask).toMatch(/^data:image\/png;base64,/u);
    expect(response.body.data.confidence).toBeGreaterThan(0.5);
  });

  it('rejects requests without authentication', async () => {
    process.env.AUTH_MODE = 'disabled';
    const app = express();
    app.use(express.json());
    app.use(attachAuthUser);
    app.use('/api/image', createImageRouter());

    const response = await request(app)
      .post('/api/image/refine-mask')
      .send({ maskMode: 'smart', roughMask: 'invalid' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_REQUIRED');
  });
});
