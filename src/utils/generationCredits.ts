import type { GenerationMode } from '../types';

export function getGenerationCreditCost(mode: GenerationMode, config: object = {}): number {
  return getGenerationOutputCount(mode, config);
}

export function getGenerationOutputCount(mode: GenerationMode, config: object = {}): number {
  if (mode !== 'design-variants') return 1;
  const batchCount = 'batchCount' in config ? config.batchCount : undefined;
  return isDesignVariantBatchCount(batchCount) ? batchCount : 4;
}

function isDesignVariantBatchCount(value: unknown): value is 2 | 4 | 8 {
  return value === 2 || value === 4 || value === 8;
}
