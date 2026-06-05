import { describe, expect, it } from 'vitest';
import { buildImageSafetyNotice, precheckGenerationExtraPrompt } from './generationSafety';

describe('generation safety compatibility helpers', () => {
  it.each(['人物', '人像', '儿童', '品牌', 'logo', '去水印', '复刻'])('does not block prompt term: %s', (term) => {
    const result = precheckGenerationExtraPrompt({ extraPrompt: `补充要求包含${term}` });
    expect(result.blocked).toBe(false);
    expect(result.matchedTerms).toEqual([]);
    expect(result.message).toBe('');
  });

  it('does not show local image safety notices', () => {
    const notice = buildImageSafetyNotice({ imageName: 'portrait-logo-reference.png', role: 'object_reference' });
    expect(notice).toBeNull();
  });
});
