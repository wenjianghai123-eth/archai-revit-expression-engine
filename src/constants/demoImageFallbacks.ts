import { GenerationStep } from '../types';

export interface DemoImageFallback {
  id: string;
  featureId: string;
  localSrc?: string;
  previousUiSrc?: string;
  fallbackSrc?: string;
  finalFallbackSrc: string;
  alt: string;
  attribution?: string;
  isDemoAsset: boolean;
}

const previousUiImages = {
  hero: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=1600',
  comparisonSource: 'https://images.unsplash.com/photo-1600607687644-c7171b42498f?auto=format&fit=crop&q=80&w=800',
  comparisonResult: 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&q=80&w=800',
  floorPlan: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&q=80&w=900',
  freeReference: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&q=80&w=900',
  materialReplace: 'https://images.unsplash.com/photo-1600566752355-35792bedcfea?auto=format&fit=crop&q=80&w=900',
  objectInsert: 'https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&q=80&w=900',
  schemeVariant: 'https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&q=80&w=900',
  imagePolish: 'https://images.unsplash.com/photo-1600566753151-384129cf4e3e?auto=format&fit=crop&q=80&w=900',
  modelRender: 'https://images.unsplash.com/photo-1486718448742-163732cd1544?auto=format&fit=crop&q=80&w=900',
  panorama: 'https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&q=80&w=900',
} as const;

const projectDemoImages = {
  floorPlanDrawing: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&q=82&w=1400',
  nordicInterior: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&q=82&w=1400',
  refinedInterior: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&q=82&w=1400',
  materialInterior: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&q=82&w=1400',
} as const;

export const demoImageFallbacks = {
  home_hero: {
    id: 'home_hero',
    featureId: 'home_hero',
    localSrc: '/cases/home-hero.jpg',
    previousUiSrc: previousUiImages.hero,
    fallbackSrc: previousUiImages.panorama,
    finalFallbackSrc: '/cases/fallback-panorama.jpg',
    alt: '现代建筑设计智能表达工作台主视觉',
    attribution: '原 ArchAI UI 建筑演示素材（Unsplash）',
    isDemoAsset: true,
  },
  comparison_source: {
    id: 'comparison_source',
    featureId: 'material_replace',
    localSrc: '/cases/client-iteration-source.jpg',
    previousUiSrc: previousUiImages.comparisonSource,
    finalFallbackSrc: '/cases/fallback-comparison-source.jpg',
    alt: '同一室内空间设计修改前演示参考图',
    attribution: '原 ArchAI UI Before 演示素材（Unsplash）',
    isDemoAsset: true,
  },
  comparison_result: {
    id: 'comparison_result',
    featureId: 'material_replace',
    localSrc: '/cases/client-iteration-result.jpg',
    previousUiSrc: previousUiImages.comparisonResult,
    finalFallbackSrc: '/cases/fallback-comparison-result.jpg',
    alt: '同一室内空间设计修改后演示效果图',
    attribution: '原 ArchAI UI After 演示素材（Unsplash）',
    isDemoAsset: true,
  },
  floor_plan_color: {
    id: 'floor_plan_color',
    featureId: 'floor_plan_color',
    localSrc: '/cases/floor-plan-report-result.jpg',
    previousUiSrc: projectDemoImages.floorPlanDrawing,
    fallbackSrc: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&q=76&w=1800',
    finalFallbackSrc: '/cases/fallback-floor-plan.jpg',
    alt: '建筑平面图与彩平表达功能示例',
    attribution: '原 ArchAI 平面彩平与图纸表达素材（Unsplash）',
    isDemoAsset: true,
  },
  free_reference_image: {
    id: 'free_reference_image',
    featureId: 'free_reference_image',
    localSrc: '/cases/free-reference-image-result.jpg',
    previousUiSrc: previousUiImages.freeReference,
    fallbackSrc: projectDemoImages.nordicInterior,
    finalFallbackSrc: '/cases/fallback-free-reference.jpg',
    alt: '现代室内空间多参考生成功能示例',
    attribution: '原 ArchAI 自由参考生图入口素材（Unsplash）',
    isDemoAsset: true,
  },
  material_replace: {
    id: 'material_replace',
    featureId: 'material_replace',
    localSrc: '/cases/material-replace-result.jpg',
    previousUiSrc: previousUiImages.materialReplace,
    fallbackSrc: projectDemoImages.materialInterior,
    finalFallbackSrc: '/cases/fallback-interior.jpg',
    alt: '室内墙地面材质替换功能示例',
    attribution: '原 ArchAI 材质替换入口素材（Unsplash）',
    isDemoAsset: true,
  },
  object_insert: {
    id: 'object_insert',
    featureId: 'object_insert',
    localSrc: '/cases/object-insert-result.jpg',
    previousUiSrc: previousUiImages.objectInsert,
    fallbackSrc: projectDemoImages.nordicInterior,
    finalFallbackSrc: '/cases/fallback-object-insert.jpg',
    alt: '家具、绿植与装饰元素植入功能示例',
    attribution: '原 ArchAI 元素植入入口素材（Unsplash）',
    isDemoAsset: true,
  },
  scheme_variant: {
    id: 'scheme_variant',
    featureId: 'scheme_variant',
    localSrc: '/cases/scheme-variant-result.jpg',
    previousUiSrc: previousUiImages.schemeVariant,
    fallbackSrc: projectDemoImages.refinedInterior,
    finalFallbackSrc: '/cases/fallback-scheme-variant.jpg',
    alt: '同一室内空间多方案风格比选示例',
    attribution: '原 ArchAI 方案变体入口素材（Unsplash）',
    isDemoAsset: true,
  },
  image_polish: {
    id: 'image_polish',
    featureId: 'image_polish',
    localSrc: '/cases/image-polish-result.jpg',
    previousUiSrc: previousUiImages.imagePolish,
    fallbackSrc: projectDemoImages.refinedInterior,
    finalFallbackSrc: '/cases/fallback-image-polish.jpg',
    alt: '室内效果图写实质感提升功能示例',
    attribution: '原 ArchAI 质感提升入口素材（Unsplash）',
    isDemoAsset: true,
  },
  model_snapshot_render: {
    id: 'model_snapshot_render',
    featureId: 'model_snapshot_render',
    localSrc: '/cases/white-model-render-result.jpg',
    previousUiSrc: previousUiImages.modelRender,
    fallbackSrc: previousUiImages.hero,
    finalFallbackSrc: '/cases/fallback-model-render.jpg',
    alt: '建筑白模与材质化效果快速渲染示例',
    attribution: '原 ArchAI 白模快渲入口素材（Unsplash）',
    isDemoAsset: true,
  },
  panorama_render: {
    id: 'panorama_render',
    featureId: 'panorama_quick_render',
    localSrc: '/cases/panorama-render-result.jpg',
    previousUiSrc: previousUiImages.panorama,
    fallbackSrc: previousUiImages.freeReference,
    finalFallbackSrc: '/cases/fallback-panorama.jpg',
    alt: '现代商业建筑与空间全景快速渲染示例',
    attribution: '原 ArchAI 全景快渲入口素材（Unsplash）',
    isDemoAsset: true,
  },
  project_cover: {
    id: 'project_cover',
    featureId: 'project_cover',
    localSrc: '/cases/project-cover.jpg',
    previousUiSrc: previousUiImages.schemeVariant,
    fallbackSrc: projectDemoImages.refinedInterior,
    finalFallbackSrc: '/cases/fallback-scheme-variant.jpg',
    alt: '最近设计项目封面示例',
    attribution: 'ArchAI 项目封面演示素材（Unsplash）',
    isDemoAsset: true,
  },
  template_library: {
    id: 'template_library',
    featureId: 'template_library',
    localSrc: '/cases/template-library.jpg',
    previousUiSrc: previousUiImages.freeReference,
    fallbackSrc: projectDemoImages.nordicInterior,
    finalFallbackSrc: '/cases/fallback-free-reference.jpg',
    alt: '设计表达模板缩略图示例',
    attribution: 'ArchAI 模板演示素材（Unsplash）',
    isDemoAsset: true,
  },
} satisfies Record<string, DemoImageFallback>;

