import { describe, expect, it } from 'vitest';
import { getModelLoaderDefinition } from './ModelViewer';
import type { AssetModel } from '../types';

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
