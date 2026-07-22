import React from 'react';
import { Box, Camera, FileImage, Layers, LayoutGrid, Paintbrush, ScanLine, Sparkles, Wand2 } from 'lucide-react';
import { demoImageFallbacks } from './constants/demoImageFallbacks';
import type { FeatureMaturity, WorkflowCategory } from './constants/productWorkflows';
import { GenerationStep } from './types';

export interface FeatureShowcaseAsset {
  sourceImage: string;
  resultImage: string;
  sourcePreviousUi?: string;
  resultPreviousUi?: string;
  sourceFallback?: string;
  resultFallback?: string;
  sourceFinalFallback?: string;
  resultFinalFallback?: string;
  thumbnail?: string;
}

export interface FeatureDefinition {
  id: string;
  title: string;
  desc: string;
  input: string;
  output: string;
  step: GenerationStep;
  componentName: string;
  icon: React.ComponentType<{ className?: string }>;
  image: string;
  previousUiImage?: string;
  fallbackImage?: string;
  finalFallbackImage?: string;
  imageAlt?: string;
  category?: WorkflowCategory;
  scenarios?: string[];
  maturity?: FeatureMaturity;
  recommendedNextSteps?: string[];
  showcaseAsset?: FeatureShowcaseAsset;
}

export const visibleFeatureIdsStorageKey = 'visibleFeatureIds';
const blockedFeatureIds = new Set(['floorplan_to_3d']);

export const defaultFeatureIds = [
  'floor_plan_color',
  'free_reference_image',
  'material_replace',
  'object_insert',
  'scheme_variant',
  'image_polish',
] as const;

