import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ObjectInsertPanel } from './ObjectInsertPanel';
import type { StepState, UploadedImage } from '../types';

const image: UploadedImage = {
  id: 'img-1',
  name: 'scene.png',
  type: 'image/png',
  size: 100,
  dataUrl: 'data:image/png;base64,a',
  width: 1200,
  height: 800,
};

const objectImage: UploadedImage = {
  ...image,
  id: 'obj-1',
  name: 'chair.png',
};

const defaultProps = {
  onUpdateInputImage: () => undefined,
  onUpdateMaterialImage: () => undefined,
  onUpdateConfig: () => undefined,
  onGenerate: () => undefined,
};

describe('ObjectInsertPanel', () => {
  it('renders simple mode by default with only essential setup controls', () => {
    const html = renderToStaticMarkup(React.createElement(ObjectInsertPanel, {
      ...defaultProps,
      state: createState({ objectInsertUIMode: 'simple' }),
    }));

    expect(html).toContain('简单模式');
    expect(html).toContain('高级模式');
    expect(html).toContain('物体参考图');
    expect(html).not.toContain('元素配置');
    expect(html).not.toContain('候选策略');
  });

  it('renders advanced controls when advanced mode is selected', () => {
    const html = renderToStaticMarkup(React.createElement(ObjectInsertPanel, {
      ...defaultProps,
      state: createState({ objectInsertUIMode: 'advanced', batchCount: 2 }),
    }));

    expect(html).toContain('元素配置');
    expect(html).toContain('候选策略');
    expect(html).toContain('生成接触阴影');
    expect(html).toContain('严格贴合摆放');
  });
});

function createState(config: Partial<StepState['config']>): StepState {
  return {
    config: {
      prompt: '',
      lighting: '匹配原图',
      materialStrength: 0.8,
      batchCount: 1,
      objectInsertSurface: 'auto',
      objectFidelity: 'balanced',
      enforceContactShadow: true,
      enforceOcclusion: true,
      enforcePerspectiveScale: true,
      objectPlacement: { x: 120, y: 120, width: 240, height: 180, rotation: 0 },
      ...config,
    },
    inputImage: image,
    materialImage: objectImage,
    materialTextures: [],
    furnitureReferences: [],
    maskImage: null,
    useFullImageMask: false,
    outputImage: null,
    generationResults: [],
    selectedGenerationResultId: null,
    isGenerating: false,
    generationStatus: 'ready',
    generationError: null,
    generationWarnings: [],
    generationProvider: null,
    generationResultId: null,
    generationCreatedAt: null,
    generationJobId: null,
    generationJobStatus: null,
    generationJobDiagnostics: null,
    generationProgress: 0,
    generationLogs: [],
    viewMode: 'original',
  };
}
