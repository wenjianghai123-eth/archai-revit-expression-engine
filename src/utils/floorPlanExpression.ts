import type {
  FloorPlanExpressionMode,
  FloorPlanRegion,
  FloorPlanTextLanguage,
  GenerationConfig,
  SaveFloorPlanRegionMaterialInput,
} from '../types';

export const floorPlanExpressionModes: Array<{ value: FloorPlanExpressionMode; label: string; description: string }> = [
  { value: 'precise-material', label: '精准材质彩平', description: '识别并校正区域，按 regionId 精确映射材质。' },
  { value: 'three-dimensional', label: '三维彩平', description: '保持平面结构，增强材质、家具与空间层次。' },
  { value: 'analysis', label: '分析表达图', description: '生成分区、动线、标注等分析型图纸表达。' },
  { value: 'multi-option', label: '多方案彩平', description: '基于同一图纸批量形成可比较的表达方案。' },
];

export const floorPlanTextLanguageOptions: Array<{ value: FloorPlanTextLanguage; label: string }> = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en', label: '英文' },
  { value: 'none', label: '不生成文字' },
];

export function resolveFloorPlanExpressionMode(config: GenerationConfig): FloorPlanExpressionMode {
  if (config.floorPlanExpressionMode) return config.floorPlanExpressionMode;
  if (config.floorplanOutputMode === 'multi' || config.planColorizeBatchEnabled === true) return 'multi-option';
  if (config.template === 'zoning-color' || config.template === 'annotation-plan' || config.template === 'circulation-analysis') return 'analysis';
  if (config.floorplanRenderMode === 'flat-color') return 'precise-material';
  return 'three-dimensional';
}

export function buildFloorPlanExpressionModePatch(mode: FloorPlanExpressionMode, config: GenerationConfig): Partial<GenerationConfig> {
  if (mode === 'precise-material') {
    return {
      floorPlanExpressionMode: mode,
      floorplanOutputMode: 'single',
      floorplanRenderMode: 'flat-color',
      planColorizeBatchEnabled: false,
      batchCount: 1,
      template: 'colored-plan',
      lineworkPreservation: 'strict',
      preserveLinework: true,
    };
  }
  if (mode === 'three-dimensional') {
    return {
      floorPlanExpressionMode: mode,
      floorplanOutputMode: 'single',
      floorplanRenderMode: 'semi-3d',
      planColorizeBatchEnabled: false,
      batchCount: 1,
      template: 'colored-plan',
      lineworkPreservation: config.lineworkPreservation || 'high',
      preserveLinework: true,
    };
  }
  if (mode === 'analysis') {
    return {
      floorPlanExpressionMode: mode,
      floorplanOutputMode: 'single',
      floorplanRenderMode: 'presentation',
      planColorizeBatchEnabled: false,
      batchCount: 1,
      template: 'zoning-color',
      enableZoningColor: true,
      preserveLinework: true,
    };
  }
  return {
    floorPlanExpressionMode: mode,
    floorplanOutputMode: 'multi',
    floorplanRenderMode: config.floorplanRenderMode || 'semi-3d',
    planColorizeBatchEnabled: true,
    batchCount: config.batchCount === 2 || config.batchCount === 6 ? config.batchCount : 4,
    preserveLinework: true,
  };
}

export function isFloorPlanMaterialComplete(material: SaveFloorPlanRegionMaterialInput): boolean {
  if (material.fallbackMode === 'reference') return Boolean(material.materialAssetId);
  if (material.fallbackMode === 'default') return true;
  return material.materialName.trim().length > 0;
}

export function findAdjacentFloorPlanRegionIds(regions: FloorPlanRegion[], targetRegionId: string, tolerance = 0.025): string[] {
  const target = regions.find(region => region.id === targetRegionId);
  if (!target) return [];
  const targetBounds = polygonBounds(target.polygon);
  return regions
    .filter(region => region.id !== targetRegionId)
    .filter(region => boundsDistance(targetBounds, polygonBounds(region.polygon)) <= tolerance)
    .sort((a, b) => boundsDistance(targetBounds, polygonBounds(a.polygon)) - boundsDistance(targetBounds, polygonBounds(b.polygon)))
    .map(region => region.id);
}

function polygonBounds(polygon: FloorPlanRegion['polygon']) {
  const xs = polygon.map(point => point[0]);
  const ys = polygon.map(point => point[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

function boundsDistance(a: ReturnType<typeof polygonBounds>, b: ReturnType<typeof polygonBounds>): number {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
  return Math.hypot(dx, dy);
}
