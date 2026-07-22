import { describe, expect, it } from 'vitest';
import { normalizeGenerationTaskStatus, readGenerationProgressLabel } from './normalizeGenerationResult';

describe('normalizeGenerationTaskStatus', () => {
  it('maps every backend lifecycle phase to the shared UI status', () => {
    expect(normalizeGenerationTaskStatus({ generationStatus: 'uploading' })).toBe('submitting');
    expect(normalizeGenerationTaskStatus({ jobStatus: 'queued' })).toBe('queued');
    expect(normalizeGenerationTaskStatus({ phase: 'prepare-input' })).toBe('processing');
    expect(normalizeGenerationTaskStatus({ phase: 'provider-request' })).toBe('generating');
    expect(normalizeGenerationTaskStatus({ phase: 'save-result' })).toBe('saving');
    expect(normalizeGenerationTaskStatus({ jobStatus: 'succeeded' })).toBe('completed');
    expect(normalizeGenerationTaskStatus({ jobStatus: 'failed' })).toBe('failed');
    expect(normalizeGenerationTaskStatus({ jobStatus: 'cancelled' })).toBe('cancelled');
  });

  it('provides stable Chinese labels for shared progress UI', () => {
    expect(readGenerationProgressLabel('queued')).toBe('任务排队中');
    expect(readGenerationProgressLabel('saving')).toBe('正在保存生成结果');
    expect(readGenerationProgressLabel('completed')).toBe('生成完成');
  });
});
