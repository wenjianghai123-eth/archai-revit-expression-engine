import { PromptTemplateCreateInput, PromptTemplateFeature, PromptTemplateRecord } from '../lib/api';
import { GenerationConfig, GenerationResultOption, GenerationStep, PromptTemplate, ReferenceImage, StepState, UploadedImage } from '../types';
import { getOriginalResultAssetId, getOriginalResultImageUrl } from './resultImage';

export const templateEnabledSteps = new Set<GenerationStep>([
  GenerationStep.FloorplanTo3D,
  GenerationStep.FreeReferenceImage,
  GenerationStep.MaterialReplace,
  GenerationStep.ObjectInsert,
  GenerationStep.DesignVariants,
]);

export function canSavePromptTemplate(step: GenerationStep, state: StepState, result: GenerationResultOption | null, previewImage?: string | null): boolean {
  return templateEnabledSteps.has(step)
    && state.generationStatus === 'success'
    && !state.isGenerating
    && Boolean(getOriginalResultImageUrl(result, previewImage));
}

export function buildPromptTemplatePayload(input: {
  name: string;
  description: string;
  tags: string[];
  step: GenerationStep;
  state: StepState;
  result: GenerationResultOption;
  previewImage?: string | null;
}): PromptTemplateCreateInput {
  const outputUrl = getOriginalResultImageUrl(input.result, input.previewImage) || input.result.imageUrl;
  const outputAssetId = getOriginalResultAssetId(input.result);
  const prompt = readTemplatePrompt(input.state.config);
  const inputPreviews = collectInputPreviews(input.state);
  const sourceAssetId = input.state.inputImage?.assetId || readString(input.state.config.sourceImageAssetId);
  const materialAssetIds = collectMaterialAssetIds(input.state);
  const referenceAssetIds = collectReferenceAssetIds(input.state);

  return {
    name: input.name.trim(),
    description: input.description.trim(),
    generationStep: stepToJobStep(input.step),
    feature: stepToTemplateFeature(input.step),
    featureName: stepToFeatureName(input.step),
    prompt,
    negativePrompt: readString((input.state.config as unknown as Record<string, unknown>).negativePrompt),
    config: input.state.config as unknown as Record<string, unknown>,
    inputAssetIds: uniqueStrings([
      input.state.inputImage?.assetId,
      sourceAssetId,
    ]),
    referenceAssetIds,
    materialAssetIds,
    sourceAssetId,
    placementPreviewAssetId: readString(input.state.config.placementPreviewAssetId) || readString(input.state.config.placementGuideAssetId) || readString(input.state.config.objectInsert?.previewAssetId),
    outputAssetId,
    outputUrl,
    previewAssetId: outputAssetId,
    tags: input.tags,
    isPublic: true,
    createdFromGenerationRecordId: input.state.generationResultId,
    createdFromJobId: input.result.jobId || input.state.generationJobId || input.state.generationResultId,
    inputPreviews,
    outputPreview: { url: outputUrl, assetId: outputAssetId },
    parameterSummary: {},
    templateSource: 'generation_result',
    coverAssetId: outputAssetId,
    coverUrl: outputUrl,
  };
}

