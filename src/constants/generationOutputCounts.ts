export const DEFAULT_GENERATION_OUTPUT_COUNT = 1 as const;

export const GENERATION_OUTPUT_COUNT_OPTIONS = [1, 2, 4] as const;

export function normalizeGenerationOutputCount<T extends number>(
  value: unknown,
  allowedCounts: readonly T[],
): T {
  return allowedCounts.includes(value as T) ? value as T : allowedCounts[0];
}
