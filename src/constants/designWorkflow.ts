import { GenerationStep, type DesignWorkflowStageKey } from '../types';

export interface DesignWorkflowStageDefinition {
  key: DesignWorkflowStageKey;
  label: string;
  shortLabel: string;
  generationStep: GenerationStep | null;
}

export const designWorkflowStages: DesignWorkflowStageDefinition[] = [
  { key: 'input', label: '输入图纸或白模', shortLabel: '输入', generationStep: null },
  { key: 'base-render', label: '基础效果图', shortLabel: '基础图', generationStep: GenerationStep.FloorplanTo3D },
  { key: 'design-variants', label: '方案变体', shortLabel: '变体', generationStep: GenerationStep.DesignVariants },
  { key: 'material-replace', label: '材质替换', shortLabel: '材质', generationStep: GenerationStep.MaterialReplace },
  { key: 'object-insert', label: '元素植入', shortLabel: '元素', generationStep: GenerationStep.ObjectInsert },
  { key: 'continuous-edit', label: '连续修改', shortLabel: '连续修改', generationStep: null },
  { key: 'image-polish', label: '质感提升', shortLabel: '提质', generationStep: GenerationStep.ImagePolish },
  { key: 'delivery', label: '汇报和分享', shortLabel: '交付', generationStep: null },
];

export function getDesignWorkflowStageForStep(
  step: GenerationStep,
): DesignWorkflowStageKey | null {
  if (step === GenerationStep.FloorplanTo3D || step === GenerationStep.ModelSnapshotRender) {
    return 'base-render';
  }
  return designWorkflowStages.find(stage => stage.generationStep === step)?.key || null;
}

export function getDesignWorkflowStage(
  key: DesignWorkflowStageKey,
) {
  return designWorkflowStages.find(stage => stage.key === key);
}

export function getNextDesignWorkflowStage(
  key: DesignWorkflowStageKey,
) {
  const index = designWorkflowStages.findIndex(stage => stage.key === key);
  return index >= 0 ? designWorkflowStages[index + 1] || null : null;
}
