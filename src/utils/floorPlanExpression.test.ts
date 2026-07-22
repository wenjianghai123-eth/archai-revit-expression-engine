import { describe, expect, it } from 'vitest';
import type { FloorPlanRegion, GenerationConfig, SaveFloorPlanRegionMaterialInput } from '../types';
import { buildFloorPlanExpressionModePatch, findAdjacentFloorPlanRegionIds, isFloorPlanMaterialComplete, resolveFloorPlanExpressionMode } from './floorPlanExpression';

describe('floor plan expression compatibility', () => {
  it('resolves legacy config and maps all four product modes to existing fields', () => {
    expect(resolveFloorPlanExpressionMode({ floorplanRenderMode: 'flat-color' } as GenerationConfig)).toBe('precise-material');
    expect(resolveFloorPlanExpressionMode({ planColorizeBatchEnabled: true } as GenerationConfig)).toBe('multi-option');
    expect(buildFloorPlanExpressionModePatch('three-dimensional', {} as GenerationConfig)).toMatchObject({ floorplanRenderMode: 'semi-3d', batchCount: 1 });
    expect(buildFloorPlanExpressionModePatch('analysis', {} as GenerationConfig)).toMatchObject({ template: 'zoning-color', preserveLinework: true });
  });

  it('reports material completion explicitly', () => {
    const base: SaveFloorPlanRegionMaterialInput = { regionId: 'a', materialAssetId: null, materialName: '', scale: 1, rotation: 0, direction: 'auto', jointMode: 'subtle', fallbackMode: 'ai-auto' };
    expect(isFloorPlanMaterialComplete(base)).toBe(false);
    expect(isFloorPlanMaterialComplete({ ...base, materialName: 'AI 自动判断' })).toBe(true);
    expect(isFloorPlanMaterialComplete({ ...base, fallbackMode: 'default' })).toBe(true);
    expect(isFloorPlanMaterialComplete({ ...base, fallbackMode: 'reference', materialAssetId: 'asset-1' })).toBe(true);
  });

  it('finds geometrically adjacent regions without relying on display numbers', () => {
    const region = (id: string, polygon: FloorPlanRegion['polygon']): FloorPlanRegion => ({ id, number: 1, polygon, areaRatio: 0.1, suggestedName: null, name: '', confidence: 1, maskAssetId: null, maskUrl: null });
    const regions = [
      region('left', [[0, 0], [0.4, 0], [0.4, 0.4], [0, 0.4]]),
      region('right', [[0.4, 0], [0.8, 0], [0.8, 0.4], [0.4, 0.4]]),
      region('far', [[0.8, 0.8], [1, 0.8], [1, 1], [0.8, 1]]),
    ];
    expect(findAdjacentFloorPlanRegionIds(regions, 'left')).toEqual(['right']);
  });
});
