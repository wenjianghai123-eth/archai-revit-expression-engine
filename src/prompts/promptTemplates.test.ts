import { describe, expect, it } from 'vitest';
import { GenerationStep } from '../types';
import {
  applyPromptTemplateVariables,
  filterPromptTemplates,
  mergePromptTemplate,
  WORKSPACE_PROMPT_TEMPLATES,
} from './promptTemplates';

describe('workspace prompt templates', () => {
  it('filters templates by current mode and edit target', () => {
    expect(filterPromptTemplates({ step: GenerationStep.FloorplanTo3D }).every(item => item.category === '平面彩平')).toBe(true);
    expect(filterPromptTemplates({ step: GenerationStep.LocalInpainting, editTarget: 'furniture' }).every(item => item.category === '家具修改')).toBe(true);
  });

  it('searches title description and tags', () => {
    expect(filterPromptTemplates({ step: GenerationStep.LocalInpainting, category: '全部', query: '参考图' }).length).toBeGreaterThan(0);
    expect(filterPromptTemplates({ step: GenerationStep.StyleRender, category: '全部', query: '结构稳定' }).some(item => item.title === '结构稳定渲染')).toBe(true);
  });

  it('replaces variables and preserves missing placeholders', () => {
    const template = WORKSPACE_PROMPT_TEMPLATES.find(item => item.id === 'style-stable-render');
    expect(template).toBeTruthy();
    const prompt = applyPromptTemplateVariables(template!, { 设计风格: '侘寂风格' });
    expect(prompt).toContain('侘寂风格');
    expect(applyPromptTemplateVariables({ ...template!, prompt: '保留 {{未知变量}}' }, {})).toContain('{{未知变量}}');
  });

  it('does not silently overwrite existing prompt', () => {
    expect(mergePromptTemplate('已有内容', '模板内容', 'append')).toContain('已有内容\n\n模板内容');
    expect(mergePromptTemplate('已有内容', '模板内容', 'replace')).toBe('模板内容');
  });
});
