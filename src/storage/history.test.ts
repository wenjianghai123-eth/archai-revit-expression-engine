import { beforeEach, describe, expect, it } from 'vitest';
import { GenerationStep } from '../types';
import { clearGenerationHistory, listGenerationRecords, saveGenerationRecord } from './history';

describe('generation history storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('saves input image fields with a generation record', () => {
    saveGenerationRecord({
      id: 'generation-1',
      projectId: 'project-1',
      step: GenerationStep.StyleRender,
      prompt: 'render prompt',
      style: '现代',
      createdAt: '2026-05-13 10:00:00',
      provider: 'mock',
      outputImage: '/uploads/output.png',
      inputImageUrl: '/uploads/input.png',
      inputImageAssetId: 'asset-input-1',
      inputImageName: 'input.png',
    });

    const records = listGenerationRecords();

    expect(records[0]).toMatchObject({
      inputImageUrl: '/uploads/input.png',
      inputImageAssetId: 'asset-input-1',
      outputImage: '/uploads/output.png',
    });
  });

  it('reads old records that do not have input image fields', () => {
    window.localStorage.setItem('archai:generation-history:v1', JSON.stringify([{
      id: 'legacy-generation',
      step: GenerationStep.StyleRender,
      prompt: 'legacy prompt',
      style: '现代',
      createdAt: '2026-05-13 10:00:00',
      provider: 'mock',
      outputImage: '/uploads/output.png',
    }]));

    const records = listGenerationRecords();

    expect(records).toHaveLength(1);
    expect(records[0].inputImageUrl).toBeUndefined();
  });

  it('clears history records', () => {
    clearGenerationHistory();
    expect(listGenerationRecords()).toEqual([]);
  });
});
