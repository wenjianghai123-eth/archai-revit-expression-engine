import { describe, expect, it } from 'vitest';
import { getModelLoadDiagnostics, getModelLoaderDefinition, getModelPreviewError, getStableModelLoadIdentity, resolveModelPreviewUrl, shouldReloadModel } from './ModelViewer';
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

  it('prefers optimized and preview urls over the original model url', () => {
    const optimized = createAsset({
      fileType: 'stl',
      modelUrl: '/uploads/original.stl',
      optimizedUrl: '/uploads/models/preview/model-1.glb',
    });
    const preview = createAsset({
      fileType: 'obj',
      modelUrl: '/uploads/original.obj',
      previewUrl: '/uploads/models/preview/model-1.glb',
    });

    expect(resolveModelPreviewUrl(optimized)).toBe('/uploads/models/preview/model-1.glb');
    expect(getStableModelLoadIdentity(optimized)).toMatchObject({
      fileType: 'glb',
      modelUrl: '/uploads/models/preview/model-1.glb',
      loaderKind: 'GLTFLoader',
    });
    expect(resolveModelPreviewUrl(preview)).toBe('/uploads/models/preview/model-1.glb');
    expect(getStableModelLoadIdentity(preview).fileType).toBe('glb');
  });

  it('falls back to optimization metadata preview urls', () => {
    const asset = createAsset({
      fileType: 'dae',
      modelUrl: '/uploads/original.dae',
      metadata: {
        originalUrl: '/uploads/original.dae',
        previewUrl: '/uploads/models/preview/model-1.glb',
        format: 'dae',
        originalFileSize: 40 * 1024 * 1024,
        optimizationStatus: 'succeeded',
      },
    });

    expect(resolveModelPreviewUrl(asset)).toBe('/uploads/models/preview/model-1.glb');
    expect(getStableModelLoadIdentity(asset).loaderKind).toBe('GLTFLoader');
  });

  it('reports missing model urls and unsupported formats before mounting the canvas', () => {
    expect(getModelPreviewError(createAsset({ modelUrl: undefined }))).toBe('模型地址不可访问');
    expect(getModelPreviewError(createAsset({ fileType: 'unknown', modelUrl: '/uploads/test.fbx' }))).toBe('当前格式暂不支持');
    expect(getModelPreviewError(createAsset())).toBeNull();
  });

  it('returns actionable load diagnostics without claiming FBX or SKP support', () => {
    const diagnostics = getModelLoadDiagnostics(createAsset({
      fileType: 'gltf',
      conversionStatus: 'failed',
      conversionError: 'Missing textures',
      optimizationStatus: 'failed',
      optimizationError: 'Blender unavailable',
    }), 'HTTP 403 while loading model');

    expect(diagnostics.join('\n')).toContain('HTTP 403');
    expect(diagnostics.join('\n')).toContain('格式转换失败');
    expect(diagnostics.join('\n')).toContain('轻量化失败');
    expect(diagnostics.join('\n')).toContain('单文件 GLB');
    expect(diagnostics.join('\n')).toContain('不支持原生 FBX 或 SKP');
  });
});