export const allFeatures: FeatureDefinition[] = [
  {
    id: 'floor_plan_color',
    title: '图纸表达中心',
    desc: '识别并校正平面区域，形成精准材质彩平、三维彩平、分析表达图或多方案彩平。',
    input: '输入：平面图',
    output: '输出：材质彩平 / 三维 / 分析 / 多方案',
    step: GenerationStep.FloorplanTo3D,
    componentName: 'FloorplanTo3DWorkspace',
    icon: ScanLine,
    image: demoImageFallbacks.floor_plan_color.localSrc || '',
    previousUiImage: demoImageFallbacks.floor_plan_color.previousUiSrc,
    fallbackImage: demoImageFallbacks.floor_plan_color.fallbackSrc,
    finalFallbackImage: demoImageFallbacks.floor_plan_color.finalFallbackSrc,
    imageAlt: demoImageFallbacks.floor_plan_color.alt,
    category: '快速形成方案',
    scenarios: ['快速做汇报', '平面图汇报'],
    maturity: '演示增强',
    recommendedNextSteps: ['scheme_variant', 'free_reference_image'],
    showcaseAsset: {
      sourceImage: '/cases/floor-plan-report-source.jpg',
      resultImage: '/cases/floor-plan-report-result.jpg',
    },
  },
  {
    id: 'free_reference_image',
    title: '自由参考生图',
    desc: '上传原图和参考图，选择尺寸比例，直接按提示词生成效果图。',
    input: '输入：原图 + 参考图',
    output: '输出：效果图',
    step: GenerationStep.FreeReferenceImage,
    componentName: 'FreeReferenceImagePanel',
    icon: FileImage,
    image: demoImageFallbacks.free_reference_image.localSrc || '',
    previousUiImage: demoImageFallbacks.free_reference_image.previousUiSrc,
    fallbackImage: demoImageFallbacks.free_reference_image.fallbackSrc,
    finalFallbackImage: demoImageFallbacks.free_reference_image.finalFallbackSrc,
    imageAlt: demoImageFallbacks.free_reference_image.alt,
    category: '快速形成方案',
    scenarios: ['快速做汇报', '灵感参考转方案'],
    maturity: '稳定可用',
    recommendedNextSteps: ['material_replace', 'object_insert', 'scheme_variant'],
    showcaseAsset: {
      sourceImage: '/cases/client-iteration-source.jpg',
      resultImage: '/cases/client-iteration-result.jpg',
    },
  },
  {
    id: 'material_replace',
    title: '材质软装替换',
    desc: '选择局部区域，替换地面、墙面、家具、灯光或材质。',
    input: '输入：效果图 + mask + 材质',
    output: '输出：局部替换效果图',
    step: GenerationStep.MaterialReplace,
    componentName: 'MaterialReplaceConfigPanel',
    icon: Layers,
    image: demoImageFallbacks.material_replace.localSrc || '',
    previousUiImage: demoImageFallbacks.material_replace.previousUiSrc,
    fallbackImage: demoImageFallbacks.material_replace.fallbackSrc,
    finalFallbackImage: demoImageFallbacks.material_replace.finalFallbackSrc,
    imageAlt: demoImageFallbacks.material_replace.alt,
    category: '精细修改方案',
    scenarios: ['客户连续改稿', '材质与软装确认'],
    maturity: '稳定可用',
    recommendedNextSteps: ['object_insert', 'continuous_edit', 'image_polish'],
    showcaseAsset: {
      sourceImage: '/cases/client-iteration-source.jpg',
      resultImage: '/cases/client-iteration-result.jpg',
    },
  },
  {
    id: 'object_insert',
    title: '元素植入',
    desc: '上传原始效果图和物体参考图，在画布中拖拽摆放后融合生成。',
    input: '输入：效果图 + 物体图',
    output: '输出：融合效果图',
    step: GenerationStep.ObjectInsert,
    componentName: 'ObjectInsertPanel',
    icon: Layers,
    image: demoImageFallbacks.object_insert.localSrc || '',
    previousUiImage: demoImageFallbacks.object_insert.previousUiSrc,
    fallbackImage: demoImageFallbacks.object_insert.fallbackSrc,
    finalFallbackImage: demoImageFallbacks.object_insert.finalFallbackSrc,
    imageAlt: demoImageFallbacks.object_insert.alt,
    category: '精细修改方案',
    scenarios: ['客户连续改稿', '家具与元素确认'],
    maturity: '稳定可用',
    recommendedNextSteps: ['continuous_edit', 'image_polish'],
    showcaseAsset: {
      sourceImage: '/cases/client-iteration-source.jpg',
      resultImage: '/cases/client-iteration-result.jpg',
    },
  },
  {
    id: 'scheme_variant',
    title: '方案变体',
    desc: '一次生成多种设计方向，快速对比方案。',
    input: '输入：原始空间图',
    output: '输出：多张方案矩阵',
    step: GenerationStep.DesignVariants,
    componentName: 'DesignVariantsPanel',
    icon: LayoutGrid,
    image: demoImageFallbacks.scheme_variant.localSrc || '',
    previousUiImage: demoImageFallbacks.scheme_variant.previousUiSrc,
    fallbackImage: demoImageFallbacks.scheme_variant.fallbackSrc,
    finalFallbackImage: demoImageFallbacks.scheme_variant.finalFallbackSrc,
    imageAlt: demoImageFallbacks.scheme_variant.alt,
    category: '快速形成方案',
    scenarios: ['多方案比选', '客户方案汇报'],
    maturity: '稳定可用',
    recommendedNextSteps: ['material_replace', 'continuous_edit', 'pdf_report'],
    showcaseAsset: {
      sourceImage: '/cases/white-model-render-source.jpg',
      resultImage: '/cases/white-model-render-result.jpg',
    },
  },
  {
    id: 'image_polish',
    title: '质感提升',
    desc: '上传一张原图，在尽量保持原色、原材质倾向、构图和设计不变的基础上，提升清晰度、真实感、光影层次和照片质感。',
    input: '输入：1 张原图',
    output: '输出：增强后的照片质感图',
    step: GenerationStep.ImagePolish,
    componentName: 'ImagePolishPanel',
    icon: Sparkles,
    image: demoImageFallbacks.image_polish.localSrc || '',
    previousUiImage: demoImageFallbacks.image_polish.previousUiSrc,
    fallbackImage: demoImageFallbacks.image_polish.fallbackSrc,
    finalFallbackImage: demoImageFallbacks.image_polish.finalFallbackSrc,
    imageAlt: demoImageFallbacks.image_polish.alt,
    category: '形成交付成果',
    scenarios: ['高清定稿', '汇报成果优化'],
    maturity: '稳定可用',
    recommendedNextSteps: ['download', 'share', 'pdf_report'],
    showcaseAsset: {
      sourceImage: '/cases/white-model-render-source.jpg',
      resultImage: '/cases/white-model-render-result.jpg',
    },
  },
  {
    id: 'drawing_expression',
    title: '图纸表达中心 · 快速表达',
    desc: '保留经典入口，快速生成三维彩平、分析表达图和多方案彩平。',
    input: '输入：黑白平面图',
    output: '输出：彩色图纸表达',
    step: GenerationStep.PlanColorize,
    componentName: 'PlanColorizePanel',
    icon: FileImage,
    image: demoImageFallbacks.floor_plan_color.localSrc || '',
    previousUiImage: demoImageFallbacks.floor_plan_color.previousUiSrc,
    fallbackImage: demoImageFallbacks.floor_plan_color.fallbackSrc,
    finalFallbackImage: demoImageFallbacks.floor_plan_color.finalFallbackSrc,
    imageAlt: demoImageFallbacks.floor_plan_color.alt,
    category: '形成交付成果',
    scenarios: ['快速做汇报', '平面图汇报'],
    maturity: '稳定可用',
    recommendedNextSteps: ['scheme_variant', 'pdf_report'],
    showcaseAsset: {
      sourceImage: '/cases/floor-plan-report-source.jpg',
      resultImage: '/cases/floor-plan-report-result.jpg',
    },
  },
  {
    id: 'style_render',
    title: '快速风格预设',
    desc: '从现代、侘寂、北欧、轻奢等预设快速进入自由参考生图，继续调整角色、权重与结构保持。',
    input: '输入：原图 + 可选参考图',
    output: '输出：风格效果图',
    step: GenerationStep.FreeReferenceImage,
    componentName: 'FreeReferenceImagePanel',
    icon: Wand2,
    image: demoImageFallbacks.free_reference_image.localSrc || '',
    previousUiImage: demoImageFallbacks.free_reference_image.previousUiSrc,
    fallbackImage: demoImageFallbacks.free_reference_image.fallbackSrc,
    finalFallbackImage: demoImageFallbacks.free_reference_image.finalFallbackSrc,
    imageAlt: demoImageFallbacks.free_reference_image.alt,
    category: '快速形成方案',
    scenarios: ['风格探索', '参考方案转化'],
    maturity: '持续优化',
    recommendedNextSteps: ['material_replace', 'scheme_variant'],
  },
  {
    id: 'local_inpainting',
    title: '局部重绘修饰',
    desc: '用画笔、矩形或套索选择局部区域，精修材质、家具和光影。',
    input: '输入：效果图 + mask',
    output: '输出：局部修饰图',
    step: GenerationStep.LocalInpainting,
    componentName: 'LocalInpaintingWorkspace',
    icon: Paintbrush,
    image: demoImageFallbacks.material_replace.localSrc || '',
    previousUiImage: demoImageFallbacks.material_replace.previousUiSrc,
    fallbackImage: demoImageFallbacks.material_replace.fallbackSrc,
    finalFallbackImage: demoImageFallbacks.material_replace.finalFallbackSrc,
    imageAlt: demoImageFallbacks.material_replace.alt,
    category: '精细修改方案',
    scenarios: ['局部修正', '客户改稿'],
    maturity: '持续优化',
    recommendedNextSteps: ['image_polish'],
  },
  {
    id: 'model_snapshot_render',
    title: '白模快渲',
    desc: '上传 3D 白模，选好角度，一键生成效果图。',
    input: '输入：GLB / GLTF 白模',
    output: '输出：建筑 / 室内效果图',
    step: GenerationStep.ModelSnapshotRender,
    componentName: 'ModelSnapshotRenderPanel',
    icon: Box,
    image: demoImageFallbacks.model_snapshot_render.localSrc || '',
    previousUiImage: demoImageFallbacks.model_snapshot_render.previousUiSrc,
    fallbackImage: demoImageFallbacks.model_snapshot_render.fallbackSrc,
    finalFallbackImage: demoImageFallbacks.model_snapshot_render.finalFallbackSrc,
    imageAlt: demoImageFallbacks.model_snapshot_render.alt,
    category: '快速形成方案',
    scenarios: ['白模快速出图', '早期方案汇报'],
    maturity: '稳定可用',
    recommendedNextSteps: ['scheme_variant', 'material_replace', 'object_insert', 'image_polish'],
    showcaseAsset: {
      sourceImage: '/cases/white-model-render-source.jpg',
      resultImage: '/cases/white-model-render-result.jpg',
    },
  },
  {
    id: 'panorama_quick_render',
    title: '漫游全景快渲',
    desc: '上传 GLB / GLTF 模型，漫游查看并捕捉当前全景视点。',
    input: '输入：GLB / GLTF 模型',
    output: '输出：全景视点 payload',
    step: GenerationStep.PanoramaQuickRender,
    componentName: 'PanoramaQuickRenderPanel',
    icon: Camera,
    image: demoImageFallbacks.panorama_render.localSrc || '',
    previousUiImage: demoImageFallbacks.panorama_render.previousUiSrc,
    fallbackImage: demoImageFallbacks.panorama_render.fallbackSrc,
    finalFallbackImage: demoImageFallbacks.panorama_render.finalFallbackSrc,
    imageAlt: demoImageFallbacks.panorama_render.alt,
    category: '形成交付成果',
    scenarios: ['空间漫游汇报', '沉浸式展示'],
    maturity: '持续优化',
    recommendedNextSteps: ['share'],
  },
];

