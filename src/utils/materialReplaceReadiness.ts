import type {
  GenerationConfig,
  MaskWorkflowMode,
  MaterialCategory,
  MaterialReplacementMode as StructuredMaterialReplacementMode,
  MaterialReplacementTargetScope,
  ReplacementTarget,
  SelectionMode,
  SmartSelectionStatus,
} from '../types';

export type MaterialReplaceSelectionMode = SelectionMode | 'smart' | 'semantic';
export type MaterialReplacementMode = 'auto-enhance' | 'local-material' | 'local-furnishing';

export const AUTO_MATERIAL_REPLACEMENT_PROMPT = [
  '自动分析画面中可优化的主要材质和软装，生成一版自然、克制、可落地的材质软装优化预览。',
  '严格保持原有空间结构、相机机位、透视、构图、门窗和主要设计内容不变。',
  '不新增人物、家具或建筑构件，不重新设计空间。',
].join('\n');

export interface MaterialReplacePreviewButtonInput {
  hasSourceImage: boolean;
  isUploading: boolean;
  isGeneratingPreview: boolean;
  providerUnavailableReason?: string | null;
}

export interface MaterialReplacePreviewButtonState {
  canClickPreview: boolean;
  previewButtonHint: string | null;
}

export interface MaterialReplacePreviewValidationInput {
  mode: MaterialReplacementMode;
  hasSourceImage: boolean;
  hasReference: boolean;
  hasMask: boolean;
  hasValidMaskPixels: boolean;
  hasTargetObject: boolean;
  materialReplacementMode?: StructuredMaterialReplacementMode | null;
  materialReplaceMode?: StructuredMaterialReplacementMode | null;
  materialCategory?: MaterialCategory | null;
  replacementScope?: MaterialReplacementTargetScope | null;
  replacementTarget?: ReplacementTarget | null;
  selectionMode: MaterialReplaceSelectionMode;
  maskWorkflowMode?: MaskWorkflowMode;
  maskWorkflowActive?: boolean;
  smartSelectionStatus?: SmartSelectionStatus;
  maskConfirmed: boolean;
  replacementPrompt: string;
  useDefaultPreset: boolean;
  isSegmenting: boolean;
  enablePhysicalMaterialLayout?: boolean;
  materialRealSizeMm?: number;
  materialJointWidthMm?: number;
}

export interface PreviewValidationResult {
  valid: boolean;
  missingItems: string[];
}

export function resolveMaterialReplacementMode(
  editTarget: GenerationConfig['editTarget'],
): MaterialReplacementMode {
  if (editTarget === 'material') return 'local-material';
  if (editTarget === 'furniture') return 'local-furnishing';
  return 'auto-enhance';
}

/** The button itself is gated only by source/upload/generation readiness. */
export function getMaterialReplacePreviewButtonState(
  input: MaterialReplacePreviewButtonInput,
): MaterialReplacePreviewButtonState {
  const hint = input.providerUnavailableReason
    || (!input.hasSourceImage ? '请先上传原始图片' : null)
    || (input.isUploading ? '原图或参考图正在上传' : null)
    || (input.isGeneratingPreview ? '正在生成预览' : null);

  return {
    canClickPreview: hint === null,
    previewButtonHint: hint,
  };
}

