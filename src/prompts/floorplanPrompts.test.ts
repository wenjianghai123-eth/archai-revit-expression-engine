import { describe, expect, it } from 'vitest';

import { buildFloorplanColorPrompt, DEFAULT_FLOORPLAN_COLOR_PROMPT } from './floorplanPrompts';

describe('buildFloorplanColorPrompt', () => {
  it('uses the default floorplan color prompt when extra prompt is empty', () => {
    expect(buildFloorplanColorPrompt('')).toBe(DEFAULT_FLOORPLAN_COLOR_PROMPT);
    expect(buildFloorplanColorPrompt('   ')).toBe(DEFAULT_FLOORPLAN_COLOR_PROMPT);
  });

  it('appends user extra requirements without duplicating the default prompt', () => {
    const prompt = buildFloorplanColorPrompt('强化景观铺装层次，住宅区域使用暖色系。');

    expect(prompt.startsWith(DEFAULT_FLOORPLAN_COLOR_PROMPT)).toBe(true);
    expect(prompt).toContain('用户额外要求：\n强化景观铺装层次，住宅区域使用暖色系。');
    expect(prompt.match(/你是一名专业建筑表现设计师/gu)).toHaveLength(1);
  });
});
