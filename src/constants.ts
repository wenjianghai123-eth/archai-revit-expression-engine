import { GenerationStep, GenerationConfig, MaterialAsset, FurnitureStyle } from './types';

export const MOCK_MATERIALS: MaterialAsset[] = [
  { 
    id: 'm1', 
    name: '原木地板 - 橡木', 
    thumbnail: 'https://images.unsplash.com/photo-1581456424029-37330752538b?auto=format&fit=crop&q=80&w=800', 
    category: 'Wood', 
    date: '2024-04-25', 
    description: '具有天然纹理效果的橡木地板，适合现代简约及北欧风格室内设计。高精纹理，100%反光率映射。', 
    tags: ['Flooring', 'Warm', 'Natural', 'PBR'] 
  },
  { 
    id: 'm2', 
    name: '清水混凝土 - 灰色', 
    thumbnail: 'https://images.unsplash.com/photo-1517581177682-a085bb7ffb15?auto=format&fit=crop&q=80&w=800', 
    category: 'Concrete', 
    date: '2024-04-24', 
    description: '现代粗犷主义风格，工业纹理。表面细腻有气孔分布，适合大面积立面使用。', 
    tags: ['Industrial', 'Wall', 'Modern', 'Cold'] 
  },
  { 
    id: 'm3', 
    name: '拉丝不锈钢', 
    thumbnail: 'https://images.unsplash.com/photo-1533038590840-1cde6b66b7c6?auto=format&fit=crop&q=80&w=800', 
    category: 'Metal', 
    date: '2024-04-23', 
    description: '精细拉丝颗粒，具有明显的各向异性反射特征，适合室内装饰立面及构件。', 
    tags: ['Reflective', 'Modern', 'Details'] 
  },
  { 
    id: 'm4', 
    name: '大理石 - 爵士白', 
    thumbnail: 'https://images.unsplash.com/photo-1532453288454-ba56e40d76d2?auto=format&fit=crop&q=80&w=800', 
    category: 'Stone', 
    date: '2024-04-22', 
    description: '豪华装饰大理石，自带淡灰色纹路。镜面反射效果极佳，多用于高档商业及住宅。', 
    tags: ['Luxury', 'Natural', 'Polished'] 
  },
  { 
    id: 'm5', 
    name: '深色耐候钢', 
    thumbnail: 'https://images.unsplash.com/photo-1516216628859-9bccecad13ee?auto=format&fit=crop&q=80&w=800', 
    category: 'Metal', 
    date: '2024-04-21', 
    description: '复古锈蚀效果，色泽浑厚。具有极强的质感表达力，常用于建筑外观。', 
    tags: ['Rustic', 'Exterior', 'Strong'] 
  },
  { 
    id: 'm6', 
    name: '釉面砖 - 翠绿', 
    thumbnail: 'https://images.unsplash.com/photo-1615529328331-f8917597711f?auto=format&fit=crop&q=80&w=800', 
    category: 'Tile', 
    date: '2024-04-20', 
    description: '高饱和度釉面效果，具有独特的肌理与反光感，适合特色空间装饰。', 
    tags: ['Glossy', 'Color', 'Vibrant'] 
  }
];

export const MOCK_FURNITURE_STYLES: FurnitureStyle[] = [
  {
    id: 'f1',
    name: '极简北欧沙发',
    thumbnail: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=800',
    style: 'Modern Nordic',
    category: 'Sofa',
    description: '简约线条设计，灰色织物触感，平衡舒适与空间通透感。',
    tags: ['Minimalist', 'Cozy', 'Grey']
  },
  {
    id: 'f2',
    name: '意式极简餐桌',
    thumbnail: 'https://images.unsplash.com/photo-1617806118233-f8e187c44b5c?auto=format&fit=crop&q=80&w=800',
    style: 'Italian Modern',
    category: 'Dining Table',
    description: '大理石台面配细钢腿，展现意式设计的优雅与轻量化。',
    tags: ['Marble', 'Elegant', 'Stone']
  },
  {
    id: 'f3',
    name: '工业风书架',
    thumbnail: 'https://images.unsplash.com/photo-1594620302200-9a762244a156?auto=format&fit=crop&q=80&w=800',
    style: 'Industrial',
    category: 'Bookshelf',
    description: '原木与金属架的碰撞，适合复古或工作室风格空间。',
    tags: ['Rustic', 'Metal', 'Wood']
  },
  {
    id: 'f4',
    name: '包豪斯风格单人椅',
    thumbnail: 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&q=80&w=800',
    style: 'Bauhaus',
    category: 'Chair',
    description: '经典的钢管结构设计，体现形式追随功能的现代设计精髓。',
    tags: ['Classic', 'Leather', 'Iconic']
  }
];

export const DEFAULT_CONFIGS: Record<GenerationStep, GenerationConfig> = {
  [GenerationStep.FloorplanTo3D]: {
    prompt: "将黑白建筑平面图转换为高质量三维建筑外观效果图，保持原始空间布局与比例关系，自动识别墙体、开窗、门、结构轮廓，生成真实材质（混凝土、玻璃、木材等），增加自然光照与环境光影，视角：人视或轻微俯视，风格：现代建筑表现图，质量：4K，照片级真实感，高细节。",
    style: "现代主义",
    lighting: "黄金时刻 (室外)",
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
