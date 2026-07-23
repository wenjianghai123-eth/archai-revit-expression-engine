import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MaterialReplaceConfigPanel } from './MaterialReplaceConfigPanel';
import { DEFAULT_CONFIGS } from '../constants';
import { GenerationStep, type GenerationConfig } from '../types';

describe('MaterialReplaceConfigPanel', () => {
  it('defaults new material replacement workspaces to smart selection', () => {
    expect(DEFAULT_CONFIGS[GenerationStep.MaterialReplace]).toMatchObject({
      editMode: 'mask',
      selectionMode: 'smart-select',
      maskSelectionMode: 'smart',
      smartSelectionStatus: 'idle',
      smartSelectionConfirmed: false,
      smartMaskConfirmed: false,
      semanticAssistFromSelection: true,
      batchCount: 1,
      materialCandidateCount: 1,
      enablePhysicalMaterialLayout: false,
    });
  });

  it('renders only semantic-auto and smart-select mode controls', () => {
    const config: GenerationConfig = {
      prompt: '',
      lighting: '匹配原图',
      materialStrength: 0.8,
      editMode: 'mask',
      selectionMode: 'smart-select',
      maskSelectionMode: 'smart',
      maskWorkflowMode: 'smart',
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
    expect(html).toContain('自动同类替换');
    expect(html).toContain('智能选区');
    expect(html).toContain('在目标对象上点击或轻刷，系统将自动扩展并识别完整区域。');
    expect(html).not.toContain('精细涂抹');
    expect(html).not.toContain('精准涂抹');
    expect(html).not.toContain('手动精确绘制需要修改的区域。');
    expect(html).toContain('当前区域方式');
    expect(html).not.toContain('data-testid="semantic-auto-target-region"');
    expect(html).toContain('根据涂抹点识别所在物体 / 区域');
    expect(html).toContain('不需要选择“目标区域”');
    expect(html).toContain('目标材质');
    expect(html).toContain('纹理尺度');
    expect(html).toContain('铺贴方向');
    expect(html).toContain('表面光泽');
    expect(html).toContain('替换范围');
    expect(html).toContain('人字拼');
    expect(html).toContain('材质 + 软装微调');
    expect(html).toContain('上传对应贴图');
    expect(html).toContain('系统已默认内置建筑结构不变、空间结构不变、构图不变和非目标区域保持不变等约束。此处只需补充说明您希望替换成什么。');
  });

  it('shows target area only in semantic-auto mode', () => {
    const semanticHtml = renderToStaticMarkup(React.createElement(MaterialReplaceConfigPanel, {
      config: {
        ...DEFAULT_CONFIGS[GenerationStep.MaterialReplace],
        editMode: 'smart-type',
        selectionMode: 'semantic-auto',
        maskSelectionMode: undefined,
        maskWorkflowMode: 'none',
        replacementTarget: 'furniture',
        targetObjectType: 'table-chair',
      },
      onUpdateConfig: () => undefined,
    }));
    expect(semanticHtml).toContain('data-testid="semantic-auto-target-region"');
    expect(semanticHtml).toContain('目标区域');
    expect(semanticHtml).toContain('桌椅');
    expect(semanticHtml).not.toContain('根据涂抹点识别所在物体 / 区域');

    const smartHtml = renderToStaticMarkup(React.createElement(MaterialReplaceConfigPanel, {
      config: {
        ...DEFAULT_CONFIGS[GenerationStep.MaterialReplace],
        editMode: 'mask',
        selectionMode: 'smart-select',
        maskSelectionMode: 'smart',
        maskWorkflowMode: 'smart',
      },
      onUpdateConfig: () => undefined,
    }));
    expect(smartHtml).not.toContain('data-testid="semantic-auto-target-region"');
    expect(smartHtml).toContain('data-testid="semantic-assist-from-selection"');
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
