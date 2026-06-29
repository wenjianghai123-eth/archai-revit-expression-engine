import React from 'react';
import { Box, Camera, FileImage, Layers, LayoutGrid, Paintbrush, ScanLine, Sparkles, Wand2 } from 'lucide-react';
import { GenerationStep } from './types';

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
    title: '平面彩平',
    desc: '上传平面图，统一生成彩平、三维彩平或多方案表达。',
    input: '输入：平面图',
    output: '输出：彩平 / 多方案',
    step: GenerationStep.FloorplanTo3D,
    componentName: 'FloorplanTo3DWorkspace',
    icon: ScanLine,
    image: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&q=80&w=900',
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
    image: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&q=80&w=900',
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
    image: 'https://images.unsplash.com/photo-1600566752355-35792bedcfea?auto=format&fit=crop&q=80&w=900',
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
    image: 'https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&q=80&w=900',
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
    image: 'https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&q=80&w=900',
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
    image: 'https://images.unsplash.com/photo-1600566753151-384129cf4e3e?auto=format&fit=crop&q=80&w=900',
  },
  {
    id: 'drawing_expression',
    title: '图纸智能表达',
    desc: '上传 CAD 导出的黑白平面图，生成彩色分区、标注和表达图。',
    input: '输入：黑白平面图',
    output: '输出：彩色图纸表达',
    step: GenerationStep.PlanColorize,
    componentName: 'PlanColorizePanel',
    icon: FileImage,
    image: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&q=80&w=900',
  },
  {
    id: 'style_render',
    title: '参考图风格渲染',
    desc: '基于参考图生成现代、侘寂、北欧、轻奢等建筑与室内效果。',
    input: '输入：参考图',
    output: '输出：风格效果图',
    step: GenerationStep.StyleRender,
    componentName: 'StyleRenderWorkspace',
    icon: Wand2,
    image: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&q=80&w=900',
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
    image: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&q=80&w=900',
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
    image: 'https://images.unsplash.com/photo-1486718448742-163732cd1544?auto=format&fit=crop&q=80&w=900',
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
    image: 'https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&q=80&w=900',
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
  window.localStorage.setItem(visibleFeatureIdsStorageKey, JSON.stringify(sanitizeAddedFeatureIds(featureIds)));
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
