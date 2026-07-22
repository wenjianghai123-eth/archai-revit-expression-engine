import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DesignVariantsPanel } from './DesignVariantsPanel';
import type { StepState } from '../types';

const defaultProps = {
  resultOptions: [],
  selectedResultId: null,
  previewImage: null,
  uploadError: null,
  onUploadInput: () => undefined,
  onUpdateInputImage: () => undefined,
  onUpdateConfig: () => undefined,
  onGenerate: () => undefined,
  onSelectGenerationResult: () => undefined,
  onToggleGenerationFavorite: () => undefined,
  onRenameGenerationResult: () => undefined,
};

describe('DesignVariantsPanel', () => {
  it('defaults a new or legacy-invalid workspace to one result', () => {
    const html = renderToStaticMarkup(React.createElement(DesignVariantsPanel, {
      ...defaultProps,
      state: createState({}),
    }));

    expect(html).toContain('1 张');
    expect(html).toContain('方案数量');
    expect(html).toContain('预计算力点');
    expect(html).toContain('方案 A');
    expect(html).not.toContain('方案 B');
  });

  it('renders the design variants controls and 4-slot matrix by default', () => {
    const html = renderToStaticMarkup(React.createElement(DesignVariantsPanel, {
      ...defaultProps,
      state: createState({ batchCount: 4 }),
    }));

    expect(html).toContain('方案变体');
    expect(html).toContain('生成数量');
    expect(html).toContain('多风格方案矩阵');
    expect(html).toContain('方案 A');
    expect(html).toContain('方案 D');
    expect(html).toContain('风格包');
    expect(html).toContain('8 张');
    expect(html).toContain('设计变量矩阵');
    expect(html).toContain('材质体系');
    expect(html).toContain('家具布局');
    expect(html).toContain('多样性强度');
  });

  it('renders a 2-result variant matrix with selected and favorite actions', () => {
    const html = renderToStaticMarkup(React.createElement(DesignVariantsPanel, {
      ...defaultProps,
      state: createState({ batchCount: 2 }),
      resultOptions: [
        { id: 'a', imageUrl: 'data:image/png;base64,a', isSelected: true, isFavorite: false, variantLabel: '方案 A', variantStyleLabel: '现代极简' },
        { id: 'b', imageUrl: 'data:image/png;base64,b', isSelected: false, isFavorite: true, variantLabel: '方案 B', variantStyleLabel: '自然木质' },
      ],
      selectedResultId: 'a',
      previewImage: 'data:image/png;base64,a',
    }));

    expect(html).toContain('方案 A');
    expect(html).toContain('方案 B');
    expect(html).toContain('设为主方案');
    expect(html).toContain('已设为主方案');
    expect(html).toContain('收藏');
    expect(html).toContain('两方案对比');
    expect(html).toContain('查看原图');
    expect(html).toContain('查看结果图');
    expect(html).toContain('保存文件');
    expect(html).toContain('保存全部');
    expect(html).toContain('删除');
  });

  it('keeps configuration, canvas and task actions mounted in the three-column workspace', () => {
    const html = renderToStaticMarkup(React.createElement(DesignVariantsPanel, {
      ...defaultProps,
      state: createState({ batchCount: 4 }),
      canGenerate: false,
      disabledReason: '请先上传原图',
    }));

    expect(html).toContain('variant-workspace');
    expect(html).toContain('variant-left-panel');
    expect(html).toContain('variant-center-panel');
    expect(html).toContain('variant-right-panel');
    expect(html).toContain('生成任务');
    expect(html).toContain('请先上传原图');
    expect(html).toContain('生成方案组');
  });

  it('renders an 8-slot matrix and export actions', () => {
    const html = renderToStaticMarkup(React.createElement(DesignVariantsPanel, {
      ...defaultProps,
      state: createState({ batchCount: 8 }),
    }));

    expect(html).toContain('方案 H');
    expect(html).toContain('导出对比页');
    expect(html).toContain('一键生成汇报页');
  });
  it('renders variant description metadata and single retry action', () => {
    const html = renderToStaticMarkup(React.createElement(DesignVariantsPanel, {
      ...defaultProps,
      state: createState({
        batchCount: 4,
        variantNames: ['方案 A', '方案 B', '方案 C', '方案 D'],
        variantStyles: ['modern-minimal', 'cream-style', 'light-luxury', 'natural-wood'],
      }),
      resultOptions: [
        {
          id: 'c',
          imageUrl: 'data:image/png;base64,c',
          isSelected: true,
          isFavorite: false,
          variantIndex: 2,
          variantName: '方案 C',
          variantStyleLabel: '轻奢',
          designDirection: '方案 C / light-luxury',
          changeScopeLabel: '整体方案',
          lockedItemsLabel: '结构、视角、门窗',
          strategyNote: '强化展示墙',
          changedVariables: ['material-system', 'lighting-atmosphere'],
          lockedVariables: ['furniture-layout'],
          differenceSummary: '材质改为浅色石材，灯光改为暖光。',
          reportNarrative: '方案 C 通过材质和灯光形成更精致的汇报方向。',
          parentResultId: 'parent-result-1234',
        },
      ],
      selectedResultId: 'c',
      previewImage: 'data:image/png;base64,c',
      onRetryVariant: () => undefined,
    }));

    expect(html).toContain('方案说明');
    expect(html).toContain('强化展示墙');
    expect(html).toContain('重试此方案');
    expect(html).toContain('整体方案');
    expect(html).toContain('改变变量');
    expect(html).toContain('与原图差异');
    expect(html).toContain('汇报说明');
    expect(html).toContain('源自结果');
  });
});

function createState(config: Partial<StepState['config']>): StepState {
  return {
    config: {
      prompt: '',
      lighting: '匹配原图',
      materialStrength: 0.8,
      variantStrategy: 'style-matrix',
      stylePackId: 'interior-common',
      variantStyles: [],
      preserveStructure: true,
      preserveCamera: true,
      strength: 'balanced',
      ...config,
    },
    inputImage: null,
    materialImage: null,
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
