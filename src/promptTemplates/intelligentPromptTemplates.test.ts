import { describe, expect, it } from 'vitest';
import { buildSmartPrompt, readSmartPromptUserSupplement } from './intelligentPromptTemplates';

describe('intelligent prompt templates', () => {
  it('builds a stable floorplan prompt without user text', () => {
    const prompt = buildSmartPrompt({
      mode: 'floorplan',
      config: {
        buildingType: '住宅',
        spaceType: '客厅',
        renderStyle: '写实彩平',
        smartMaterial: '浅木色',
        lighting: '自然日光',
        changeStrength: 'medium',
        prompt: '',
      },
    });

    expect(prompt).toContain('专业的室内平面彩平图');
    expect(prompt).toContain('Building type: 住宅.');
    expect(prompt).toContain('Main material direction: 浅木色.');
    expect(prompt).toContain('用户未输入补充要求');
  });

  it('treats visible text as supplemental requirements', () => {
    const prompt = buildSmartPrompt({
      mode: 'model-render',
      config: {
        buildingType: '办公',
        spaceType: '大堂',
        renderStyle: '现代极简',
        smartMaterial: '浅色石材',
        atmosphere: '高级灯光',
        customPrompt: '入口增加接待台',
      },
    });

    expect(prompt).toContain('The input image is a 3D clay or white model viewport snapshot');
    expect(prompt).toContain('Design style: 现代极简.');
    expect(prompt).toContain('User extra requirements: 入口增加接待台');
  });

  it('reads the right supplemental field per feature', () => {
    expect(readSmartPromptUserSupplement('material-replace', {
      prompt: '旧 prompt',
      customMaterialPrompt: '只替换墙面',
    })).toBe('只替换墙面');
    expect(readSmartPromptUserSupplement('plan-colorize', {
      prompt: '旧 prompt',
      customPrompt: '标出主要动线',
    })).toBe('标出主要动线');
    expect(readSmartPromptUserSupplement('model-render', {
      prompt: '历史模板',
      userPrompt: '只补充入口雨棚',
    }, '内部 prompt')).toBe('只补充入口雨棚');
  });
});
