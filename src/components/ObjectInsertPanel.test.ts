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
    expect(html).toContain('基础设置');
    expect(html).toContain('图层');
    expect(html).toContain('自动去背景');
    expect(html).toContain('对象素材库');
    expect(html).toContain('模式：元素植入');
    expect(html).toContain('元素类型：三维对象');
    expect(html).toContain('二维平面图形');
    expect(html).toContain('修改策略：仅新增，不改原图');
    expect(html).toContain('材质保护：已开启');
    expect(html).toContain('非目标区域：严格保持不变');
    expect(html).not.toContain('元素配置');
    expect(html).not.toContain('候选策略');
  });

  it('renders scene enrichment as an object insert workflow with real quantity controls', () => {
    const html = renderToStaticMarkup(React.createElement(ObjectInsertPanel, {
      ...defaultProps,
      state: createState({
        objectInsertUIMode: 'simple',
        objectInsertWorkflowMode: 'scene-enrichment',
        objectInsertSceneEnrichment: { plants: 'many', people: 'moderate', decorations: 'few' },
      }),
    }));

    expect(html).toContain('场景丰富');
    expect(html).toContain('绿植数量');
    expect(html).toContain('人物数量');
    expect(html).toContain('装饰数量');
    expect(html).toContain('不会转到质感提升');
    expect(html).not.toContain('物体参考图');
  });

  it('shows the planar graphic local fusion summary only for planar graphics', () => {
    const html = renderToStaticMarkup(React.createElement(ObjectInsertPanel, {
      ...defaultProps,
      state: createState({
        objectInsertUIMode: 'simple',
        insertElementKind: 'planar-graphic',
        objectType: 'logo',
        objectInsert: {
          insertElementKind: 'planar-graphic',
          objectType: 'logo',
          objectItems: [{
            id: 'logo-1',
            objectType: 'logo',
            insertElementKind: 'planar-graphic',
            referenceAssetIds: [],
            placement: {
              x: 96,
              y: 144,
              width: 240,
              height: 80,
              rotation: -4,
              normalizedBox: { x: 0.08, y: 0.18, width: 0.2, height: 0.1 },
              sizeLocked: true,
            },
          }],
        },
      }),
    }));

    expect(html).toContain('元素类型：二维平面图形');
    expect(html).toContain('贴附方式：平面标牌');
    expect(html).toContain('位置：已锁定');
    expect(html).toContain('尺寸：已锁定');
    expect(html).toContain('图形内容：严格保留');
    expect(html).toContain('原图材质：严格保护');
    expect(html).toContain('融合方式：局部贴附融合');
  });

  it('renders advanced controls when advanced mode is selected', () => {
    const html = renderToStaticMarkup(React.createElement(ObjectInsertPanel, {
      ...defaultProps,
      state: createState({ objectInsertUIMode: 'advanced', batchCount: 2 }),
    }));

    expect(html).toContain('元素配置');
    expect(html).toContain('元素类型');
    expect(html).toContain('二维平面图形');
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
