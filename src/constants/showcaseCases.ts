import { demoImageFallbacks } from './demoImageFallbacks';

export interface ShowcaseCase {
  id: string;
  title: string;
  description: string;
  sourceImage: string;
  resultImage: string;
  sourcePreviousUi?: string;
  resultPreviousUi?: string;
  sourceFallback?: string;
  resultFallback?: string;
  sourceFinalFallback?: string;
  resultFinalFallback?: string;
  sourceAlt?: string;
  resultAlt?: string;
  fallbackIsDemoAsset?: boolean;
  featureId: string;
  scenario: string;
  highlights: string[];
}

export const showcaseCases: ShowcaseCase[] = [
  {
    id: 'client-iteration',
    title: '客户连续改稿演示',
    description: '通过原 UI 中已经使用的演示素材，展示同一方案从参考图到修改效果的查看流程。',
    sourceImage: demoImageFallbacks.comparison_source.localSrc || '',
    resultImage: demoImageFallbacks.comparison_result.localSrc || '',
    sourcePreviousUi: demoImageFallbacks.comparison_source.previousUiSrc,
    resultPreviousUi: demoImageFallbacks.comparison_result.previousUiSrc,
    sourceFinalFallback: demoImageFallbacks.comparison_source.finalFallbackSrc,
    resultFinalFallback: demoImageFallbacks.comparison_result.finalFallbackSrc,
    sourceAlt: demoImageFallbacks.comparison_source.alt,
    resultAlt: demoImageFallbacks.comparison_result.alt,
    fallbackIsDemoAsset: true,
    featureId: 'material_replace',
    scenario: '客户连续改稿',
    highlights: ['保留已确认修改', '版本可比较', '支持继续精修'],
  },
  {
    id: 'floor-plan-report',
    title: '平面图汇报表达',
    description: '从黑白平面图到可用于方案沟通的彩平表达。',
    sourceImage: '/cases/floor-plan-report-source.jpg',
    resultImage: demoImageFallbacks.floor_plan_color.localSrc || '',
    resultPreviousUi: demoImageFallbacks.floor_plan_color.previousUiSrc,
    resultFallback: demoImageFallbacks.floor_plan_color.fallbackSrc,
    resultFinalFallback: demoImageFallbacks.floor_plan_color.finalFallbackSrc,
    sourceAlt: '平面图汇报表达原始图纸',
    resultAlt: demoImageFallbacks.floor_plan_color.alt,
    fallbackIsDemoAsset: true,
    featureId: 'floor_plan_color',
    scenario: '快速做汇报',
    highlights: ['保留空间布局', '区域材质清晰', '适合汇报对比'],
  },
  {
    id: 'white-model-render',
    title: '白模快速出图',
    description: '从确认视角的白模截图快速形成设计效果图。',
    sourceImage: '/cases/white-model-render-source.jpg',
    resultImage: demoImageFallbacks.model_snapshot_render.localSrc || '',
    resultPreviousUi: demoImageFallbacks.model_snapshot_render.previousUiSrc,
    resultFallback: demoImageFallbacks.model_snapshot_render.fallbackSrc,
    resultFinalFallback: demoImageFallbacks.model_snapshot_render.finalFallbackSrc,
    sourceAlt: '白模快速出图原始模型截图',
    resultAlt: demoImageFallbacks.model_snapshot_render.alt,
    fallbackIsDemoAsset: true,
    featureId: 'model_snapshot_render',
    scenario: '白模快速出图',
    highlights: ['保持相机视角', '快速形成氛围', '可继续材质修改'],
  },
];

export function getShowcaseCaseForFeature(featureId: string): ShowcaseCase | null {
  return showcaseCases.find(showcaseCase => showcaseCase.featureId === featureId) || null;
}

export function isShowcaseDemoEnabled(isDevelopment: boolean, configuredValue?: string): boolean {
  return isDevelopment || configuredValue === 'true';
}
