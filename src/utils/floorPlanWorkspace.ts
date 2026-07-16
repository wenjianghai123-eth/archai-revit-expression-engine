export const floorPlanAssetStorageKey = 'archai:floor-plan:last-asset-id';

const ignoredRegionSetPrefix = 'archai:floor-plan:ignore-latest-region-set:';

export function suppressLatestFloorPlanRegionSet(assetId: string): void {
  if (!assetId) return;
  window.localStorage.setItem(`${ignoredRegionSetPrefix}${assetId}`, '1');
}

export function allowLatestFloorPlanRegionSet(assetId: string): void {
  if (!assetId) return;
  window.localStorage.removeItem(`${ignoredRegionSetPrefix}${assetId}`);
}

export function shouldRestoreLatestFloorPlanRegionSet(assetId: string): boolean {
  return Boolean(assetId) && window.localStorage.getItem(`${ignoredRegionSetPrefix}${assetId}`) !== '1';
}

export function clearFloorPlanWorkspaceCache(assetId?: string): void {
  window.localStorage.removeItem(floorPlanAssetStorageKey);
  if (assetId) allowLatestFloorPlanRegionSet(assetId);
}
