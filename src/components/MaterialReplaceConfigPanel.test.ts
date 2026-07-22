import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MaterialReplaceConfigPanel } from './MaterialReplaceConfigPanel';
import { DEFAULT_CONFIGS } from '../constants';
import { GenerationStep, type GenerationConfig } from '../types';

describe('MaterialReplaceConfigPanel', () => {
  it('defaults new material replacement workspaces to smart painting', () => {
    expect(DEFAULT_CONFIGS[GenerationStep.MaterialReplace]).toMatchObject({
      editMode: 'mask',
      maskSelectionMode: 'smart',
      smartMaskConfirmed: false,
      batchCount: 1,
      materialCandidateCount: 1,
      enablePhysicalMaterialLayout: false,
    });
  });

  it('renders smart material replacement controls', () => {
    const config: GenerationConfig = {
      prompt: '',
      lighting: '匹配原图',
      materialStrength: 0.8,
      editMode: 'smart-type',
      targetObjectType: 'floor',
      targetMaterial: 'dark-wood',
      strength: 'balanced',
      materialPatternScale: 'medium',
      materialDirection: 'auto',
      materialFinish: 'matte',
      materialReplaceScope: 'material-only',
      preserveLighting: true,
      preserveGeometry: true,
    };

    const html = renderToStaticMarkup(React.createElement(MaterialReplaceConfigPanel, {
      config,
      materialReferenceCount: 1,
      onUpdateConfig: () => undefined,
    }));

    expect(html).toContain('智能材质替换');
    expect(html).toContain('智能涂抹（默认）');
    expect(html).toContain('粗略标记目标区域，AI 自动识别完整对象');
    expect(html).toContain('精致涂抹');
    expect(html).toContain('手动精确控制修改范围');
    expect(html).toContain('语义对象点击（高级）');
    expect(html).toContain('目标区域');
    expect(html).toContain('目标材质');
    expect(html).toContain('纹理尺度');
    expect(html).toContain('铺贴方向');
    expect(html).toContain('表面光泽');
    expect(html).toContain('替换范围');
    expect(html).toContain('人字拼');
    expect(html).toContain('材质 + 软装微调');
    expect(html).toContain('上传对应贴图');
  });

  it('keeps physical size and seams optional and material-only', () => {
    const baseConfig: GenerationConfig = {
      ...DEFAULT_CONFIGS[GenerationStep.MaterialReplace],
      editTarget: 'material',
    };
    const disabledHtml = renderToStaticMarkup(React.createElement(MaterialReplaceConfigPanel, {
      config: baseConfig,
      onUpdateConfig: () => undefined,
    }));
    expect(disabledHtml).toContain('启用真实尺寸与拼缝控制');
    expect(disabledHtml).not.toContain('材质真实尺寸（mm）');
    expect(disabledHtml).toContain('1 张');

    const enabledHtml = renderToStaticMarkup(React.createElement(MaterialReplaceConfigPanel, {
      config: { ...baseConfig, enablePhysicalMaterialLayout: true, materialRealSizeMm: 600, materialJointWidthMm: 0 },
      onUpdateConfig: () => undefined,
    }));
    expect(enabledHtml).toContain('材质真实尺寸（mm）');
    expect(enabledHtml).toContain('拼缝宽度（mm）');

    const furnishingHtml = renderToStaticMarkup(React.createElement(MaterialReplaceConfigPanel, {
      config: { ...baseConfig, editTarget: 'furniture', enablePhysicalMaterialLayout: true },
      onUpdateConfig: () => undefined,
    }));
    expect(furnishingHtml).not.toContain('启用真实尺寸与拼缝控制');
  });
});
