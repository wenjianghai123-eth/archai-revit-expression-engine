import { GenerationStep } from './types';
import type { GenerationMode } from './types';

export const GENERATION_STEP_MODE: Record<GenerationStep, GenerationMode> = {
  [GenerationStep.FloorplanTo3D]: 'floorplan',
  [GenerationStep.StyleRender]: 'style-render',
  [GenerationStep.LocalInpainting]: 'inpaint',
  [GenerationStep.ModelSnapshotRender]: 'model-render',
  [GenerationStep.DesignVariants]: 'design-variants',
  [GenerationStep.MaterialReplace]: 'material-replace',
  [GenerationStep.PlanColorize]: 'plan-colorize',
  [GenerationStep.PanoramaQuickRender]: 'panorama-roam-render',
};

export function getGenerationModeForStep(step: GenerationStep): GenerationMode {
  return GENERATION_STEP_MODE[step];
}

export function calculateGenerationCreditsCostForStep(step: GenerationStep, batchCount: unknown): number {
  const baseCost = step === GenerationStep.LocalInpainting || step === GenerationStep.MaterialReplace ? 8 : 10;
  const outputCount = step === GenerationStep.DesignVariants && (batchCount === 2 || batchCount === 4 || batchCount === 8)
    ? batchCount
    : 1;
  return baseCost * outputCount;
}
