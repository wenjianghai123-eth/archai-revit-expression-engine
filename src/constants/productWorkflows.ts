import { GenerationStep, type ResultSendTargetStep, type SecondaryEditAction } from '../types';

export type WorkflowCategory = '快速形成方案' | '精细修改方案' | '形成交付成果';
export type FeatureMaturity = '稳定可用' | '演示增强' | '持续优化';

export interface ScenarioWorkflow {
  id: 'quick-report' | 'client-iteration' | 'multi-option-review' | 'white-model-render';
  title: string;
  description: string;
  entryFeatureId: string;
  entryStep: GenerationStep;
  steps: string[];
}

export const workflowCategories: WorkflowCategory[] = [
  '快速形成方案',
  '精细修改方案',
  '形成交付成果',
];

export const scenarioWorkflows: ScenarioWorkflow[] = [
  {
    id: 'quick-report',
    title: '快速做汇报',
    description: '从图纸表达开始，快速形成可比较、可打印的汇报内容。',
    entryFeatureId: 'drawing_expression',
    entryStep: GenerationStep.PlanColorize,
    steps: ['图纸表达', '多方案', 'PDF 汇报'],
  },
  {
    id: 'client-iteration',
    title: '客户连续改稿',
    description: '先上传客户确认图，再进入连续修改、对比与高清定稿。',
    entryFeatureId: 'material_replace',
    entryStep: GenerationStep.MaterialReplace,
    steps: ['连续修改', '版本对比', '高清定稿'],
  },
  {
    id: 'multi-option-review',
    title: '多方案比选',
    description: '基于同一输入生成多个方向，快速完成内部或客户比选。',
    entryFeatureId: 'scheme_variant',
    entryStep: GenerationStep.DesignVariants,
    steps: ['方案变体', '材质替换', 'PDF 汇报'],
  },
  {
    id: 'white-model-render',
    title: '白模快速出图',
    description: '从白模视角出图开始，逐步完成方案变化和细节完善。',
    entryFeatureId: 'model_snapshot_render',
    entryStep: GenerationStep.ModelSnapshotRender,
    steps: ['白模快渲', '方案变体', '材质替换', '元素植入', '质感提升'],
  },
];

export function getScenarioWorkflow(id: string | null | undefined): ScenarioWorkflow | null {
  return scenarioWorkflows.find(scenario => scenario.id === id) || null;
}

export type ResultRecommendation =
  | {
      id: string;
      label: string;
      kind: 'send';
      targetStep: ResultSendTargetStep;
    }
  | {
      id: string;
      label: string;
      kind: 'secondary';
      action: SecondaryEditAction;
    }
  | {
      id: string;
      label: string;
      kind: 'utility';
      action: 'download' | 'share' | 'pdf';
    };

export const resultRecommendations: Partial<Record<GenerationStep, ResultRecommendation[]>> = {
  [GenerationStep.FloorplanTo3D]: [
    { id: 'scheme-variant', label: '方案变体', kind: 'send', targetStep: GenerationStep.DesignVariants },
    { id: 'free-reference', label: '自由参考生图', kind: 'send', targetStep: GenerationStep.FreeReferenceImage },
  ],
  [GenerationStep.FreeReferenceImage]: [
    { id: 'material-replace', label: '材质替换', kind: 'send', targetStep: GenerationStep.MaterialReplace },
    { id: 'object-insert', label: '元素植入', kind: 'send', targetStep: GenerationStep.ObjectInsert },
    { id: 'scheme-variant', label: '方案变体', kind: 'send', targetStep: GenerationStep.DesignVariants },
  ],
  [GenerationStep.MaterialReplace]: [
    { id: 'object-insert', label: '元素植入', kind: 'send', targetStep: GenerationStep.ObjectInsert },
    { id: 'continuous-edit', label: '连续修改', kind: 'secondary', action: 'continue-edit' },
    { id: 'image-polish', label: '质感提升', kind: 'send', targetStep: GenerationStep.ImagePolish },
  ],
  [GenerationStep.ObjectInsert]: [
    { id: 'continuous-edit', label: '连续修改', kind: 'secondary', action: 'continue-edit' },
    { id: 'image-polish', label: '质感提升', kind: 'send', targetStep: GenerationStep.ImagePolish },
  ],
  [GenerationStep.DesignVariants]: [
    { id: 'material-replace', label: '材质替换', kind: 'send', targetStep: GenerationStep.MaterialReplace },
    { id: 'continuous-edit', label: '连续修改', kind: 'secondary', action: 'continue-edit' },
    { id: 'pdf-report', label: 'PDF 汇报', kind: 'utility', action: 'pdf' },
  ],
  [GenerationStep.ImagePolish]: [
    { id: 'download', label: '下载', kind: 'utility', action: 'download' },
    { id: 'share', label: '分享', kind: 'utility', action: 'share' },
    { id: 'pdf-report', label: 'PDF 汇报', kind: 'utility', action: 'pdf' },
  ],
};

export function getResultRecommendations(step: GenerationStep): ResultRecommendation[] {
  return resultRecommendations[step] || [];
}
