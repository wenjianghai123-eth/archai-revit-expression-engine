import { GoogleGenAI } from '@google/genai';

export interface PromptPolishRequest {
  rawText: string;
  generationStep: string;
  context?: Record<string, unknown>;
}

export interface PromptPolishResult {
  polishedPrompt: string;
  negativePrompt?: string;
  notes?: string[];
}

interface StepPolishProfile {
  title: string;
  intent: string;
  constraints: string[];
}

const defaultNegativePrompt = '不要生成文字、标签、水印、品牌 Logo、商标、人物、敏感内容、拼贴图、分屏对比或 UI 边框。';

const stepProfiles: Record<string, StepPolishProfile> = {
  floorplan_to_3d: {
    title: '图纸智能表达',
    intent: '将图纸或平面方案转化为清晰、专业、可读性强的建筑表达图。',
    constraints: [
      '保持原始图纸的空间关系、房间边界、动线和主要功能分区。',
      '强化空间类型、功能标注、材质分区、色彩层次和图面清晰度。',
      '表达应干净、专业、适合方案汇报。',
    ],
  },
  style_render: {
    title: '风格渲染',
    intent: '基于原图生成电影级真实建筑/室内效果图。',
    constraints: [
      '保持原图构图、空间结构、透视关系、相机位置和主要轮廓。',
      '重点优化设计风格、材质质感、灯光氛围、软装细节和真实感。',
      '输出高质量、自然、真实的建筑可视化渲染。',
    ],
  },
  local_inpainting: {
    title: '局部修饰',
    intent: '对指定区域做克制、自然的局部编辑。',
    constraints: [
      '只修改指定区域，未选中区域保持不变。',
      '匹配原图透视、尺度、光影、材质和边缘过渡。',
      '让局部修改自然融入原场景，不改变整体构图。',
    ],
  },
  material_replace: {
    title: '材质软装替换',
    intent: '替换或优化指定对象的材质与软装表达。',
    constraints: [
      '保持原图结构、透视、光照、阴影和物体形体不变。',
      '只调整目标区域的材质、颜色、纹理、反射、粗糙度和软装质感。',
      '新材质要与空间风格、灯光和环境自然统一。',
    ],
  },
  design_variants: {
    title: '方案变体',
    intent: '生成多组清晰区分但结构稳定的设计方案方向。',
    constraints: [
      '保持原始空间结构、相机角度、主要布局和设计边界。',
      '围绕风格、材质、灯光、家具氛围和细节层次形成差异。',
      '每个方向都应专业、真实、可比较。',
    ],
  },
  model_snapshot_render: {
    title: '白模快渲',
    intent: '将白模或模型截图转化为真实建筑/室内效果图。',
    constraints: [
      '保持模型体块、空间结构、相机角度、透视和主要开口关系。',
      '补充合理材质、灯光、环境、家具或景观细节。',
      '从白模表达转为真实、自然、可汇报的建筑渲染图。',
    ],
  },
  panorama_quick_render: {
    title: '漫游全景快渲',
    intent: '生成真实自然的 360 全景建筑/室内渲染图。',
    constraints: [
      '保持第一张全景图的 2:1 equirectangular 比例、相机位置和空间结构。',
      '保持门窗、墙体、天花、地面、主要布局和视点关系。',
      '优化材质、灯光、氛围和细节，避免普通透视图、拼贴图或分屏图。',
    ],
  },
  object_insert: {
    title: '元素植入',
    intent: '将参考家具/物体自然融入原始建筑/室内场景。',
    constraints: [
      '参考物体只用于形态、材质、颜色和比例，不要求完全一致。',
      '按用户摆放位置生成相似无品牌物体，匹配透视、尺度、光照、阴影和遮挡关系。',
      '保持未标记区域尽量不变，让植入效果真实自然。',
    ],
  },
  plan_colorize: {
    title: '图纸智能表达',
    intent: '将平面图转化为清晰、专业、适合汇报的彩色图纸表达。',
    constraints: [
      '保持原始线稿、房间边界、门窗、柱网、家具位置和动线关系。',
      '强化功能分区、材质填充、色彩层次、标注可读性和图面整洁度。',
      '不要生成透视效果图，保持平面图表达。',
    ],
  },
};

