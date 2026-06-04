import { describe, expect, it } from 'vitest';
import { buildImageSafetyNotice, precheckGenerationExtraPrompt } from './generationSafety';

describe('generation safety precheck', () => {
  it.each(['去水印', '裸露', '枪'])('blocks high-risk prompt term: %s', (term) => {
    const result = precheckGenerationExtraPrompt({ extraPrompt: `请${term}` });
    expect(result.blocked).toBe(true);
    expect(result.matchedTerms.length).toBeGreaterThan(0);
  });

  it.each(['logo', 'watermark', '人像', '品牌标识'])('blocks object insert safety cue: %s', (term) => {
    const result = precheckGenerationExtraPrompt({ extraPrompt: `参考图包含${term}` });
    expect(result.blocked).toBe(true);
  });

  it('allows normal architectural and interior prompt words', () => {
    const result = precheckGenerationExtraPrompt({
      extraPrompt: '优化灯光、墙面、木材、石材、软装、家具和酒店商业空间氛围。',
    });
    expect(result.blocked).toBe(false);
  });

  it('does not block common interior child-room wording', () => {
    const result = precheckGenerationExtraPrompt({ extraPrompt: '儿童房使用浅色木材和柔和灯光。' });
    expect(result.blocked).toBe(false);
  });

  it('does not block compliant no-logo or no-watermark wording', () => {
    const result = precheckGenerationExtraPrompt({ extraPrompt: '生成无品牌、无水印、无人物的家具效果。' });
    expect(result.blocked).toBe(false);
  });

  it('shows a weak warning for object reference images with risky filename cues', () => {
    const notice = buildImageSafetyNotice({ imageName: 'portrait-logo-reference.png', role: 'object_reference' });
    expect(notice?.warningLevel).toBe('caution');
    expect(notice?.matchedTerms).toContain('人物/人像');
  });
});
