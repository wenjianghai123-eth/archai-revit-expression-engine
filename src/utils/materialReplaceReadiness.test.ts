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
  selectionMode: 'smart-select',
  maskWorkflowMode: 'smart',
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

  it('requires a target area only for semantic replacement and allows it without a mask', () => {
    expect(validate({
      selectionMode: 'semantic-auto',
      maskWorkflowMode: 'none',
      hasMask: false,
      hasValidMaskPixels: false,
      hasTargetObject: false,
    }).missingItems).toContain('请选择目标区域');
    expect(validate({
      hasMask: false,
      hasValidMaskPixels: false,
      hasTargetObject: true,
      replacementTarget: 'plant',
      selectionMode: 'semantic-auto',
      maskWorkflowMode: 'none',
      maskWorkflowActive: false,
    }).valid).toBe(true);
  });

  it('requires a material reference, description, or preset as alternatives', () => {
    const missing = validate({ hasReference: false, replacementPrompt: '', useDefaultPreset: false });
    expect(missing.missingItems).toContain('请上传材质参考图或填写材质替换描述，至少完成一项');
    expect(validate({ hasReference: false, replacementPrompt: '换成浅色微水泥' }).valid).toBe(true);
    expect(validate({ hasReference: true, replacementPrompt: '' }).valid).toBe(true);
    expect(validate({ hasReference: false, replacementPrompt: '', useDefaultPreset: true }).valid).toBe(true);
  });

  it('uses furnishing-specific validation copy', () => {
    const result = validate({
      mode: 'local-furnishing',
      selectionMode: 'semantic-auto',
      maskWorkflowMode: 'none',
      hasReference: false,
      hasMask: false,
      hasValidMaskPixels: false,
      hasTargetObject: false,
    });
    expect(result.missingItems).toContain('请选择目标区域');
    expect(result.missingItems).toContain('请上传软装参考图或填写软装替换描述，至少完成一项');
  });

  it('rejects an empty committed mask', () => {
    expect(validate({ hasValidMaskPixels: false }).missingItems).toContain('蒙版为空，请重新涂抹');
  });

  it('requires smart-select interaction and confirmation before generation', () => {
    expect(validate({
      selectionMode: 'smart-select',
      maskWorkflowMode: 'smart',
      maskWorkflowActive: true,
      hasMask: false,
      hasValidMaskPixels: false,
      maskConfirmed: false,
    }).missingItems).toContain('请在需要替换的对象或区域上轻微涂抹一下。');

    expect(validate({
      selectionMode: 'smart-select',
      maskWorkflowMode: 'smart',
      hasMask: true,
      maskConfirmed: false,
      smartSelectionStatus: 'preview',
    }).missingItems).toContain('请确认当前识别区域。');

    expect(validate({
      selectionMode: 'smart-select',
      maskWorkflowMode: 'smart',
      smartSelectionStatus: 'confirmed',
      maskConfirmed: true,
    }).valid).toBe(true);
  });

  it('does not require target area in smart-select mode but still requires a confirmed selection', () => {
    expect(validate({
      hasMask: false,
      hasValidMaskPixels: false,
      hasTargetObject: false,
      replacementTarget: null,
      selectionMode: 'smart-select',
      maskWorkflowMode: 'smart',
      maskWorkflowActive: true,
      smartSelectionStatus: 'idle',
    }).missingItems).toContain('请在需要替换的对象或区域上轻微涂抹一下。');
    expect(validate({
      hasMask: true,
      hasValidMaskPixels: true,
      hasTargetObject: false,
      replacementTarget: null,
      selectionMode: 'smart-select',
      maskWorkflowMode: 'smart',
      maskWorkflowActive: true,
      smartSelectionStatus: 'confirmed',
      maskConfirmed: true,
    }).missingItems).not.toContain('请选择目标区域');
  });

  it('allows semantic auto-selection without a painted mask', () => {
    expect(validate({
      selectionMode: 'semantic-auto',
      maskWorkflowMode: 'none',
      hasTargetObject: true,
      hasMask: false,
      hasValidMaskPixels: false,
    }).valid).toBe(true);
  });

  it('allows all-scene material-category replacement without an object target', () => {
    expect(validate({
      materialReplacementMode: 'material-category',
      materialCategory: 'wood',
      replacementScope: 'all-scene',
      selectionMode: 'semantic-auto',
      maskWorkflowMode: 'none',
      hasTargetObject: false,
      replacementTarget: null,
      hasMask: false,
      hasValidMaskPixels: false,
    }).valid).toBe(true);
  });

  it('requires a category for material-category replacement', () => {
    expect(validate({
      materialReplacementMode: 'material-category',
      materialCategory: null,
      replacementScope: 'all-scene',
      selectionMode: 'semantic-auto',
      maskWorkflowMode: 'none',
      hasTargetObject: false,
      replacementTarget: null,
      hasMask: false,
      hasValidMaskPixels: false,
    }).missingItems).toContain('请选择材质类别');
  });

  it('requires a confirmed selection for material-category selected-region replacement', () => {
    expect(validate({
      materialReplacementMode: 'material-category',
      materialCategory: 'wood',
      replacementScope: 'selected-region',
      selectionMode: 'smart-select',
      maskWorkflowMode: 'smart',
      maskWorkflowActive: true,
      hasTargetObject: false,
      replacementTarget: null,
      hasMask: false,
      hasValidMaskPixels: false,
      maskConfirmed: false,
    }).missingItems).toContain('请在需要替换的对象或区域上轻微涂抹一下。');
  });

  it('does not require physical dimensions while the advanced control is disabled', () => {
    expect(validate({
      enablePhysicalMaterialLayout: false,
      materialRealSizeMm: undefined,
      materialJointWidthMm: undefined,
    }).valid).toBe(true);
  });

  it('validates physical dimensions only after the advanced control is enabled', () => {
    expect(validate({
      enablePhysicalMaterialLayout: true,
      materialRealSizeMm: undefined,
      materialJointWidthMm: undefined,
    }).missingItems).toEqual([
      '请填写 20～5000 mm 的有效材质真实尺寸',
      '请填写 0～50 mm 的有效拼缝宽度',
    ]);
    expect(validate({
      enablePhysicalMaterialLayout: true,
      materialRealSizeMm: 600,
      materialJointWidthMm: 0,
    }).valid).toBe(true);
    expect(validate({
      enablePhysicalMaterialLayout: true,
      materialRealSizeMm: 20,
      materialJointWidthMm: 20,
    }).missingItems).toContain('拼缝宽度必须小于材质真实尺寸');
  });
});
