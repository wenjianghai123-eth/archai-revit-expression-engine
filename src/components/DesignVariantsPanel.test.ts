import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DesignVariantsPanel } from './DesignVariantsPanel';
import type { StepState } from '../types';

describe('DesignVariantsPanel', () => {
  it('renders the design variants controls and 4-slot matrix by default', () => {
    const html = renderToStaticMarkup(React.createElement(DesignVariantsPanel, {
      state: createState({ batchCount: 4 }),
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
    }));

    expect(html).toContain('方案变体');
    expect(html).toContain('生成数量');
    expect(html).toContain('多风格方案矩阵');
    expect(html).toContain('方案 A');
    expect(html).toContain('方案 D');
  });

  it('renders a 2-result variant matrix with selected and favorite actions', () => {
    const html = renderToStaticMarkup(React.createElement(DesignVariantsPanel, {
      state: createState({ batchCount: 2 }),
      resultOptions: [
        { id: 'a', imageUrl: 'data:image/png;base64,a', isSelected: true, isFavorite: false, variantLabel: '方案 A', variantStyleLabel: '现代极简' },
        { id: 'b', imageUrl: 'data:image/png;base64,b', isSelected: false, isFavorite: true, variantLabel: '方案 B', variantStyleLabel: '自然木质' },
      ],
      selectedResultId: 'a',
      previewImage: 'data:image/png;base64,a',
      uploadError: null,
      onUploadInput: () => undefined,
      onUpdateInputImage: () => undefined,
      onUpdateConfig: () => undefined,
      onGenerate: () => undefined,
      onSelectGenerationResult: () => undefined,
      onToggleGenerationFavorite: () => undefined,
    }));

    expect(html).toContain('方案 A');
    expect(html).toContain('方案 B');
    expect(html).toContain('设为主方案');
    expect(html).toContain('已设为主方案');
    expect(html).toContain('收藏');
  });
});

function createState(config: Partial<StepState['config']>): StepState {
  return {
    config: {
      prompt: '',
      lighting: '匹配原图',
      materialStrength: 0.8,
      variantStrategy: 'style-matrix',
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
