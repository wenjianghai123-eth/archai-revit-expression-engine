import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { composeFloorPlanMaterialPreview } from './floorPlanMaterialPreview';
import type { FloorPlanRegion, SaveFloorPlanRegionMaterialInput } from './storage';

describe('composeFloorPlanMaterialPreview', () => {
  it('clips each material to its region and restores original linework', async () => {
    const width = 200;
    const height = 100;
    const sourceImage = await sharp({ create: { width, height, channels: 3, background: 'white' } })
      .composite([{ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect x="97" y="0" width="6" height="100" fill="black"/><text x="12" y="55" font-size="16" fill="black">R1</text></svg>') }])
      .png()
      .toBuffer();
    const red = await solidTexture('#ff0000');
    const blue = await solidTexture('#0000ff');
    const regions: FloorPlanRegion[] = [
      region('region-1', 1, [[0, 0], [0.48, 0], [0.48, 1], [0, 1]]),
      region('region-2', 2, [[0.52, 0], [1, 0], [1, 1], [0.52, 1]]),
    ];
    const assignments: SaveFloorPlanRegionMaterialInput[] = [
      assignment('region-1', 'red-asset'),
      { ...assignment('region-2', 'blue-asset'), direction: 'vertical', rotation: 15, scale: 0.8 },
    ];

    const result = await composeFloorPlanMaterialPreview({
      sourceImage,
      width,
      height,
      regions,
      assignments,
      materialImages: new Map([['red-asset', red], ['blue-asset', blue]]),
    });
    const raw = await sharp(result).ensureAlpha().raw().toBuffer();

    expect(pixel(raw, width, 30, 80)[0]).toBeGreaterThan(220);
    expect(pixel(raw, width, 30, 80)[2]).toBeLessThan(80);
    expect(pixel(raw, width, 170, 80)[2]).toBeGreaterThan(220);
    expect(pixel(raw, width, 170, 80)[0]).toBeLessThan(80);
    expect(pixel(raw, width, 100, 80).slice(0, 3).every(channel => channel < 20)).toBe(true);
  });

  it('keeps AI-auto regions unchanged', async () => {
    const sourceImage = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#f4f4f4' } }).png().toBuffer();
    const result = await composeFloorPlanMaterialPreview({
      sourceImage,
      width: 40,
      height: 40,
      regions: [region('region-1', 1, [[0, 0], [1, 0], [1, 1], [0, 1]])],
      assignments: [{ ...assignment('region-1', null), fallbackMode: 'ai-auto' }],
      materialImages: new Map(),
    });
    const raw = await sharp(result).ensureAlpha().raw().toBuffer();
    expect(pixel(raw, 40, 20, 20).slice(0, 3)).toEqual([244, 244, 244]);
  });
});

function region(id: string, number: number, polygon: [number, number][]): FloorPlanRegion {
  return { id, number, polygon, areaRatio: 0.48, suggestedName: null, name: '', confidence: 1, maskAssetId: null, maskUrl: null };
}

function assignment(regionId: string, materialAssetId: string | null): SaveFloorPlanRegionMaterialInput {
  return { regionId, materialAssetId, materialName: '', scale: 1, rotation: 0, direction: 'auto', jointMode: 'none', fallbackMode: 'reference' };
}

function solidTexture(color: string): Promise<Buffer> {
  return sharp({ create: { width: 24, height: 24, channels: 3, background: color } }).png().toBuffer();
}

function pixel(raw: Buffer, width: number, x: number, y: number): number[] {
  const offset = (y * width + x) * 4;
  return [...raw.subarray(offset, offset + 4)];
}
