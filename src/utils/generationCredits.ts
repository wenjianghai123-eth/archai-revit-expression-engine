import type { GenerationMode } from '../types';

export function getGenerationCreditCost(mode: GenerationMode, config: object = {}): number {
  return getGenerationOutputCount(mode, config);
}

export function getGenerationOutputCount(mode: GenerationMode, config: object = {}): number {
  const batchCount = 'batchCount' in config ? config.batchCount : undefined;
  const materialCandidateCount = 'materialCandidateCount' in config ? config.materialCandidateCount : undefined;
  const step = 'step' in config ? config.step : 'generationStep' in config ? config.generationStep : undefined;
  if (step === 'free_reference_image') {
    return batchCount === 2 || batchCount === 4 ? batchCount : 1;
  }
  if (mode === 'material-replace' || step === 'material_replace') {
    const candidateCount = materialCandidateCount ?? batchCount;
    return candidateCount === 2 || candidateCount === 3 || candidateCount === 4 ? candidateCount : 1;
  }
  if (mode === 'floorplan') {
    const outputMode = 'floorplanOutputMode' in config ? config.floorplanOutputMode : undefined;
    if (outputMode === 'multi' && batchCount === 1) return 1;
    if (outputMode === 'multi') return isFloorplanMultiPlanBatchCount(batchCount) ? batchCount : 4;
    return 1;
  }
  if (mode === 'design-variants') {
    return isDesignVariantBatchCount(batchCount) ? batchCount : 4;
  }
  if (mode === 'plan-colorize') {
    const styleIds = 'planColorizeStyleIds' in config ? config.planColorizeStyleIds : undefined;
    if (Array.isArray(styleIds)) {
      const count = styleIds.filter(item => typeof item === 'string' && item.trim().length > 0).length;
      if (count >= 1 && count <= 6) return count;
    }
    return isPlanColorizeBatchCount(batchCount) ? batchCount : 1;
  }
  if (mode === 'inpaint' && isObjectInsertConfig(config)) {
    return isObjectInsertCandidateCount(batchCount) ? batchCount : 1;
  }
  return 1;
}

function isDesignVariantBatchCount(value: unknown): value is 2 | 4 | 8 {
  return value === 2 || value === 4 || value === 8;
}

function isPlanColorizeBatchCount(value: unknown): value is 1 | 2 | 3 | 4 | 5 | 6 {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6;
}

function isFloorplanMultiPlanBatchCount(value: unknown): value is 2 | 4 | 6 {
  return value === 2 || value === 4 || value === 6;
}

function isObjectInsertCandidateCount(value: unknown): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3;
}

function isObjectInsertConfig(config: object): boolean {
  return ('step' in config && config.step === 'object_insert') || ('objectInsert' in config && Boolean(config.objectInsert));
}
