import { describe, expect, it } from 'vitest';
import {
  getMaterialReplacePreviewButtonState,
  resolveMaterialReplacementMode,
  validateMaterialReplacePreviewInput,
  type MaterialReplacePreviewValidationInput,
} from './materialReplaceReadiness';

const localMaterialInput: MaterialReplacePreviewValidationInput = {
  mode: 'local-material',
  hasSourceImage: true,
  hasReference: true,
  hasMask: true,
  hasValidMaskPixels: true,
  hasTargetObject: true,
  selectionMode: 'precise',
  maskConfirmed: true,
  replacementPrompt: '',
  useDefaultPreset: false,
  isSegmenting: false,
};

function validate(patch: Partial<MaterialReplacePreviewValidationInput> = {}) {
  return validateMaterialReplacePreviewInput({ ...localMaterialInput, ...patch });
}

describe('material replacement preview button', () => {
  it('is disabled only before source upload or while processing', () => {
    expect(getMaterialReplacePreviewButtonState({ hasSourceImage: false, isUploading: false, isGeneratingPreview: false })).toEqual({
      canClickPreview: false,
      previewButtonHint: '请先上传原始图片',
    });
    expect(getMaterialReplacePreviewButtonState({ hasSourceImage: true, isUploading: false, isGeneratingPreview: false }).canClickPreview).toBe(true);
    expect(getMaterialReplacePreviewButtonState({ hasSourceImage: true, isUploading: true, isGeneratingPreview: false }).previewButtonHint).toBe('原图或参考图正在上传');
    expect(getMaterialReplacePreviewButtonState({ hasSourceImage: true, isUploading: false, isGeneratingPreview: true }).previewButtonHint).toBe('正在生成预览');
  });

  it('resolves general, material, and furnishing modes compatibly', () => {
    expect(resolveMaterialReplacementMode('general')).toBe('auto-enhance');
    expect(resolveMaterialReplacementMode('material')).toBe('local-material');
    expect(resolveMaterialReplacementMode('furniture')).toBe('local-furnishing');
  });
});

describe('material replacement click validation', () => {
  it('allows auto enhancement with only a source image', () => {
    expect(validate({ mode: 'auto-enhance', hasReference: false, hasMask: false, hasValidMaskPixels: false }).valid).toBe(true);
  });

  it('lists the missing local material region', () => {
    expect(validate({ hasMask: false, hasValidMaskPixels: false }).missingItems).toContain('请选择需要替换的材质区域');
  });

  it('requires a material reference, description, or preset as alternatives', () => {
    const missing = validate({ hasReference: false, replacementPrompt: '', useDefaultPreset: false });
    expect(missing.missingItems).toContain('请上传材质参考图或填写材质替换描述，至少完成一项');
    expect(validate({ hasReference: false, replacementPrompt: '换成浅色微水泥' }).valid).toBe(true);
    expect(validate({ hasReference: true, replacementPrompt: '' }).valid).toBe(true);
    expect(validate({ hasReference: false, replacementPrompt: '', useDefaultPreset: true }).valid).toBe(true);
  });

  it('uses furnishing-specific validation copy', () => {
    const result = validate({ mode: 'local-furnishing', hasReference: false, hasMask: false, hasValidMaskPixels: false });
    expect(result.missingItems).toContain('请选择需要替换的软装区域');
    expect(result.missingItems).toContain('请上传软装参考图或填写软装替换描述，至少完成一项');
  });

  it('rejects an empty committed mask', () => {
    expect(validate({ hasValidMaskPixels: false }).missingItems).toContain('蒙版为空，请重新涂抹');
  });

  it('requires smart-mask confirmation only after a smart mask exists', () => {
    expect(validate({ selectionMode: 'smart', maskConfirmed: false }).missingItems).toContain('请先确认智能识别的替换区域');
    expect(validate({ selectionMode: 'smart', maskConfirmed: true }).valid).toBe(true);
  });

  it('allows semantic auto-selection without a painted mask', () => {
    expect(validate({ selectionMode: 'semantic', hasTargetObject: true, hasMask: false, hasValidMaskPixels: false }).valid).toBe(true);
  });
});
