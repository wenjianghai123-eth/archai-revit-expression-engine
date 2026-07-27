import type { DesignVariantBatchCount, VariantStyleKey } from '../types';

export type DesignVariantCluster =
  | 'modern'
  | 'oriental'
  | 'luxury'
  | 'natural'
  | 'regional'
  | 'industrial'
  | 'classic'
  | 'technology';

export interface StylePreset {
  id: VariantStyleKey;
  name: string;
  description: string;
  colorPalette: string[];
  materialLanguage: string[];
  lightingMood: string;
  furnitureLanguage: string;
  decorationLanguage: string;
  textureLanguage: string;
  negativeRules: string[];
  cluster: DesignVariantCluster;
}

export const designVariantCounts = [1, 2, 4, 6, 8] as const satisfies readonly DesignVariantBatchCount[];

export const designVariantQualityPreset = 'cinematic-4k';

export const designVariantCinematicQualityPrompt = [
  '电影级高端建筑可视化渲染，专业建筑摄影质感，4K超高清，高细节，高纹理，真实材质，真实微表面质感。',
  '准确反射，自然阴影，真实全局光照，合理曝光，高动态范围，清晰空间层次，细腻景深，真实落地感。',
  '正式汇报与项目交付级质量，画面干净、稳定、精致，避免低清晰度、塑料感、过度锐化、噪点、水印、文字乱码和畸变。',
].join(' ');

export const designVariantArchitectureProtectionPrompt = [
  '严格保持建筑主体结构不变。',
  '严格保持墙体、柱梁、楼板、门窗洞口和层高关系不变。',
  '严格保持空间尺度、空间布局和功能关系不变。',
  '严格保持相机机位、视角、透视和构图不变。',
  '保持固定硬装框架基本不变。',
  '保持主要家具和软装的数量、位置和功能布局基本不变。',
  '不新增影响空间结构的构件。',
  '不重新设计建筑。',
  '不改变主要交通动线。',
  '不改变原图中的核心空间关系。',
  '允许根据风格变化墙地顶表面材质语言、色彩体系、灯光氛围、家具表面材质与局部造型语言、织物和软装搭配、少量装饰物、艺术品、花艺、摆件以及不影响结构的细节处理。',
].join(' ');