export function promptTemplateRecordToTemplate(record: PromptTemplateRecord): PromptTemplate {
  const outputPreviewUrl = typeof record.outputPreview?.url === 'string' ? record.outputPreview.url : '';
  return {
    id: record.id,
    title: record.name,
    category: record.featureName,
    feature: record.feature,
    supportedModes: [record.generationStep],
    description: record.description || '由成功生成结果保存的全局提示词模板。',
    previewImage: record.coverUrl || outputPreviewUrl || record.outputUrl,
    prompt: record.prompt,
    promptText: record.prompt,
    tags: record.tags,
    config: record.config as Partial<GenerationConfig>,
    generationStep: jobStepToGenerationStep(record.generationStep),
    featureName: record.featureName,
    negativePrompt: record.negativePrompt,
    inputAssetIds: record.inputAssetIds,
    referenceAssetIds: record.referenceAssetIds,
    materialAssetIds: record.materialAssetIds,
    sourceAssetId: record.sourceAssetId || undefined,
    placementPreviewAssetId: record.placementPreviewAssetId || undefined,
    outputAssetId: record.outputAssetId || undefined,
    outputUrl: record.outputUrl,
    previewAssetId: record.previewAssetId || undefined,
    isPublic: record.isPublic,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    createdFromGenerationRecordId: record.createdFromGenerationRecordId || undefined,
    createdFromJobId: record.createdFromJobId || undefined,
    inputPreviews: record.inputPreviews,
    outputPreview: record.outputPreview,
    parameterSummary: record.parameterSummary,
    templateSource: record.templateSource || undefined,
    coverAssetId: record.coverAssetId || undefined,
    coverUrl: record.coverUrl || undefined,
  };
}

export function stepToFeatureName(step: GenerationStep): string {
  if (step === GenerationStep.ImagePolish) return '质感提升';
  if (step === GenerationStep.FloorplanTo3D) return '平面彩平';
  if (step === GenerationStep.FreeReferenceImage) return '自由参考生图';
  if (step === GenerationStep.MaterialReplace) return '材质软装替换';
  if (step === GenerationStep.ObjectInsert) return '元素植入';
  if (step === GenerationStep.DesignVariants) return '方案变体';
  return 'AI 生成';
}

export function createDefaultTemplateName(step: GenerationStep, date = new Date()): string {
  const timestamp = date.toLocaleString('zh-CN', { hour12: false });
  return `${stepToFeatureName(step)} ${timestamp}`;
}

export function restoreTemplateInputImage(template: PromptTemplate): UploadedImage | null {
  const preview = template.inputPreviews?.find(item => item.assetId === template.sourceAssetId)
    || template.inputPreviews?.[0];
  if (!preview?.url) return null;
  return {
    id: preview.assetId || `template-input-${template.id}`,
    name: preview.label || '模板原图',
    type: 'image/*',
    size: 0,
    dataUrl: preview.url,
    url: preview.url,
    assetId: preview.assetId,
  };
}

export function restoreTemplateMaterialTextures(template: PromptTemplate): Array<{ id: string; name?: string; url: string; assetId?: string; source: 'upload' }> {
  return (template.inputPreviews || [])
    .filter(item => item.url && (item.label.includes('材质') || template.materialAssetIds?.includes(item.assetId || '')))
    .map((item, index) => ({
      id: item.assetId || `template-material-${template.id}-${index}`,
      name: item.label,
      url: item.url,
      assetId: item.assetId,
      source: 'upload' as const,
    }));
}

export function restoreTemplateFurnitureReferences(template: PromptTemplate): ReferenceImage[] {
  return (template.inputPreviews || [])
    .filter(item => item.url && (item.label.includes('参考') || item.label.includes('家具') || template.referenceAssetIds?.includes(item.assetId || '')))
    .map((item, index) => ({
      id: item.assetId || `template-reference-${template.id}-${index}`,
      name: item.label,
      url: item.url,
      assetId: item.assetId,
      source: 'upload' as const,
    }));
}

function readTemplatePrompt(config: GenerationConfig): string {
  return [
    config.prompt,
    config.customPrompt,
    config.customMaterialPrompt,
    config.objectInsertExtraPrompt,
    config.objectInsert?.globalExtraPrompt,
    config.objectInsert?.extraPrompt,
  ].find(value => typeof value === 'string' && value.trim())?.trim() || '';
}

function collectInputPreviews(state: StepState): PromptTemplateCreateInput['inputPreviews'] {
  const previews: PromptTemplateCreateInput['inputPreviews'] = [];
  addUploadedPreview(previews, '原图', state.inputImage);
  addUploadedPreview(previews, '材质图', state.materialImage);
  for (const texture of state.materialTextures) {
    if (texture.url || texture.dataUrl) previews.push({ label: texture.name || '材质贴图', url: texture.url || texture.dataUrl || '', assetId: texture.assetId });
  }
  for (const reference of state.furnitureReferences) {
    if (reference.url || reference.dataUrl) previews.push({ label: reference.name || '参考图', url: reference.url || reference.dataUrl || '', assetId: reference.assetId });
  }
  return previews.filter(item => item.url);
}

