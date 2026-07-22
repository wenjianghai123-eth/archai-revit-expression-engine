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
});
