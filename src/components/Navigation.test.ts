import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Stepper } from './Navigation';
import { GenerationStep } from '../types';

describe('Stepper', () => {
  it('shows the design variants entry as a generation mode', () => {
    const html = renderToStaticMarkup(React.createElement(Stepper, {
      currentStep: GenerationStep.DesignVariants,
      onStepChange: () => undefined,
    }));

    expect(html).toContain('方案变体');
    expect(html).toContain('一次生成多种设计方向，快速对比方案');
  });

  it('shows the material replace entry as a generation mode', () => {
    const html = renderToStaticMarkup(React.createElement(Stepper, {
      currentStep: GenerationStep.MaterialReplace,
      onStepChange: () => undefined,
    }));

    expect(html).toContain('材质软装替换');
    expect(html).toContain('选择局部区域，替换地面、墙面、家具、灯光或材质');
  });

  it('shows the model snapshot render entry as a generation mode', () => {
    const html = renderToStaticMarkup(React.createElement(Stepper, {
      currentStep: GenerationStep.ModelSnapshotRender,
      onStepChange: () => undefined,
    }));

    expect(html).toContain('白模快渲');
    expect(html).toContain('上传 3D 白模，选好角度，一键生成效果图');
    expect(html).toContain('04');
  });
});
