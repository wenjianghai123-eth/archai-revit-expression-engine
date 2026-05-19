import { GenerationStep, PromptTemplate } from '../types';

export const PROMPT_TEMPLATE_CATEGORIES = ['全部', '平面彩平', '风格渲染', '局部修饰', '家具修改', '材质替换', '空间优化'] as const;

export const WORKSPACE_PROMPT_TEMPLATES: PromptTemplate[] = [
  tpl('floorplan-keep-layout', '户型结构彩平', '平面彩平', GenerationStep.FloorplanTo3D, '保持墙体、门窗和家具位置，生成清晰彩平表达。', ['彩平', '户型', '结构'], '请基于原始平面图生成专业彩平效果。严格保持户型结构、墙体、门窗、开口、柱体、家具位置和比例不变。材质分区清晰，公共区域、卧室、厨房、卫生间表达有区分，画面干净适合汇报。'),
  tpl('floorplan-material-zoning', '材质分区彩平', '平面彩平', GenerationStep.FloorplanTo3D, '突出地面、墙体和功能区域材质分区。', ['材质', '分区', '平面'], '在保持原平面布局不变的前提下，强化{{空间类型}}的彩平材质表达。公共空间使用{{材质}}，卧室和辅助空间保持温和克制，门窗、墙体和家具轮廓必须与原图一致。', [{ key: '空间类型', label: '空间类型', defaultValue: '住宅空间' }, { key: '材质', label: '主材质', defaultValue: '浅色石材与木地板' }]),
  tpl('style-stable-render', '结构稳定渲染', '风格渲染', GenerationStep.StyleRender, '在不改变构图和视角的前提下转换风格。', ['渲染', '风格', '稳定'], '请将当前空间渲染为{{设计风格}}。严格保持原图空间结构、相机视角、透视关系、构图边界、门窗位置和主要家具比例不变。只调整材质、色彩、灯光氛围和软装质感，输出真实干净的设计效果图。', [{ key: '设计风格', label: '设计风格', defaultValue: '现代自然风格' }]),
  tpl('style-atmosphere-upgrade', '氛围提升渲染', '空间优化', GenerationStep.StyleRender, '优化光影、软装和整体完成度。', ['氛围', '光影', '优化'], '在不破坏原空间结构、视角和构图的前提下，优化{{空间类型}}的整体氛围。增强自然光、材质层次、软装完整度和真实阴影，保持空间关系、墙体、门窗、地面、吊顶与主要家具位置稳定。', [{ key: '空间类型', label: '空间类型', defaultValue: '室内空间' }]),
  tpl('inpaint-mask-only', '仅改涂抹区域', '局部修饰', GenerationStep.LocalInpainting, '适合普通局部修饰，强调 mask 约束。', ['mask', '局部', '保留'], '只修改 mask 白色区域中的{{修改对象}}，不要修改未涂抹区域。保持{{保留要求}}不变，边缘自然融合，修改结果需要与原图光照、透视和材质质感一致。', [{ key: '修改对象', label: '修改对象', defaultValue: '目标区域' }, { key: '保留要求', label: '保留要求', defaultValue: '空间结构、墙体、门窗、地面、吊顶、相机视角和光照' }]),
  tpl('furniture-replace-masked', '替换涂抹家具', '家具修改', GenerationStep.LocalInpainting, '用家具参考图替换被涂抹的家具。', ['家具', '替换', '参考图'], '将 mask 白色区域内被涂抹的家具替换为家具参考图中的类型、造型、材质、颜色和风格。只修改这件家具，不要替换其他家具，不要改变墙体、门窗、地面、吊顶、空间结构、透视、光照和相机视角。参考图只作为家具语义参考，不复制背景。'),
  tpl('furniture-refine-scale', '家具比例优化', '家具修改', GenerationStep.LocalInpainting, '调整家具造型但保持空间关系。', ['家具', '比例', '尺度'], '仅优化 mask 区域内家具的造型、比例和材质，使其更符合当前空间尺度。未涂抹区域完全保持原状，其他家具不变，空间结构、透视、光照和相机位置保持不变。'),
  tpl('material-reference-replace', '参考材质替换', '材质替换', GenerationStep.LocalInpainting, '用材质参考图替换局部材质。', ['材质', '纹理', '参考图'], '只将 mask 白色区域替换为参考材质图的颜色、纹理、粗糙度和质感。不要复制参考图中的背景或物体，不要改变家具造型、空间结构、门窗、墙体、地面边界和未涂抹区域。'),
  tpl('material-soft-refine', '材质质感增强', '材质替换', GenerationStep.LocalInpainting, '提升局部材质真实度。', ['质感', '局部', '真实'], '在 mask 白色区域内增强{{材质}}的真实质感和细节，保持原有形体、边界和空间关系不变。未涂抹区域不做任何修改，整体光照和透视与原图一致。', [{ key: '材质', label: '材质', defaultValue: '目标材质' }]),
];

function tpl(id: string, title: string, category: string, step: GenerationStep, description: string, tags: string[], prompt: string, variables?: PromptTemplate['variables']): PromptTemplate {
  const feature = stepToFeature(step);
  return { id, title, category, feature, supportedModes: [step], description, previewImage: '', prompt, promptText: prompt, tags, variables, config: { prompt } };
}

export function filterPromptTemplates(input: { templates?: PromptTemplate[]; step: GenerationStep; editTarget?: string; category?: string; query?: string }): PromptTemplate[] {
  const category = input.category || defaultPromptTemplateCategory(input.step, input.editTarget);
  const query = (input.query || '').trim().toLowerCase();
  return (input.templates || WORKSPACE_PROMPT_TEMPLATES).filter(template => {
    const modeMatch = category === '全部' || template.category === category || (category === '局部修饰' && template.feature === 'inpaint');
    const stepMatch = category === '全部' || (template.supportedModes || []).some(mode => mode === input.step) || template.feature === stepToFeature(input.step);
    const search = [template.title, template.description, ...(template.tags || [])].join(' ').toLowerCase();
    return modeMatch && stepMatch && (!query || search.includes(query));
  });
}

export function defaultPromptTemplateCategory(step: GenerationStep, editTarget?: string): string {
  if (step === GenerationStep.FloorplanTo3D) return '平面彩平';
  if (step === GenerationStep.StyleRender) return '风格渲染';
  if (step === GenerationStep.ModelSnapshotRender) return '风格渲染';
  if (editTarget === 'furniture') return '家具修改';
  if (editTarget === 'material') return '材质替换';
  return '局部修饰';
}

export function applyPromptTemplateVariables(template: PromptTemplate, values: Record<string, string>): string {
  return (template.prompt || template.promptText).replace(/\{\{([^}]+)\}\}/g, (match, key: string) => {
    const value = values[key]?.trim() || template.variables?.find(item => item.key === key)?.defaultValue;
    return value || match;
  });
}

export function mergePromptTemplate(currentPrompt: string, templatePrompt: string, mode: 'replace' | 'append'): string {
  if (!currentPrompt.trim() || mode === 'replace') return templatePrompt;
  return `${currentPrompt.trim()}\n\n${templatePrompt}`;
}

function stepToFeature(step: GenerationStep): PromptTemplate['feature'] {
  if (step === GenerationStep.ModelSnapshotRender) return 'model-render';
  if (step === GenerationStep.DesignVariants) return 'design-variants';
  if (step === GenerationStep.MaterialReplace) return 'material-replace';
  if (step === GenerationStep.PlanColorize) return 'plan-colorize';
  return step === GenerationStep.FloorplanTo3D ? 'floorplan' : step === GenerationStep.StyleRender ? 'style-render' : 'inpaint';
}
