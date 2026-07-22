import type { GenerationHistoryItem } from '../../types';
import { GenerationStep } from '../../types';
import type { RecentProjectSummary } from './homeTypes';

export function buildRecentProjectSummary(historyItems: GenerationHistoryItem[]): RecentProjectSummary | null {
  const linkedItems = historyItems
    .filter((item): item is GenerationHistoryItem & { projectId: string } => Boolean(item.projectId))
    .slice()
    .sort((left, right) => readTimestamp(right.createdAt) - readTimestamp(left.createdAt));
  const latest = linkedItems[0];
  if (!latest) return null;

  const projectItems = linkedItems.filter(item => item.projectId === latest.projectId);
  return {
    id: latest.projectId,
    name: latest.projectName?.trim() || `项目 ${latest.projectId.slice(0, 8)}`,
    updatedAt: latest.createdAt,
    generationCount: projectItems.length,
    currentStage: readGenerationStepLabel(latest.step),
    thumbnail: latest.outputImage || null,
  };
}

export function readGenerationStepLabel(step: GenerationStep): string {
  if (step === GenerationStep.FloorplanTo3D) return '图纸表达中心';
  if (step === GenerationStep.StyleRender) return '快速风格';
  if (step === GenerationStep.PlanColorize) return '图纸智能表达';
  if (step === GenerationStep.ModelSnapshotRender) return '白模快渲';
  if (step === GenerationStep.PanoramaQuickRender) return '漫游全景快渲';
  if (step === GenerationStep.ObjectInsert) return '元素植入';
  if (step === GenerationStep.FreeReferenceImage) return '自由参考生图';
  if (step === GenerationStep.ImagePolish) return '质感提升';
  if (step === GenerationStep.MaterialReplace) return '材质软装替换';
  if (step === GenerationStep.DesignVariants) return '方案变体';
  return '局部修饰';
}

export function formatHomeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function readTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
