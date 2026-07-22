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
  maskWorkflowMode: 'manual',
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

  it('requires a target object but allows no-mask semantic replacement after one is selected', () => {
    expect(validate({ hasMask: false, hasValidMaskPixels: false, hasTargetObject: false }).missingItems).toContain('请选择替换对象类型');
    expect(validate({
      hasMask: false,
      hasValidMaskPixels: false,
      hasTargetObject: true,
      replacementTarget: 'plant',
      selectionMode: 'semantic',
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
    const result = validate({ mode: 'local-furnishing', hasReference: false, hasMask: false, hasValidMaskPixels: false, hasTargetObject: false });
    expect(result.missingItems).toContain('请选择替换对象类型');
    expect(result.missingItems).toContain('请上传软装参考图或填写软装替换描述，至少完成一项');
  });

  it('rejects an empty committed mask', () => {
    expect(validate({ hasValidMaskPixels: false }).missingItems).toContain('蒙版为空，请重新涂抹');
  });

  it('requires smart-mask confirmation until the smart stage is confirmed', () => {
    expect(validate({
      selectionMode: 'smart',
      maskWorkflowMode: 'smart',
      maskWorkflowActive: true,
      smartMaskStage: 'ready-to-segment',
      maskConfirmed: false,
    }).missingItems).toContain('请先完成智能识别并确认替换区域');

    expect(validate({
      selectionMode: 'smart',
      maskWorkflowMode: 'smart',
      smartMaskStage: 'reviewing',
      maskConfirmed: false,
    }).missingItems).toContain('请先完成智能识别并确认替换区域');

    expect(validate({
      selectionMode: 'smart',
      maskWorkflowMode: 'smart',
      smartMaskStage: 'confirmed',
      maskConfirmed: true,
    }).valid).toBe(true);
  });

  it('uses mode-specific copy after the user enters a mask workflow', () => {
    expect(validate({
      hasMask: false,
      hasValidMaskPixels: false,
      hasTargetObject: true,
      replacementTarget: 'plant',
      selectionMode: 'smart',
      maskWorkflowMode: 'smart',
      maskWorkflowActive: true,
      smartMaskStage: 'rough-marking',
    }).missingItems).toContain('请先完成智能识别并确认替换区域');

    expect(validate({
      hasMask: false,
      hasValidMaskPixels: false,
      hasTargetObject: true,
      replacementTarget: 'plant',
      selectionMode: 'precise',
      maskWorkflowMode: 'manual',
      maskWorkflowActive: true,
    }).missingItems).toContain('请先确认替换区域');
  });

  it('allows semantic auto-selection without a painted mask', () => {
    expect(validate({
      selectionMode: 'semantic',
      maskWorkflowMode: 'none',
      hasTargetObject: true,
      hasMask: false,
      hasValidMaskPixels: false,
    }).valid).toBe(true);
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