function addUploadedPreview(previews: PromptTemplateCreateInput['inputPreviews'], label: string, image: UploadedImage | null) {
  if (!image) return;
  const url = image.url || image.dataUrl;
  if (!url) return;
  previews.push({ label, url, assetId: image.assetId });
}

function collectMaterialAssetIds(state: StepState): string[] {
  return uniqueStrings([
    state.materialImage?.assetId,
    ...state.materialTextures.map(texture => texture.assetId),
    ...(state.config.materialTextureAssetIds || []),
    ...(state.config.materialReferenceAssetIds || []),
  ]);
}

function collectReferenceAssetIds(state: StepState): string[] {
  const objectItems = state.config.objectInsert?.objectItems || [];
  return uniqueStrings([
    state.config.referenceImageAssetId,
    ...(state.config.referenceImageAssetIds || []),
    state.config.objectReferenceAssetId,
    state.config.objectInsert?.objectReferenceAssetId,
    ...(state.config.objectInsert?.objectReferenceAssetIds || []),
    ...state.furnitureReferences.map(reference => reference.assetId),
    ...(state.config.furnitureReferenceAssetIds || []),
    ...objectItems.flatMap(item => item.referenceAssetIds),
  ]);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)));
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stepToTemplateFeature(step: GenerationStep): PromptTemplateFeature {
  if (step === GenerationStep.ImagePolish) return 'image-polish';
  if (step === GenerationStep.FloorplanTo3D) return 'floorplan';
  if (step === GenerationStep.FreeReferenceImage) return 'free-reference-image';
  if (step === GenerationStep.MaterialReplace) return 'material-replace';
  if (step === GenerationStep.ObjectInsert) return 'object-insert';
  if (step === GenerationStep.DesignVariants) return 'design-variants';
  return 'floorplan';
}

function stepToJobStep(step: GenerationStep): PromptTemplateRecord['generationStep'] {
  if (step === GenerationStep.ImagePolish) return 'image_polish';
  if (step === GenerationStep.FloorplanTo3D) return 'floorplan_to_3d';
  if (step === GenerationStep.FreeReferenceImage) return 'free_reference_image';
  if (step === GenerationStep.MaterialReplace) return 'material_replace';
  if (step === GenerationStep.ObjectInsert) return 'object_insert';
  if (step === GenerationStep.DesignVariants) return 'design_variants';
  if (step === GenerationStep.PlanColorize) return 'plan_colorize';
  if (step === GenerationStep.ModelSnapshotRender) return 'model_snapshot_render';
  if (step === GenerationStep.PanoramaQuickRender) return 'panorama_quick_render';
  if (step === GenerationStep.StyleRender) return 'style_render';
  return 'local_inpainting';
}

function jobStepToGenerationStep(step: PromptTemplateRecord['generationStep']): GenerationStep {
  if (step === 'image_polish') return GenerationStep.ImagePolish;
  if (step === 'floorplan_to_3d') return GenerationStep.FloorplanTo3D;
  if (step === 'free_reference_image') return GenerationStep.FreeReferenceImage;
  if (step === 'material_replace') return GenerationStep.MaterialReplace;
  if (step === 'object_insert') return GenerationStep.ObjectInsert;
  if (step === 'design_variants') return GenerationStep.DesignVariants;
  if (step === 'plan_colorize') return GenerationStep.PlanColorize;
  if (step === 'model_snapshot_render') return GenerationStep.ModelSnapshotRender;
  if (step === 'panorama_quick_render') return GenerationStep.PanoramaQuickRender;
  if (step === 'style_render') return GenerationStep.StyleRender;
  return GenerationStep.LocalInpainting;
}
