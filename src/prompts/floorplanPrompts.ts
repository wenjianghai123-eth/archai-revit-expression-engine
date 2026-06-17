import { findFloorplanColorTemplate } from '../constants/floorplanVariants';
import { FloorplanRoomLabel, FloorplanTemplateId } from '../types';

interface FloorplanPromptInput {
  userPrompt?: string;
  hasMaterialReferences?: boolean;
  materialNames?: string[];
  floorplanRenderMode?: 'flat-color' | 'semi-3d' | 'presentation';
  lineworkPreservation?: 'strict' | 'high' | 'medium';
  enableLegend?: boolean;
  enableAreaText?: boolean;
  enableMaterialLegend?: boolean;
  floorplanTemplateId?: FloorplanTemplateId;
  floorplanRoomLabels?: FloorplanRoomLabel[];
}

export const DEFAULT_FLOORPLAN_COLOR_PROMPT = [
  '请将输入图转换为专业的室内平面彩平图，使用清晰、写实、干净的材质表达。',
  '严格保持原图的户型结构、空间边界、墙体、门窗、门洞、柱体、固定结构、家具位置、家具轮廓和比例关系不变。',
  '不新增、不删除、不移动任何房间、墙体、门窗、开口、柱体或家具，不改变户型结构、家具尺寸关系、画布比例、视角和构图边界。',
  '默认材质策略应根据空间类型灵活分配：客厅、餐厅、走廊等公共区域优先使用浅色大理石、白色大理石、浅色石材或浅色瓷砖；厨房、卫生间、阳台等湿区优先使用深色瓷砖、防滑地砖或耐污材质；卧室、书房等私密空间优先使用白橡木地板、浅色木地板或温暖木质地面。',
  '墙体、窗户和门洞保持原样式与轮廓。家具保持原有轮廓，可轻微优化材质表现，但不能改变位置、形状和尺度。',
  '保持俯视平面图表达，不要生成透视效果图、立面图、三维鸟瞰图、室内效果图或改变建筑布局。',
].join('\n');

const MATERIAL_REFERENCE_PROMPT = [
  '已提供的材质参考图优先作为颜色、纹理、质感和铺贴方向参考，应根据空间类型合理分配材质，不要把所有材质混乱铺满全图。',
  '不要复制材质参考图中的无关物体、背景、透视关系或拍摄构图。',
].join('\n');

const FLOORPLAN_RENDER_MODE_PROMPTS: Record<NonNullable<FloorplanPromptInput['floorplanRenderMode']>, string> = {
  'flat-color': 'Floor plan render mode: flat-color. Keep a pure flat colored plan expression; do not generate a perspective rendering, bird-eye view, 3D view, elevation, or interior effect image.',
  'semi-3d': 'Floor plan render mode: semi-3d. Create a layered semi-3D colored floor plan expression, while preserving the original floor plan structure.',
  presentation: 'Floor plan render mode: presentation. Strengthen presentation-board quality, material hierarchy, graphic completeness, and readable spatial expression.',
};

const LINEWORK_PRESERVATION_PROMPTS: Record<NonNullable<FloorplanPromptInput['lineworkPreservation']>, string> = {
  strict: 'Linework preservation: strict. Extremely strictly preserve the original linework, wall thickness, doors, windows, furniture outlines, room boundaries, and all plan geometry.',
  high: 'Linework preservation: high. Highly preserve the original linework and plan geometry, allowing only slight visual cleanup and professional graphic beautification.',
  medium: 'Linework preservation: medium. Keep the structure unchanged while allowing stronger graphic enhancement and clearer material hierarchy.',
};

export function buildFloorplanColorPrompt(input?: string | FloorplanPromptInput): string {
  const normalizedInput = typeof input === 'string' ? { userPrompt: input } : input || {};
  const trimmedUserPrompt = normalizedInput.userPrompt?.trim();
  const materialNames = (normalizedInput.materialNames || [])
    .map(name => name.trim())
    .filter(Boolean);

  const pieces = [DEFAULT_FLOORPLAN_COLOR_PROMPT];

  if (normalizedInput.floorplanRenderMode || normalizedInput.lineworkPreservation || normalizedInput.enableLegend || normalizedInput.enableAreaText || normalizedInput.enableMaterialLegend) {
    pieces.push(
      '',
      FLOORPLAN_RENDER_MODE_PROMPTS[normalizedInput.floorplanRenderMode || 'semi-3d'],
      LINEWORK_PRESERVATION_PROMPTS[normalizedInput.lineworkPreservation || 'high'],
    );
    if (normalizedInput.enableLegend) pieces.push('Add a concise graphic legend where appropriate, without covering important plan content.');
    if (normalizedInput.enableAreaText) pieces.push('Add clear area or functional text labels where appropriate; keep text minimal, legible, and aligned with the plan.');
    if (normalizedInput.enableMaterialLegend) pieces.push('Add a material legend that explains key floor, wall, soft furnishing, and finish categories where appropriate.');
  }

  const template = normalizedInput.floorplanTemplateId ? findFloorplanColorTemplate(normalizedInput.floorplanTemplateId) : undefined;
  if (template) {
    pieces.push('', `彩平模板：${template.name}`, template.promptHint);
  }

  const roomLabelPrompt = buildFloorplanRoomLabelsPrompt(normalizedInput.floorplanRoomLabels || []);
  if (roomLabelPrompt) {
    pieces.push('', roomLabelPrompt);
  }

  if (normalizedInput.hasMaterialReferences) {
    pieces.push('', MATERIAL_REFERENCE_PROMPT);
    if (materialNames.length > 0) {
      pieces.push(`材质参考名称：${materialNames.join('、')}。`);
    }
  }

  if (trimmedUserPrompt) {
    pieces.push(
      '',
      '用户补充要求：',
      trimmedUserPrompt,
      '在满足用户补充要求时，必须继续保持原始空间结构、墙体门窗、门洞、柱体、家具位置和家具轮廓不变；如果用户补充要求与这些强约束冲突，以强约束为准。',
    );
  }

  return pieces.join('\n');
}

function buildFloorplanRoomLabelsPrompt(labels: FloorplanRoomLabel[]): string {
  const sanitized = labels
    .map(label => ({
      name: label.name.trim(),
      type: readFloorplanRoomTypeLabel(label),
      position: label.positionDescription.trim(),
    }))
    .filter(label => label.name || label.type || label.position)
    .slice(0, 20);
  if (sanitized.length === 0) return '';
  return [
    'Room label guidance: express the functional zones according to these manual room labels. Keep labels visually integrated with the floor plan and do not move walls, openings, or furniture outlines.',
    ...sanitized.map((label, index) => `Room ${index + 1}: ${label.name || `Area ${index + 1}`} = ${label.type}${label.position ? `, location: ${label.position}` : ''}.`),
  ].join('\n');
}

function readFloorplanRoomTypeLabel(label: FloorplanRoomLabel): string {
  if (label.roomType === 'custom') return label.customTypeLabel?.trim() || 'custom room';
  const labels: Record<FloorplanRoomLabel['roomType'], string> = {
    'living-room': 'living room',
    'dining-room': 'dining room',
    bedroom: 'bedroom',
    kitchen: 'kitchen',
    bathroom: 'bathroom',
    balcony: 'balcony',
    entry: 'entry foyer',
    study: 'study',
    office: 'office area',
    commercial: 'commercial area',
    custom: 'custom room',
  };
  return labels[label.roomType] || 'room';
}
