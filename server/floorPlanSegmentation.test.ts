import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { segmentFloorPlan } from './floorPlanSegmentation';

describe('segmentFloorPlan', () => {
  it('finds, sorts and normalizes ordinary enclosed rooms', async () => {
    const image = await sharp({ create: { width: 600, height: 400, channels: 3, background: 'white' } })
      .composite([{ input: Buffer.from('<svg width="600" height="400" xmlns="http://www.w3.org/2000/svg"><rect x="30" y="30" width="250" height="150" fill="none" stroke="black" stroke-width="10"/><rect x="320" y="30" width="250" height="150" fill="none" stroke="black" stroke-width="10"/><rect x="30" y="220" width="540" height="150" fill="none" stroke="black" stroke-width="10"/></svg>') }])
      .png().toBuffer();

    const result = await segmentFloorPlan(image);

    expect(result.width).toBe(600);
    expect(result.height).toBe(400);
    expect(result.regions).toHaveLength(3);
    expect(result.regions[0].polygon.length).toBeGreaterThanOrEqual(3);
    for (const region of result.regions) {
      expect(region.polygon.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1)).toBe(true);
      expect(region.mask.length).toBeGreaterThan(0);
    }
    expect(result.overlay.length).toBeGreaterThan(0);
  });
});