export async function polishPromptText(input: PromptPolishRequest): Promise<PromptPolishResult> {
  const rawText = input.rawText.trim();
  const canonicalStep = normalizeGenerationStep(input.generationStep);
  const profile = stepProfiles[canonicalStep] || stepProfiles.style_render;
  const fallback = buildRuleBasedPrompt(rawText, canonicalStep, profile, input.context);
  const aiResult = await tryPolishWithGemini(rawText, canonicalStep, profile, input.context).catch(() => null);

  return aiResult || fallback;
}

function buildRuleBasedPrompt(
  rawText: string,
  canonicalStep: string,
  profile: StepPolishProfile,
  context: Record<string, unknown> | undefined,
): PromptPolishResult {
  const contextHints = buildContextHints(context);
  const polishedPrompt = [
    `${profile.title}提示词：${profile.intent}`,
    `用户设计想法：${normalizeWhitespace(rawText)}。`,
    contextHints,
    '画面要求：明确空间类型与设计风格，强化材质质感、灯光层次、构图稳定性、透视准确性和真实建筑摄影感。',
    ...profile.constraints,
    '生成结果应自然、真实、细节丰富，适合建筑/室内方案表达。',
  ].filter(Boolean).join('\n');

  return {
    polishedPrompt,
    negativePrompt: defaultNegativePrompt,
    notes: [
      '当前使用规则版提示词润色 fallback。',
      `已按 ${profile.title} 场景补充专业约束。`,
      canonicalStep === 'object_insert' ? '元素植入已使用中性表达：参考形态、材质、颜色和比例。' : '',
    ].filter(Boolean),
  };
}

async function tryPolishWithGemini(
  rawText: string,
  canonicalStep: string,
  profile: StepPolishProfile,
  context: Record<string, unknown> | undefined,
): Promise<PromptPolishResult | null> {
  const apiKey = process.env.PROMPT_POLISH_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  const provider = process.env.PROMPT_POLISH_PROVIDER || (apiKey ? 'gemini' : 'rules');
  if (!apiKey || provider === 'rules' || provider === 'mock') return null;

  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.PROMPT_POLISH_MODEL || process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';
  const response = await ai.models.generateContent({
    model,
    contents: [{
      role: 'user',
      parts: [{ text: buildGeminiPolishInstruction(rawText, canonicalStep, profile, context) }],
    }],
  });
  const text = extractTextFromGeminiResponse(response);
  if (!text) return null;

  const parsed = parsePromptPolishJson(text);
  if (!parsed?.polishedPrompt) {
    return {
      polishedPrompt: text.trim(),
      negativePrompt: defaultNegativePrompt,
      notes: ['Gemini 返回了非 JSON 文本，已直接作为润色提示词使用。'],
    };
  }

  return {
    polishedPrompt: parsed.polishedPrompt,
    negativePrompt: parsed.negativePrompt || defaultNegativePrompt,
    notes: parsed.notes?.slice(0, 5),
  };
}

function buildGeminiPolishInstruction(
  rawText: string,
  canonicalStep: string,
  profile: StepPolishProfile,
  context: Record<string, unknown> | undefined,
): string {
  return [
    'You are an architectural visualization prompt assistant. Rewrite the user spoken idea into a professional Chinese image-generation prompt.',
    'Return strict JSON only with fields: polishedPrompt, negativePrompt, notes.',
    'Do not include unsafe requests, watermark removal, brand replication, exact copying, nudity, violence, weapons, political figures, people, trademarks, or sensitive content.',
    'Use neutral design language. For references, say "参考形态、材质、颜色和比例"; never say 完全复制、照抄、复刻、抠图、去水印、原样粘贴.',
    `Generation step: ${canonicalStep}`,
    `Feature name: ${profile.title}`,
    `Feature intent: ${profile.intent}`,
    `Feature constraints:\n${profile.constraints.map(item => `- ${item}`).join('\n')}`,
    buildContextHints(context),
    `Raw spoken text:\n${rawText}`,
  ].filter(Boolean).join('\n\n');
}

