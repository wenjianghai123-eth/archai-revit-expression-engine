import { describe, expect, it } from 'vitest';
import { getModelLoaderDefinition, getModelPreviewError, getStableModelLoadIdentity, shouldReloadModel } from './ModelViewer';
import type { AssetModel } from '../types';

function createAsset(overrides: Partial<AssetModel> = {}): AssetModel {
  return {
    id: 'model-1',
    name: 'Test Model',
    fileName: 'test.glb',
    fileType: 'glb',
    modelUrl: '/uploads/test.glb',
    thumbnail: '',
    size: '1MB',
    date: '2026-05-19',
    source: 'uploaded',
    previewable: true,
    ...overrides,
  };
}

describe('model loader registry', () => {
  it.each([
    ['glb', 'GLTFLoader'],
    ['gltf', 'GLTFLoader'],
    ['obj', 'OBJLoader'],
    ['dae', 'ColladaLoader'],
    ['stl', 'STLLoader'],
  ] as const)('selects %s files with %s', (fileType, loaderKind) => {
    expect(getModelLoaderDefinition(fileType)?.kind).toBe(loaderKind);
  });

  it.each(['fbx', 'skp', 'unknown'] as const)('does not support %s files', (fileType) => {
    expect(getModelLoaderDefinition(fileType as AssetModel['fileType'])).toBeNull();
  });
});

describe('stable model preview identity', () => {
  it('does not request a reload when ordinary asset state changes but url and file type stay the same', () => {
    const previous = getStableModelLoadIdentity(createAsset({ id: 'model-1', name: 'Before' }));
    const next = getStableModelLoadIdentity(createAsset({ id: 'model-1', name: 'After', status: 'optimizing' }));

    expect(shouldReloadModel(previous, next)).toBe(false);
  });

  it('does not include xray, edges, clipping, or snapshot state in the load identity', () => {
    const identity = getStableModelLoadIdentity(createAsset());

    expect(identity).toEqual({
      assetId: 'model-1',
      fileType: 'glb',
      modelUrl: '/uploads/test.glb',
      loaderKind: 'GLTFLoader',
    });
    expect(Object.keys(identity)).not.toContain('xrayEnabled');
    expect(Object.keys(identity)).not.toContain('edgesEnabled');
    expect(Object.keys(identity)).not.toContain('clippingEnabled');
    expect(Object.keys(identity)).not.toContain('snapshotUrl');
  });

  it('requests a reload only when model url or file type changes', () => {
    const glb = getStableModelLoadIdentity(createAsset());
    const sameUrlDifferentId = getStableModelLoadIdentity(createAsset({ id: 'model-2' }));
    const differentUrl = getStableModelLoadIdentity(createAsset({ modelUrl: '/uploads/other.glb' }));
    const differentType = getStableModelLoadIdentity(createAsset({ fileType: 'obj', modelUrl: '/uploads/test.obj' }));

    expect(shouldReloadModel(glb, sameUrlDifferentId)).toBe(false);
    expect(shouldReloadModel(glb, differentUrl)).toBe(true);
    expect(shouldReloadModel(glb, differentType)).toBe(true);
  });

  it('reports missing model urls and unsupported formats before mounting the canvas', () => {
    expect(getModelPreviewError(createAsset({ modelUrl: undefined }))).toBe('模型地址不可访问');
    expect(getModelPreviewError(createAsset({ fileType: 'unknown', modelUrl: '/uploads/test.fbx' }))).toBe('当前格式暂不支持');
    expect(getModelPreviewError(createAsset())).toBeNull();
  });
});
