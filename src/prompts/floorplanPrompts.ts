export const DEFAULT_FLOORPLAN_COLOR_PROMPT = [
  '你是一名专业建筑表现设计师，请基于输入的建筑平面图生成高质量彩色总平/彩平表达图。要求：',
  '1. 保持原始平面图的空间结构、轮廓、墙体、道路、房间分区和主要构图关系不变。',
  '2. 对不同功能区域进行清晰的色彩区分。',
  '3. 增强铺装、绿化、水体、建筑阴影、道路、庭院、景观节点等表达。',
  '4. 使用建筑设计汇报常用的彩平表现方式，画面干净、层次清晰、专业、美观。',
  '5. 不要改变平面图的基本布局，不要新增不合理建筑体量。',
  '6. 如果提供参考图或材质图，请参考其色彩、材质、纹理和表达氛围。',
  '7. 输出应适合建筑方案汇报、投标文本或设计展示。',
].join('\n');

export function buildFloorplanColorPrompt(extraPrompt?: string): string {
  const trimmedExtraPrompt = extraPrompt?.trim();
  if (!trimmedExtraPrompt) {
    return DEFAULT_FLOORPLAN_COLOR_PROMPT;
  }

  return [
    DEFAULT_FLOORPLAN_COLOR_PROMPT,
    '',
    '用户额外要求：',
    trimmedExtraPrompt,
  ].join('\n');
}
