import { describe, expect, it } from 'vitest';
import { GenerationStep, type GenerationConfig } from '../types';
import { buildSecondaryEditConfigPatch, resultSendTargets } from './secondaryEdit';

const baseConfig: GenerationConfig = {
  prompt: '',
  lighting: '匹配原图',
  materialStrength: 0.8,
  customMaterialPrompt: 'replace the floor',
  materialPatternScale: 'medium',
  materialFinish: 'glossy',
  materialReplaceScope: 'creative',
};

describe('secondary edit utilities', () => {
  it('maps material quick repair actions to material replacement prompt patches', () => {
    const smallerTexture = buildSecondaryEditConfigPatch(
      GenerationStep.MaterialReplace,
      baseConfig,
      'material-smaller-texture',
    );
    const selectedAreaOnly = buildSecondaryEditConfigPatch(
      GenerationStep.MaterialReplace,
      baseConfig,
      'material-selected-area-only',
    );

    expect(smallerTexture.materialPatternScale).toBe('small');
    expect(smallerTexture.preserveGeometry).toBe(true);
    expect(smallerTexture.customMaterialPrompt).toContain('纹理比例缩小');
    expect(selectedAreaOnly.materialReplaceScope).toBe('material-only');
    expect(selectedAreaOnly.customMaterialPrompt).toContain('只修改选中或目标区域');
  });

  it('exposes cross-feature result send targets', () => {
    expect(resultSendTargets.map(item => item.step)).toEqual([
      GenerationStep.MaterialReplace,
      GenerationStep.ObjectInsert,
      GenerationStep.DesignVariants,
      GenerationStep.FreeReferenceImage,
    ]);
  });
});