/** Local-mode requirements are checked on click and returned as a full list. */
export function validateMaterialReplacePreviewInput(
  input: MaterialReplacePreviewValidationInput,
): PreviewValidationResult {
  const missingItems: string[] = [];
  if (!input.hasSourceImage) missingItems.push('请先上传原始图片');
  if (input.mode === 'auto-enhance') return result(missingItems);

  const targetLabel = input.mode === 'local-furnishing' ? '软装' : '材质';
  const hasTargetObject = input.hasTargetObject || Boolean(input.replacementTarget);
  const selectionMode = normalizeSelectionMode(input.selectionMode, input.maskWorkflowMode);
  const targetMode = normalizeMaterialReplaceTargetMode(input.materialReplacementMode ?? input.materialReplaceMode, selectionMode);
  const replacementScope = normalizeReplacementScope(input.replacementScope, targetMode, selectionMode);
  const smartMaskConfirmed = input.maskConfirmed
    || input.smartSelectionStatus === 'confirmed'
    || false;

  if (targetMode === 'material-category' && !input.materialCategory) {
    missingItems.push('请选择材质类别');
  }

  const requiresObjectTarget = targetMode === 'object-category';

  if (requiresObjectTarget && !hasTargetObject) {
    missingItems.push('请选择目标区域');
  }
  if (input.hasMask && !input.hasValidMaskPixels) {
    missingItems.push('蒙版为空，请重新涂抹');
  }

  if (!input.hasReference && !input.replacementPrompt.trim() && !input.useDefaultPreset) {
    missingItems.push(`请上传${targetLabel}参考图或填写${targetLabel}替换描述，至少完成一项`);
  }

  if (input.isSegmenting || input.smartSelectionStatus === 'predicting') {
    missingItems.push('正在推测替换区域，请稍候');
  } else if (selectionMode === 'smart-select' || replacementScope === 'selected-region' || targetMode === 'smart-select') {
    if (!input.hasMask) {
      missingItems.push('请在需要替换的对象或区域上轻微涂抹一下。');
    } else if (!smartMaskConfirmed) {
      missingItems.push('请确认当前识别区域。');
    }
  }

  if (input.enablePhysicalMaterialLayout) {
    if (!isFiniteNumberInRange(input.materialRealSizeMm, 20, 5000)) {
      missingItems.push('请填写 20～5000 mm 的有效材质真实尺寸');
    }
    if (!isFiniteNumberInRange(input.materialJointWidthMm, 0, 50)) {
      missingItems.push('请填写 0～50 mm 的有效拼缝宽度');
    } else if (
      typeof input.materialRealSizeMm === 'number'
      && typeof input.materialJointWidthMm === 'number'
      && input.materialJointWidthMm >= input.materialRealSizeMm
    ) {
      missingItems.push('拼缝宽度必须小于材质真实尺寸');
    }
  }

  return result(missingItems);
}

function normalizeMaterialReplaceTargetMode(
  mode: MaterialReplacePreviewValidationInput['materialReplaceMode'],
  selectionMode: SelectionMode,
): StructuredMaterialReplacementMode {
  const rawMode = mode as unknown;
  if (rawMode === 'object-category' || rawMode === 'material-category' || rawMode === 'smart-select') return rawMode;
  if (rawMode === 'object-target') return 'object-category';
  if (rawMode === 'smart-selection') return 'smart-select';
  return selectionMode === 'smart-select' ? 'smart-select' : 'object-category';
}

function normalizeReplacementScope(
  scope: MaterialReplacePreviewValidationInput['replacementScope'],
  mode: StructuredMaterialReplacementMode,
  selectionMode: SelectionMode,
): MaterialReplacementTargetScope {
  const rawScope = scope as unknown;
  if (rawScope === 'all-scene' || rawScope === 'selected-region' || rawScope === 'current-object') return rawScope;
  if (rawScope === 'all_scene') return 'all-scene';
  if (rawScope === 'selected_region') return 'selected-region';
  if (rawScope === 'current_object') return 'current-object';
  if (mode === 'material-category') return selectionMode === 'smart-select' ? 'selected-region' : 'all-scene';
  if (mode === 'object-category') return 'current-object';
  return 'selected-region';
}

function normalizeSelectionMode(
  selectionMode: MaterialReplaceSelectionMode,
  legacyWorkflowMode?: MaskWorkflowMode,
): SelectionMode {
  if (selectionMode === 'semantic-auto' || selectionMode === 'smart-select') {
    return selectionMode;
  }
  if (selectionMode === 'smart') return 'smart-select';
  if (selectionMode === 'semantic') return 'semantic-auto';
  if (legacyWorkflowMode === 'smart') return 'smart-select';
  return 'semantic-auto';
}

function isFiniteNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function result(missingItems: string[]): PreviewValidationResult {
  return {
    valid: missingItems.length === 0,
    missingItems,
  };
}