export const designVariantStylePresets: StylePreset[] = [
  {
    id: 'modern-minimal',
    name: '现代简约',
    description: '克制、干净、秩序清晰的现代空间表达，强调比例、留白和材料完成度。',
    colorPalette: ['暖白', '浅灰', '木色', '少量黑色线条'],
    materialLanguage: ['微水泥', '浅色石材', '哑光木饰面', '细框金属'],
    lightingMood: '均匀柔和的自然光与隐藏式线性灯光，低眩光、干净明亮。',
    furnitureLanguage: '低饱和、几何线条清晰、体块轻盈的现代家具，布局保持原有秩序。',
    decorationLanguage: '少量抽象艺术、留白墙面、克制摆件，不做复杂装饰堆叠。',
    textureLanguage: '细腻哑光表面、微纹理石材、温和木纹，整体质感干净。',
    negativeRules: ['不要复杂欧式线脚', '不要厚重雕花', '不要强烈高饱和配色'],
    cluster: 'modern',
  },
  {
    id: 'light-luxury',
    name: '轻奢',
    description: '精致、高级但不过度夸张的当代轻奢空间，强调石材、金属和层次光影。',
    colorPalette: ['米白', '高级灰', '香槟金', '暖棕'],
    materialLanguage: ['大理石', '皮革', '金属嵌条', '高质感木饰面'],
    lightingMood: '柔和暖光、局部重点照明、灯带层次明确，形成高端酒店式氛围。',
    furnitureLanguage: '比例优雅、包裹感强、细节精致的家具，保留原有主要布局。',
    decorationLanguage: '金属质感摆件、艺术挂画、精致花器与少量高端软装。',
    textureLanguage: '抛光与哑光材质对比，真实反射、细腻皮革纹理和石材纹理。',
    negativeRules: ['不要土豪金堆砌', '不要过度镜面反射', '不要改变空间结构'],
    cluster: 'luxury',
  },
  {
    id: 'modern-oriental',
    name: '现代东方',
    description: '现代空间秩序结合东方含蓄气质，强调轴线、木质、屏风感和克制装饰。',
    colorPalette: ['米白', '深木色', '暖灰', '墨色点缀'],
    materialLanguage: ['木格栅', '温润石材', '亚麻织物', '哑光金属'],
    lightingMood: '温润漫射光，强调空间层次和东方静谧感。',
    furnitureLanguage: '现代低矮家具结合东方比例，线条简洁、稳定、有礼序。',
    decorationLanguage: '东方艺术挂画、陶器、枝叶、屏风感元素，控制数量。',
    textureLanguage: '温润木纹、天然织物、细腻石材与手作质感。',
    negativeRules: ['不要古装场景化', '不要大量红木雕花', '不要新增影响布局的隔断'],
    cluster: 'oriental',
  },
  {
    id: 'new-chinese',
    name: '新中式',
    description: '东方礼序和现代精致感结合的新中式方案，强调格栅、对称、温润材质。',
    colorPalette: ['米白', '胡桃木色', '石材灰', '少量墨黑'],
    materialLanguage: ['深浅木饰面', '木格栅', '浅色石材', '丝麻织物'],
    lightingMood: '柔和暖光和重点洗墙光，营造安静、端正、雅致的空间氛围。',
    furnitureLanguage: '现代化中式比例，端正稳重，不替换主要家具位置。',
    decorationLanguage: '山水意境艺术、陶瓷器物、东方花艺、少量屏风纹样。',
    textureLanguage: '温润木纹、细腻石材、织物肌理和低反射表面。',
    negativeRules: ['不要传统宫廷化', '不要大面积红木堆叠', '不要改变墙体和吊顶结构'],
    cluster: 'oriental',
  },
  {
    id: 'mediterranean',
    name: '地中海',
    description: '明亮、轻松、自然的地中海风格，使用蓝白色彩、自然石材、木材和织物。',
    colorPalette: ['白色', '海蓝', '陶土色', '浅木色'],
    materialLanguage: ['浅色灰泥', '自然石材', '原木', '陶艺饰面'],
    lightingMood: '明亮自然日光、柔和阴影，空气感轻松通透。',
    furnitureLanguage: '自然木质、布艺、藤编感家具语言，保持原布局。',
    decorationLanguage: '陶罐、织物、少量蓝白艺术品、自然绿植和手作装饰。',
    textureLanguage: '灰泥肌理、石材粗细变化、木纹、陶土和织物纹理。',
    negativeRules: ['不得新增拱门', '不得改变墙体', '不得重做吊顶结构', '不得改变空间布局'],
    cluster: 'regional',
  },
  {
    id: 'japanese-wabi-sabi',
    name: '日式侘寂',
    description: '安静、自然、克制的日式侘寂空间，强调留白、原木、微水泥和时间感。',
    colorPalette: ['米白', '浅木色', '灰褐', '低饱和绿'],
    materialLanguage: ['原木', '微水泥', '亚麻', '粗陶', '自然石材'],
    lightingMood: '柔和漫射自然光，低对比、安静、放松。',
    furnitureLanguage: '低矮、简洁、自然材料家具，保持空间功能与布局。',
    decorationLanguage: '少量陶器、枯枝、自然织物、留白艺术，不复杂陈设。',
    textureLanguage: '粗细自然肌理、哑光表面、手作质感和温和阴影。',
    negativeRules: ['不要高亮奢华材质', '不要复杂装饰', '不要改变空间尺度和机位'],
    cluster: 'natural',
  },
  {
    id: 'industrial',
    name: '工业风',
    description: '粗粝、理性、有结构表达感的工业风，强调金属、混凝土和深色对比。',
    colorPalette: ['深灰', '黑色', '混凝土灰', '锈棕'],
    materialLanguage: ['混凝土', '黑钢', '金属网', '旧木', '皮革'],
    lightingMood: '低照度、重点照明、轨道灯或工业灯具氛围，明暗对比更强。',
    furnitureLanguage: '金属与皮革混搭，线条硬朗，保持原主要家具位置。',
    decorationLanguage: '工业灯具、金属摆件、抽象海报、少量装置感陈设。',
    textureLanguage: '粗粝混凝土、氧化金属、旧木纹理、皮革纹理。',
    negativeRules: ['不要改成厂房结构', '不要暴力拆除墙体', '不要增加大型结构构件'],
    cluster: 'industrial',
  },
  {
    id: 'french-modern',
    name: '法式现代',
    description: '现代克制的法式优雅，强调浅色、精致线条、软装比例和温柔光感。',
    colorPalette: ['象牙白', '暖灰', '奶咖', '浅金'],
    materialLanguage: ['浅色石材', '细腻涂料', '布艺', '浅金属', '木地板质感'],
    lightingMood: '柔和暖光、轻盈层次、优雅而不厚重。',
    furnitureLanguage: '曲线适度、比例优雅的现代法式家具语言，布局不大改。',
    decorationLanguage: '精致挂画、镜面点缀、花艺、法式线条感软装。',
    textureLanguage: '细腻墙面、柔软织物、浅色木纹和轻微金属反射。',
    negativeRules: ['不要过度宫廷化', '不要大量雕花', '不要新增复杂拱券或结构线脚'],
    cluster: 'classic',
  },
  {
    id: 'italian-minimal',
    name: '意式极简',
    description: '高端、克制、材料比例精准的意式极简空间，强调大面材质和低调奢华。',
    colorPalette: ['暖灰', '米白', '深咖', '炭黑'],
    materialLanguage: ['大板石材', '深色木饰面', '皮革', '哑光金属'],
    lightingMood: '隐藏式高级灯光，明暗层次清晰但不过度戏剧化。',
    furnitureLanguage: '低矮宽体、比例考究、线条极简的家具系统，保持布局。',
    decorationLanguage: '少量雕塑感摆件、艺术画、精致织物，强调留白。',
    textureLanguage: '大面石材纹理、细腻皮革、深木纹和哑光金属质感。',
    negativeRules: ['不要杂乱小装饰', '不要高饱和颜色', '不要改变空间结构'],
    cluster: 'modern',
  },
  {
    id: 'nordic-natural',
    name: '北欧自然',
    description: '明亮、温暖、自然舒适的北欧空间，强调浅木、织物和柔和日光。',
    colorPalette: ['暖白', '浅木色', '雾灰', '鼠尾草绿'],
    materialLanguage: ['浅木', '棉麻织物', '浅色涂料', '自然石材'],
    lightingMood: '明亮柔和的自然光，舒适、亲和、低对比。',
    furnitureLanguage: '轻盈木质家具、柔软布艺、圆润边角，保持主要布局。',
    decorationLanguage: '绿植、织物、简洁挂画、生活化小摆件。',
    textureLanguage: '浅木纹、棉麻、毛毡、自然纹理和柔和阴影。',
    negativeRules: ['不要冷硬商业化', '不要奢华金属堆叠', '不要改变主体结构'],
    cluster: 'natural',
  },
  {
    id: 'art-deco',
    name: 'Art Deco艺术装饰',
    description: '几何秩序、精致材质和装饰艺术感结合的高辨识度方案。',
    colorPalette: ['黑金', '象牙白', '孔雀绿', '深棕'],
    materialLanguage: ['金属线条', '高光石材', '木饰面', '丝绒织物'],
    lightingMood: '戏剧化重点照明与暖色氛围，突出几何装饰层次。',
    furnitureLanguage: '几何线条、精致比例、丝绒或皮革质感家具，保留布局。',
    decorationLanguage: '几何图案、金属饰件、艺术挂画、成组摆件。',
    textureLanguage: '高低反差材质、细密几何纹理、真实金属反射和织物绒感。',
    negativeRules: ['不要杂乱堆砌', '不要过度舞台化', '不要改动墙体结构'],
    cluster: 'luxury',
  },
  {
    id: 'futuristic',
    name: '未来科技',
    description: '干净、理性、带科技感的未来空间表达，强调发光界面、流线和高性能材料。',
    colorPalette: ['冷白', '银灰', '深蓝', '少量电光蓝'],
    materialLanguage: ['哑光金属', '玻璃', '发光材料', '高性能复合板'],
    lightingMood: '冷色调环境光、隐藏式线性光、局部科技感发光界面。',
    furnitureLanguage: '流线型、模块化、轻量化家具语言，保持原功能布局。',
    decorationLanguage: '少量数字界面感装饰、抽象科技艺术、简洁绿植点缀。',
    textureLanguage: '精密金属、细腻玻璃反射、干净发光边缘和高科技表面。',
    negativeRules: ['不要科幻飞船化', '不要增加大型机械结构', '不要改变空间尺度和交通动线'],
    cluster: 'technology',
  },
];

