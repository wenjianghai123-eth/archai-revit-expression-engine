import type { DesignVariantVariableKey, VariantStyleKey } from '../types';

export interface DesignVariantPack {
  id: string;
  label: string;
  description: string;
  styles: VariantStyleKey[];
  variableSeeds: Partial<Record<DesignVariantVariableKey, string[]>>;
}

export const designVariantPacks: DesignVariantPack[] = [
  {
    id: 'interior-common',
    label: '室内通用',
    description: '适合住宅、民宿、样板间等室内方案',
    styles: ['modern-minimal', 'cream-style', 'wabi-sabi', 'light-luxury', 'natural-wood', 'premium-gray', 'industrial', 'hotel-lobby'],
    variableSeeds: {
      'material-system': ['浅色石材 + 木饰面', '暖白艺术涂料 + 柔软织物', '微水泥 + 原木', '天然石材 + 香槟金属', '自然木材 + 亚麻', '灰色石材 + 深色金属', '清水混凝土 + 黑钢', '高品质石材 + 深木饰面'],
      'color-system': ['黑白灰与暖木', '奶油米白', '低饱和大地色', '暖灰与金属点缀', '浅木与自然绿', '中性高级灰', '深灰与锈色', '暖棕与米金'],
      'brand-character': ['克制专业', '亲和柔软', '自然松弛', '精致高级', '健康自然', '理性稳重', '个性先锋', '典雅礼序'],
    },
  },
  {
    id: 'commercial',
    label: '商业展示',
    description: '适合展厅、商业空间、零售空间',
    styles: ['commercial-showroom', 'light-luxury', 'industrial', 'premium-gray', 'modern-minimal', 'natural-wood', 'hotel-lobby', 'office-space'],
    variableSeeds: {
      'material-system': ['高光展陈板 + 金属', '石材 + 香槟金属', '混凝土 + 黑钢', '灰色岩板 + 拉丝金属', '白色饰面 + 透明玻璃', '木饰面 + 米色石材', '深木 + 高级石材', '声学板 + 玻璃隔断'],
      'color-system': ['品牌主色 + 中性背景', '米金与暖灰', '黑灰与高对比色', '高级灰单色系', '纯白与重点色', '暖木与自然绿', '深棕与金色', '冷灰与企业色'],
      'brand-character': ['醒目展示', '精品奢雅', '先锋工业', '理性高端', '简洁科技', '自然友好', '酒店式服务', '专业高效'],
    },
  },
  {
    id: 'office',
    label: '办公空间',
    description: '适合办公、共享办公、企业展厅',
    styles: ['office-space', 'modern-minimal', 'premium-gray', 'natural-wood', 'industrial', 'light-luxury', 'commercial-showroom', 'cream-style'],
    variableSeeds: {
      'material-system': ['声学板 + 玻璃', '白色饰面 + 浅木', '灰色地毯 + 金属', '自然木 + 织物', '混凝土 + 黑钢', '石材 + 金属', '展陈板 + 玻璃', '暖白涂料 + 织物'],
      'color-system': ['企业色 + 冷灰', '白灰与浅木', '高级灰', '自然木与绿色', '黑灰高对比', '米灰与金属', '品牌主色', '暖白与浅棕'],
      'brand-character': ['专业高效', '年轻开放', '稳健理性', '健康自然', '技术先锋', '精英品质', '品牌展示', '亲和协作'],
    },
  },
  {
    id: 'hotel',
    label: '酒店民宿',
    description: '适合酒店大堂、民宿、公区空间',
    styles: ['hotel-lobby', 'wabi-sabi', 'cream-style', 'natural-wood', 'light-luxury', 'premium-gray', 'modern-minimal', 'commercial-showroom'],
    variableSeeds: {
      'material-system': ['高品质石材 + 深木', '夯土肌理 + 原木', '暖白涂料 + 织物', '自然木 + 石材', '大理石 + 金属', '灰色石材 + 皮革', '浅石材 + 木饰面', '展陈饰面 + 玻璃'],
      'color-system': ['暖棕与米金', '大地色', '奶油米白', '自然木色', '香槟金与暖灰', '高级灰', '黑白灰与木色', '品牌色点缀'],
      'brand-character': ['典雅礼序', '在地文化', '温柔疗愈', '自然度假', '轻奢精致', '成熟稳重', '现代克制', '社交活力'],
    },
  },
  {
    id: 'facade',
    label: '建筑外立面',
    description: '适合建筑体块、外立面和街区表达',
    styles: ['modern-minimal', 'premium-gray', 'light-luxury', 'industrial', 'natural-wood', 'commercial-showroom', 'wabi-sabi', 'hotel-lobby'],
    variableSeeds: {
      'material-system': ['浅色石材 + 玻璃', '深灰金属 + 玻璃', '石材 + 香槟金属', '清水混凝土 + 黑钢', '木纹铝板 + 石材', '高透玻璃 + 展示界面', '粗粝石材 + 木材', '深石材 + 金属格栅'],
      'color-system': ['浅灰与通透玻璃', '深灰单色系', '米金与暖灰', '黑灰高对比', '自然木与浅石色', '品牌色点缀', '低饱和大地色', '深棕与暖金'],
      'brand-character': ['现代城市', '稳重地标', '精致高端', '工业先锋', '生态自然', '商业活力', '文化在地', '酒店礼序'],
    },
  },
];

export const defaultDesignVariantPackId = 'interior-common';

export function getDesignVariantPack(packId: string | undefined): DesignVariantPack {
  return designVariantPacks.find(pack => pack.id === packId) || designVariantPacks[0];
}
