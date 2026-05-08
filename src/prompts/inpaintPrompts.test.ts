import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIGS, PROMPT_TEMPLATES } from '../constants';
import { GenerationStep } from '../types';
import { buildInpaintPrompt } from './inpaintPrompts';

describe('buildInpaintPrompt', () => {
  it('keeps the local inpainting textarea empty by default', () => {
    expect(DEFAULT_CONFIGS[GenerationStep.LocalInpainting].prompt).toBe('');
    expect(DEFAULT_CONFIGS[GenerationStep.LocalInpainting].prompt).not.toContain('仅对选定区域进行局部重绘');
  });

  it('keeps inpaint templates focused on user tasks rather than system constraints', () => {
    const inpaintTemplates = PROMPT_TEMPLATES.filter(template => template.feature === 'inpaint');

    expect(inpaintTemplates.length).toBeGreaterThan(0);
    for (const template of inpaintTemplates) {
      expect(template.promptText).not.toContain('请仅');
      expect(template.promptText).not.toContain('未选区域');
      expect(template.config.prompt || '').not.toContain('仅');
      expect(template.config.prompt || '').not.toContain('未选区域');
    }
  });

  it('builds prompt-only inpaint instructions without mask-only constraints', () => {
    const prompt = buildInpaintPrompt({
      userPrompt: '将地板替换为所上传的材质贴图',
      hasMask: false,
      useFullImageMask: false,
      hasMaterialReference: false,
    });

    expect(prompt).toContain('用户未提供 mask / 涂抹区域');
    expect(prompt).toContain('可以进行局部或全局智能编辑');
    expect(prompt).toContain('用户具体修改需求：将地板替换为所上传的材质贴图');
    expect(prompt).not.toContain('严格优先修改 mask');
  });

  it('builds mask constrained inpaint instructions when a mask exists', () => {
    const prompt = buildInpaintPrompt({
      userPrompt: '把墙面改成浅米色微水泥质感',
      hasMask: true,
      useFullImageMask: false,
      hasMaterialReference: false,
    });

    expect(prompt).toContain('严格优先修改 mask 白色区域或用户标注区域');
    expect(prompt).toContain('用户具体修改需求：把墙面改成浅米色微水泥质感');
  });

  it('adds material reference instructions when materials are uploaded', () => {
    const prompt = buildInpaintPrompt({
      userPrompt: '将地板替换为所上传的材质贴图',
      hasMask: false,
      useFullImageMask: false,
      hasMaterialReference: true,
    });

    expect(prompt).toContain('材质贴图作为材质、纹理、颜色、质感');
  });
});