function normalizeGenerationStep(value: string): string {
  const normalized = String(value || '').trim();
  const lower = normalized.replace(/([a-z])([A-Z])/g, '$1_$2').replace(/-/g, '_').toLowerCase();
  const aliases: Record<string, string> = {
    '1': 'floorplan_to_3d',
    floorplan: 'floorplan_to_3d',
    floorplan_to3d: 'floorplan_to_3d',
    floorplan_to_3d: 'floorplan_to_3d',
    '2': 'style_render',
    stylerender: 'style_render',
    style_render: 'style_render',
    '3': 'local_inpainting',
    localinpainting: 'local_inpainting',
    local_inpainting: 'local_inpainting',
    inpaint: 'local_inpainting',
    '4': 'model_snapshot_render',
    modelsnapshotrender: 'model_snapshot_render',
    model_snapshot_render: 'model_snapshot_render',
    model_render: 'model_snapshot_render',
    '5': 'design_variants',
    designvariants: 'design_variants',
    design_variants: 'design_variants',
    '6': 'material_replace',
    materialreplace: 'material_replace',
    material_replace: 'material_replace',
    '7': 'plan_colorize',
    plancolorize: 'plan_colorize',
    plan_colorize: 'plan_colorize',
    '8': 'panorama_quick_render',
    panoramaquickrender: 'panorama_quick_render',
    panorama_quick_render: 'panorama_quick_render',
    panorama_roam_render: 'panorama_quick_render',
    '9': 'object_insert',
    objectinsert: 'object_insert',
    object_insert: 'object_insert',
  };
  return aliases[lower] || lower || 'style_render';
}

function buildContextHints(context: Record<string, unknown> | undefined): string {
  if (!context) return '';
  const hints = [
    readContextString(context, 'buildingType') ? `建筑类型：${readContextString(context, 'buildingType')}` : '',
    readContextString(context, 'spaceType') ? `空间类型：${readContextString(context, 'spaceType')}` : '',
    readContextString(context, 'renderStyle') || readContextString(context, 'style')
      ? `风格方向：${readContextString(context, 'renderStyle') || readContextString(context, 'style')}`
      : '',
    readContextString(context, 'smartMaterial') ? `材料方向：${readContextString(context, 'smartMaterial')}` : '',
    readContextString(context, 'lighting') || readContextString(context, 'atmosphere')
      ? `灯光氛围：${readContextString(context, 'lighting') || readContextString(context, 'atmosphere')}`
      : '',
  ].filter(Boolean);
  return hints.length > 0 ? `当前参数上下文：${hints.join('；')}。` : '';
}

function readContextString(context: Record<string, unknown>, key: string): string {
  const value = context[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function extractTextFromGeminiResponse(response: unknown): string {
  const text = (response as { text?: unknown }).text;
  if (typeof text === 'string') return text.trim();
  const candidates = (response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates;
  return candidates?.flatMap(candidate => candidate.content?.parts || [])
    .map(part => part.text || '')
    .join('\n')
    .trim() || '';
}

function parsePromptPolishJson(value: string): PromptPolishResult | null {
  const jsonText = extractJsonObject(value);
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText) as Partial<PromptPolishResult>;
    if (typeof parsed.polishedPrompt !== 'string' || parsed.polishedPrompt.trim().length === 0) return null;
    return {
      polishedPrompt: parsed.polishedPrompt.trim(),
      negativePrompt: typeof parsed.negativePrompt === 'string' ? parsed.negativePrompt.trim() : undefined,
      notes: Array.isArray(parsed.notes) ? parsed.notes.filter((item): item is string => typeof item === 'string') : undefined,
    };
  } catch {
    return null;
  }
}

function extractJsonObject(value: string): string | null {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  if (fenced?.[1]) return fenced[1].trim();
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  return start >= 0 && end > start ? value.slice(start, end + 1) : null;
}