export function readStoredVisibleFeatureIds(): string[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(visibleFeatureIdsStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const sanitized = sanitizeAddedFeatureIds(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(sanitized)) {
      window.localStorage.setItem(visibleFeatureIdsStorageKey, JSON.stringify(sanitized));
    }
    return sanitized;
  } catch {
    return [];
  }
}

export function writeStoredVisibleFeatureIds(featureIds: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(visibleFeatureIdsStorageKey, JSON.stringify(sanitizeAddedFeatureIds(featureIds)));
  } catch {
    // Feature visibility is optional UI state and should not break startup.
  }
}

export function getVisibleFeatures(addedFeatureIds: string[]): FeatureDefinition[] {
  const visibleIds = [
    ...defaultFeatureIds,
    ...sanitizeAddedFeatureIds(addedFeatureIds),
  ];
  return visibleIds
    .map(id => allFeatures.find(feature => feature.id === id))
    .filter((feature): feature is FeatureDefinition => Boolean(feature));
}

export function getOptionalFeatures(): FeatureDefinition[] {
  return allFeatures.filter(feature => !defaultFeatureIds.includes(feature.id as typeof defaultFeatureIds[number]));
}

export function debugFeatureClick(feature: FeatureDefinition) {
  if (!import.meta.env.DEV) return;
  console.debug('[FeatureSelect]', {
    id: feature.id,
    title: feature.title,
    step: feature.step,
    componentName: feature.componentName,
  });
}

function sanitizeAddedFeatureIds(featureIds: unknown[]): string[] {
  const validIds = new Set(allFeatures.map(feature => feature.id));
  const defaultIds = new Set<string>(defaultFeatureIds);
  return Array.from(new Set(featureIds))
    .filter((id): id is string => typeof id === 'string')
    .filter(id => validIds.has(id) && !defaultIds.has(id) && !blockedFeatureIds.has(id));
}

function validateFeatureRegistry() {
  const ids = allFeatures.map(feature => feature.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) {
    console.warn('[FeatureRegistry] duplicate feature ids', duplicates);
  }

  const missingDefaults = defaultFeatureIds.filter(id => !ids.includes(id));
  if (missingDefaults.length > 0) {
    console.warn('[FeatureRegistry] default feature ids missing from allFeatures', missingDefaults);
  }

  for (const feature of allFeatures) {
    if (!feature.id || !feature.title || !feature.step || !feature.componentName) {
      console.warn('[FeatureRegistry] incomplete feature mapping', feature);
    }
  }
}

if (import.meta.env.DEV) {
  validateFeatureRegistry();
}