const presetIds = new Set(designVariantStylePresets.map(preset => preset.id));

export function isDesignVariantStylePresetId(value: unknown): value is VariantStyleKey {
  return typeof value === 'string' && presetIds.has(value as VariantStyleKey);
}

export function readDesignVariantStylePreset(value: unknown): StylePreset {
  const normalized = normalizeLegacyStyleId(value);
  return designVariantStylePresets.find(preset => preset.id === normalized) || designVariantStylePresets[0];
}

export function readDesignVariantStylePresetName(value: unknown): string {
  return readDesignVariantStylePreset(value).name;
}

export function readDesignVariantCount(value: unknown): DesignVariantBatchCount {
  return designVariantCounts.includes(value as DesignVariantBatchCount) ? value as DesignVariantBatchCount : 1;
}

export function assignDesignVariantStylePresets(
  variantCount: DesignVariantBatchCount,
  selectedStyleIds: unknown,
): StylePreset[] {
  const requested = Array.isArray(selectedStyleIds)
    ? selectedStyleIds.map(normalizeLegacyStyleId).filter(isDesignVariantStylePresetId)
    : [];
  const resolved: StylePreset[] = [];
  const usedIds = new Set<VariantStyleKey>();
  const clusterCounts = new Map<DesignVariantCluster, number>();

  const append = (preset: StylePreset) => {
    if (resolved.length >= variantCount || usedIds.has(preset.id)) return;
    resolved.push(preset);
    usedIds.add(preset.id);
    clusterCounts.set(preset.cluster, (clusterCounts.get(preset.cluster) || 0) + 1);
  };

  requested.forEach(id => append(readDesignVariantStylePreset(id)));

  while (resolved.length < variantCount) {
    const candidate = designVariantStylePresets
      .filter(preset => !usedIds.has(preset.id))
      .sort((left, right) => {
        const clusterDiff = (clusterCounts.get(left.cluster) || 0) - (clusterCounts.get(right.cluster) || 0);
        if (clusterDiff !== 0) return clusterDiff;
        return designVariantStylePresets.indexOf(left) - designVariantStylePresets.indexOf(right);
      })[0];
    if (!candidate) break;
    append(candidate);
  }

  return resolved.slice(0, variantCount);
}

export function buildStylePresetPrompt(preset: StylePreset): string {
  return [
    `StylePresetId: ${preset.id}.`,
    `Style name: ${preset.name}.`,
    `Style description: ${preset.description}`,
    `Color palette: ${preset.colorPalette.join(', ')}.`,
    `Material language: ${preset.materialLanguage.join(', ')}.`,
    `Lighting mood: ${preset.lightingMood}`,
    `Furniture language: ${preset.furnitureLanguage}`,
    `Decoration language: ${preset.decorationLanguage}`,
    `Texture language: ${preset.textureLanguage}`,
    `Style-specific negative rules: ${preset.negativeRules.join('; ')}.`,
    `Cluster: ${preset.cluster}.`,
  ].join(' ');
}

export function normalizeLegacyStyleId(value: unknown): VariantStyleKey {
  if (value === 'japanese') return 'japanese-wabi-sabi';
  if (value === 'natural-wood') return 'nordic-natural';
  if (value === 'premium-gray') return 'modern-minimal';
  if (value === 'wabi-sabi') return 'japanese-wabi-sabi';
  if (value === 'cream-style') return 'nordic-natural';
  if (isDesignVariantStylePresetId(value)) return value;
  return 'modern-minimal';
}