export type DemoImageFallbackId = keyof typeof demoImageFallbacks;

const featureImageFallbackIds: Record<string, DemoImageFallbackId> = {
  floor_plan_color: 'floor_plan_color',
  floorplan: 'floor_plan_color',
  'plan-colorize': 'floor_plan_color',
  drawing_expression: 'floor_plan_color',
  free_reference_image: 'free_reference_image',
  style_render: 'free_reference_image',
  'style-render': 'free_reference_image',
  'free-reference-image': 'free_reference_image',
  material_replace: 'material_replace',
  'material-replace': 'material_replace',
  local_inpainting: 'material_replace',
  inpaint: 'material_replace',
  object_insert: 'object_insert',
  'object-insert': 'object_insert',
  scheme_variant: 'scheme_variant',
  'design-variants': 'scheme_variant',
  image_polish: 'image_polish',
  'image-polish': 'image_polish',
  model_snapshot_render: 'model_snapshot_render',
  'model-render': 'model_snapshot_render',
  panorama_quick_render: 'panorama_render',
  'panorama-roam-render': 'panorama_render',
};

export function getFeatureDemoImage(featureId: string): DemoImageFallback | null {
  const imageId = featureImageFallbackIds[featureId];
  return imageId ? demoImageFallbacks[imageId] : null;
}

export function getGenerationStepDemoImage(step: GenerationStep): DemoImageFallback {
  if (step === GenerationStep.FloorplanTo3D || step === GenerationStep.PlanColorize) return demoImageFallbacks.floor_plan_color;
  if (step === GenerationStep.FreeReferenceImage || step === GenerationStep.StyleRender) return demoImageFallbacks.free_reference_image;
  if (step === GenerationStep.MaterialReplace || step === GenerationStep.LocalInpainting) return demoImageFallbacks.material_replace;
  if (step === GenerationStep.ObjectInsert) return demoImageFallbacks.object_insert;
  if (step === GenerationStep.DesignVariants) return demoImageFallbacks.scheme_variant;
  if (step === GenerationStep.ImagePolish) return demoImageFallbacks.image_polish;
  if (step === GenerationStep.ModelSnapshotRender) return demoImageFallbacks.model_snapshot_render;
  if (step === GenerationStep.PanoramaQuickRender) return demoImageFallbacks.panorama_render;
  return demoImageFallbacks.project_cover;
}
