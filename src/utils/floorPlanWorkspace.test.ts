import { beforeEach, describe, expect, it } from 'vitest';
import {
  allowLatestFloorPlanRegionSet,
  clearFloorPlanWorkspaceCache,
  floorPlanAssetStorageKey,
  shouldRestoreLatestFloorPlanRegionSet,
  suppressLatestFloorPlanRegionSet,
} from './floorPlanWorkspace';

describe('floor plan workspace cache', () => {
  beforeEach(() => window.localStorage.clear());

  it('suppresses database restoration after resetting regions and materials', () => {
    expect(shouldRestoreLatestFloorPlanRegionSet('asset-1')).toBe(true);
    suppressLatestFloorPlanRegionSet('asset-1');
    expect(shouldRestoreLatestFloorPlanRegionSet('asset-1')).toBe(false);
    allowLatestFloorPlanRegionSet('asset-1');
    expect(shouldRestoreLatestFloorPlanRegionSet('asset-1')).toBe(true);
  });

  it('clears the source draft and suppression guard on a full reset', () => {
    window.localStorage.setItem(floorPlanAssetStorageKey, 'asset-1');
    suppressLatestFloorPlanRegionSet('asset-1');
    clearFloorPlanWorkspaceCache('asset-1');
    expect(window.localStorage.getItem(floorPlanAssetStorageKey)).toBeNull();
    expect(shouldRestoreLatestFloorPlanRegionSet('asset-1')).toBe(true);
  });
});
