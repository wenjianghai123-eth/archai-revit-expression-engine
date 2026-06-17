import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MaterialReplaceConfigPanel } from './MaterialReplaceConfigPanel';
import type { GenerationConfig } from '../types';

describe('MaterialReplaceConfigPanel', () => {
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
    expect(html).toContain('智能替换');
    expect(html).toContain('精细涂抹');
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
