import { GenerationStep, GenerationConfig, MaterialAsset, FurnitureStyle } from './types';

export const MOCK_MATERIALS: MaterialAsset[] = [
  { 
    id: 'm1', 
    name: '原木地板 - 橡木', 
    thumbnail: 'https://images.unsplash.com/photo-1581456424029-37330752538b?auto=format&fit=crop&q=80&w=800', 
    category: '木材', 
    date: '2024-04-25', 
    description: '具有天然纹理效果的橡木地板，适合现代简约及北欧风格室内设计。高精纹理，100%反光率映射。', 
    tags: ['地板', '温暖', '天然', '物理材质'] 
  },
  { 
    id: 'm2', 
    name: '清水混凝土 - 灰色', 
    thumbnail: 'https://images.unsplash.com/photo-1517581177682-a085bb7ffb15?auto=format&fit=crop&q=80&w=800', 
    category: '混凝土', 
    date: '2024-04-24', 
    description: '现代粗犷主义风格，工业纹理。表面细腻有气孔分布，适合大面积立面使用。', 
    tags: ['工业', '墙面', '现代', '冷调'] 
  },
  { 
    id: 'm3', 
    name: '拉丝不锈钢', 
    thumbnail: 'https://images.unsplash.com/photo-1533038590840-1cde6b66b7c6?auto=format&fit=crop&q=80&w=800', 
    category: '金属', 
    date: '2024-04-23', 
    description: '精细拉丝颗粒，具有明显的各向异性反射特征，适合室内装饰立面及构件。', 
    tags: ['反射', '现代', '细节'] 
  },
  { 
    id: 'm4', 
    name: '大理石 - 爵士白', 
    thumbnail: 'https://images.unsplash.com/photo-1532453288454-ba56e40d76d2?auto=format&fit=crop&q=80&w=800', 
    category: '石材', 
    date: '2024-04-22', 
    description: '豪华装饰大理石，自带淡灰色纹路。镜面反射效果极佳，多用于高档商业及住宅。', 
    tags: ['奢华', '天然', '抛光'] 
  },
  { 
    id: 'm5', 
    name: '深色耐候钢', 
    thumbnail: 'https://images.unsplash.com/photo-1516216628859-9bccecad13ee?auto=format&fit=crop&q=80&w=800', 
    category: '金属', 
    date: '2024-04-21', 
    description: '复古锈蚀效果，色泽浑厚。具有极强的质感表达力，常用于建筑外观。', 
    tags: ['复古', '外立面', '强质感'] 
  },
  { 
    id: 'm6', 
    name: '釉面砖 - 翠绿', 
    thumbnail: 'https://images.unsplash.com/photo-1615529328331-f8917597711f?auto=format&fit=crop&q=80&w=800', 
    category: '瓷砖', 
    date: '2024-04-20', 
    description: '高饱和度釉面效果，具有独特的肌理与反光感，适合特色空间装饰。', 
    tags: ['高光', '彩色', '鲜明'] 
  }
];

export const MOCK_FURNITURE_STYLES: FurnitureStyle[] = [
  {
    id: 'f1',
    name: '极简北欧沙发',
    thumbnail: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=800',
    style: '现代北欧',
    category: '沙发',
    description: '简约线条设计，灰色织物触感，平衡舒适与空间通透感。',
    tags: ['极简', '舒适', '灰色']
  },
  {
    id: 'f2',
    name: '意式极简餐桌',
    thumbnail: 'https://images.unsplash.com/photo-1617806118233-f8e187c44b5c?auto=format&fit=crop&q=80&w=800',
    style: '意式现代',
    category: '餐桌',
    description: '大理石台面配细钢腿，展现意式设计的优雅与轻量化。',
    tags: ['大理石', '优雅', '石材']
  },
  {
    id: 'f3',
    name: '工业风书架',
    thumbnail: 'https://images.unsplash.com/photo-1594620302200-9a762244a156?auto=format&fit=crop&q=80&w=800',
    style: '工业风',
    category: '书架',
    description: '原木与金属架的碰撞，适合复古或工作室风格空间。',
    tags: ['复古', '金属', '木材']
  },
  {
    id: 'f4',
    name: '包豪斯风格单人椅',
    thumbnail: 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&q=80&w=800',
    style: '包豪斯',
    category: '椅子',
    description: '经典的钢管结构设计，体现形式追随功能的现代设计精髓。',
    tags: ['经典', '皮革', '标志性']
  }
];

export const DEFAULT_CONFIGS: Record<GenerationStep, GenerationConfig> = {
  [GenerationStep.FloorplanTo3D]: {
    prompt: "",
    style: "现代主义",
    lighting: "黄金时刻 (室外)",
    materialStrength: 0.8,
  },
  [GenerationStep.StyleRender]: {
    prompt: "",
    style: "现代建筑可视化",
    lighting: "自然均匀日光",
    materialStrength: 0.8,
  },
  [GenerationStep.LocalInpainting]: {
    prompt: "仅对选定区域进行局部重绘，保持整体图像风格一致，优化该区域的材质、光影与细节表现，确保与周围区域无缝融合，提升真实感与表现力，输出高分辨率细节优化结果。",
    style: "匹配原图",
    lighting: "匹配原图",
    materialStrength: 0.8,
    inpaintingStrength: 'medium',
    keepOriginalMaterial: true,
  },
};
