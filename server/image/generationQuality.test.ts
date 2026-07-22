import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { analyzeGenerationQuality } from './generationQuality';
import { toImageDataUrl } from './imageMetadata';

describe('generation quality checker', () => {
  it('keeps an unchanged structured image usable', async () => {
    const source = await createStructuredImage(160, 120);
    const report = await analyzeGenerationQuality({
      sourceImageDataUrl: source,
      resultImageDataUrl: source,
      expectedWidth: 160,
      expectedHeight: 120,
      preserveStructure: true,
    });

    expect(report.status).toBe('passed');
    expect(report.metrics.aspectRatioChangeRatio).toBe(0);
    expect(report.metrics.overallDifference).toBe(0);
    expect(report.issues.map(issue => issue.code)).not.toContain('STRUCTURE_EDGE_CHANGED');
  });

  it('reports a changed canvas ratio and an undersized output', async () => {
    const source = await createStructuredImage(200, 200);
    const result = await createStructuredImage(120, 60);
    const report = await analyzeGenerationQuality({
      sourceImageDataUrl: source,
      resultImageDataUrl: result,
      expectedWidth: 200,
      expectedHeight: 200,
      preserveStructure: true,
    });

    expect(report.status).toBe('failed');
    expect(report.issues.map(issue => issue.code)).toContain('ASPECT_RATIO_CHANGED');
    expect(report.issues.map(issue => issue.code)).toContain('OUTPUT_SIZE_TOO_SMALL');
  });

  it('measures changes outside a local edit mask', async () => {
    const source = await createSolidImage(128, 128, '#777777');
    const result = await sharp({
      create: { width: 128, height: 128, channels: 3, background: '#777777' },
    }).composite([{
      input: await sharp({ create: { width: 64, height: 128, channels: 3, background: '#ff0000' } }).png().toBuffer(),
      left: 0,
      top: 0,
    }]).png().toBuffer();
    const mask = await sharp({
      create: { width: 128, height: 128, channels: 3, background: '#000000' },
    }).composite([{
      input: await sharp({ create: { width: 64, height: 128, channels: 3, background: '#ffffff' } }).png().toBuffer(),
      left: 64,
      top: 0,
    }]).png().toBuffer();

    const report = await analyzeGenerationQuality({
      sourceImageDataUrl: source,
      resultImageDataUrl: toImageDataUrl(result, 'image/png'),
      maskImageDataUrl: toImageDataUrl(mask, 'image/png'),
    });

    expect(report.metrics.outsideMaskDifference).toBeGreaterThan(0.24);
    expect(report.issues.map(issue => issue.code)).toContain('MASK_OUTSIDE_CHANGED');
  });
});

async function createStructuredImage(width: number, height: number): Promise<string> {
  const base = await sharp({
    create: { width, height, channels: 3, background: '#777777' },
  }).composite([
    {
      input: await sharp({
        create: {
          width: Math.max(8, Math.round(width * 0.5)),
          height: Math.max(8, Math.round(height * 0.5)),
          channels: 3,
          background: '#dddddd',
        },
      }).png().toBuffer(),
      left: Math.round(width * 0.25),
      top: Math.round(height * 0.25),
    },
  ]).png().toBuffer();
  return toImageDataUrl(base, 'image/png');
}

async function createSolidImage(width: number, height: number, color: string): Promise<string> {
  const buffer = await sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
  return toImageDataUrl(buffer, 'image/png');
}
