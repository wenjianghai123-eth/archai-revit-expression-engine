import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FloorPlanRegionSet, UploadedImage } from '../types';
import { suppressLatestFloorPlanRegionSet } from '../utils/floorPlanWorkspace';
import { FloorPlanRegionPanel } from './FloorPlanRegionPanel';

const api = vi.hoisted(() => ({
  confirmFloorPlanRegions: vi.fn(),
  createGenerationJob: vi.fn(),
  generateFloorPlanMaterialPreview: vi.fn(),
  getFloorPlanRegionMaterials: vi.fn().mockResolvedValue([]),
  getGenerationJob: vi.fn(),
  getImageAsset: vi.fn(),
  getLatestFloorPlanSegmentation: vi.fn(),
  restoreFloorPlanAutoRegions: vi.fn(),
  saveFloorPlanRegionMaterials: vi.fn(),
  segmentFloorPlan: vi.fn(),
  updateFloorPlanRegions: vi.fn(),
  uploadImageAsset: vi.fn(),
}));

vi.mock('../lib/api', () => api);

const image: UploadedImage = {
  id: 'asset-1',
  assetId: 'asset-1',
  name: 'plan.png',
  type: 'image/png',
  size: 100,
  dataUrl: 'https://example.com/plan.png',
  publicUrl: 'https://example.com/plan.png',
  uploadStatus: 'uploaded',
};

const regionSet: FloorPlanRegionSet = {
  id: 'set-1',
  userId: 'user-1',
  sourceAssetId: 'asset-1',
  width: 100,
  height: 100,
  regions: [{ id: 'region-1', number: 1, polygon: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9]], areaRatio: 0.3, suggestedName: null, name: '客厅', confidence: 0.9, maskAssetId: null, maskUrl: null }],
  autoRegions: [],
  overlayAssetId: null,
  overlayUrl: null,
  status: 'recognized',
  versionNumber: 1,
  baseRegionSetId: null,
  lockedAt: null,
  confirmedAt: null,
  createdAt: '2026-07-14T00:00:00.000Z',
  updatedAt: '2026-07-14T00:00:00.000Z',
};

describe('FloorPlanRegionPanel reset lifecycle', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    api.getLatestFloorPlanSegmentation.mockResolvedValue(null);
  });

  it('does not restore the latest database region set after a region reset', async () => {
    suppressLatestFloorPlanRegionSet('asset-1');
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(<FloorPlanRegionPanel image={image} onUpload={() => undefined} onResetRegionsAndMaterials={() => undefined} onResetAll={() => undefined} />);
    });

    expect(api.getLatestFloorPlanSegmentation).not.toHaveBeenCalled();
    expect(container.textContent).toContain('重置区域与材质');
    expect(container.textContent).toContain('全部重置');
    act(() => root.unmount());
  });

  it('ignores a segmentation response that arrives after the workspace was reset', async () => {
    let resolveSegmentation: (value: FloorPlanRegionSet) => void = () => undefined;
    api.segmentFloorPlan.mockReturnValue(new Promise<FloorPlanRegionSet>(resolve => {
      resolveSegmentation = resolve;
    }));
    const onDerivedStateChange = vi.fn();
    const container = document.createElement('div');
    const root = createRoot(container);

    function Harness() {
      const [revision, setRevision] = useState(0);
      return <FloorPlanRegionPanel
        key={revision}
        image={image}
        onUpload={() => undefined}
        onResetRegionsAndMaterials={() => {
          suppressLatestFloorPlanRegionSet('asset-1');
          setRevision(current => current + 1);
        }}
        onResetAll={() => undefined}
        onDerivedStateChange={onDerivedStateChange}
      />;
    }

    await act(async () => root.render(<Harness />));
    const buttons = Array.from(container.querySelectorAll('button'));
    const recognize = buttons.find(button => button.textContent?.includes('识别地面区域'));
    expect(recognize).toBeTruthy();
    await act(async () => recognize?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const reset = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('重置区域与材质'));
    act(() => reset?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await act(async () => resolveSegmentation(regionSet));

    expect(onDerivedStateChange).not.toHaveBeenCalledWith(true);
    expect(container.textContent).not.toContain('客厅');
    act(() => root.unmount());
  });
});
