import { GenerationStep, GenerationConfig, MaterialAsset, FurnitureStyle, PromptTemplate } from './types';
import { IMAGE_POLISH_NEGATIVE_PROMPT, IMAGE_POLISH_PROMPT } from './constants/imagePolishPrompt';

export const MOCK_MATERIALS: MaterialAsset[] = [
  {
    id: "material-001",
    name: "ST-03",
    thumbnail: "/materials/material-001.png",
    category: "未分类",
    date: "2026-05-06",
    description: "来自本地材质贴图库的静态贴图资源。",
    tags: [
      "本地材质",
      "未分类"
    ]
  },
  {
    id: "material-002",
    name: "玻璃幕墙构件铝合金",
    thumbnail: "/materials/material-002.png",
    category: "金属",
    date: "2026-05-06",
    description: "来自本地材质贴图库的静态贴图资源。",
    tags: [
      "本地材质",
      "金属"
    ]
  },
  {
    id: "material-003",
    name: "镀锌钢",
    thumbnail: "/materials/material-003.png",
    category: "金属",
    date: "2026-05-06",
    description: "来自本地材质贴图库的静态贴图资源。",
    tags: [
      "本地材质",
      "金属"
    ]
  },
  {
    id: "material-004",
    name: "仿清水混凝土",
    thumbnail: "/materials/material-004.png",
    category: "混凝土",
    date: "2026-05-06",
    description: "来自本地材质贴图库的静态贴图资源。",
    tags: [
      "本地材质",
      "混凝土"
    ]
  },
  {
    id: "material-005",
    name: "仿清水混凝土2",
    thumbnail: "/materials/material-005.png",
    category: "混凝土",
    date: "2026-05-06",
    description: "来自本地材质贴图库的静态贴图资源。",
    tags: [
      "本地材质",
      "混凝土"
    ]
  },
  {
    id: "material-006",
    name: "扶手栏杆_不锈钢",
    thumbnail: "/materials/material-006.png",
    category: "金属",
    date: "2026-05-06",
    description: "来自本地材质贴图库的静态贴图资源。",
    tags: [
      "本地材质",
      "金属"
    ]
  },
  {
    id: "material-007",
    name: "扶手栏杆_木质",
    thumbnail: "/materials/material-007.png",
    category: "木材",
    date: "2026-05-06",
    description: "来自本地材质贴图库的静态贴图资源。",
    tags: [
      "本地材质",
      "木材"
    ]
  },
  {
    id: "material-008",
    name: "钢管",
    thumbnail: "/materials/material-008.png",
    category: "金属",
    date: "2026-05-06",
    description: "来自本地材质贴图库的静态贴图资源。",
    tags: [
      "本地材质",
      "金属"
    ]
  },
  {
    id: "material-009",
    name: "花岗岩",
    thumbnail: "/materials/material-009.png",
    category: "石材",
    date: "2026-05-06",
    description: "来自本地材质贴图库的静态贴图资源。",
    tags: [
      "本地材质",
      "石材"
    ]
  },
  {
    id: "material-010",
    name: "花岗岩2",
    thumbnail: "/materials/material-010.png",
    category: "石材",
    date: "2026-05-06",
    description: "来自本地材质贴图库的静态贴图资源。",
    tags: [
      "本地材质",
      "石材"
    ]
  },
  {
    id: "material-011",
    name: "金属铝拉网",
    thumbnail: "/materials/material-011.png",
    category: "金属",
    date: "2026-05-06",
    description: "来自本地材质贴图库的静态贴图资源。",
    tags: [
      "本地材质",
      "金属"
    ]
  },
  {
    id: "material-012",
    name: "铝金属本色",
    thumbnail: "/materials/material-012.png",
    category: "金属",
    date: "2026-05-06",
    description: "来自本地材质贴图库的静态贴图资源。",
    tags: [
      "本地材质",
      "金属"
    ]
  },
  {
    id: "material-013",
    name: "铝金属本色2",
    thumbnail: "/materials/material-013.png",
    category: "金属",
    date: "2026-05-06",
    description: "来自本地材质贴图库的静态贴图资源。",
    tags: [
      "本地材质",
      "金属"
    ]
  },
  {
    id: "material-014",
    name: "铝拉网",
    thumbnail: "/materials/material-014.png",
    category: "金属",
    date: "2026-05-06",
    description: "来自本地材质贴图库的静态贴图资源。",
    tags: [
      "本地材质",
      "金属"
    ]
  },
  {
    id: "material-015",
    name: "木质扶手栏杆",
    thumbnail: "/materials/material-015.png",
    category: "木材",
    date: "2026-05-06",
    description: "来自本地材质贴图库的静态贴图资源。",
    tags: [
      "本地材质",
      "木材"
    ]
  },
  {
    id: "material-016",
    name: "泡沫",
    thumbnail: "/materials/material-016.jpg",
    category: "未分类",
    date: "2026-05-06",
    description: "来自本地材质贴图库的静态贴图资源。",
    tags: [
      "本地材质",
      "未分类"
    ]
  },
  {
    id: "material-017",
    name: "浅灰色水泥涂料",
    thumbnail: "/materials/material-017.jpg",
    category: "涂料",
    date: "2026-05-06",
    description: "来自本地材质贴图库的静态贴图资源。",
    tags: [
      "本地材质",
      "涂料"
    ]
  },
  {
    id: "material-018",
    name: "清水混凝土",
    thumbnail: "/materials/material-018.png",
    category: "混凝土",
    date: "2026-05-06",
    description: "来自本地材质贴图库的静态贴图资源。",
    tags: [
      "本地材质",
      "混凝土"
    ]
  },
  {
    id: "material-019",
    name: "室外地面-砖",
    thumbnail: "/materials/material-019.png",
    category: "地面",
    date: "2026-05-06",
    description: "来自本地材质贴图库的静态贴图资源。",
    tags: [
      "本地材质",
      "地面"
    ]
  },
  {
    id: "material-020",
    name: "室外阳台地面水细沙",
    thumbnail: "/materials/material-020.jpg",
    category: "地面",
    date: "2026-05-06",
    description: "来自本地材质贴图库的静态贴图资源。",
    tags: [
      "本地材质",
      "地面"
    ]
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
    targetAspectRatio: '16:9',
    aspectRatio: '16:9',
    qualityMode: 'balanced',
    lighting: "黄金时刻 (室外)",
    materialStrength: 0.8,
    batchCount: 1,
    buildingType: "自动判断",
    spaceType: "自动判断",
    renderStyle: "写实彩平",
    smartMaterial: "自动判断",
    changeStrength: 'medium',
    floorplanOutputMode: 'single',
    floorplanVariantType: 'material_style',
    floorplanVariantFocus: 'material_style',
    floorplanRenderMode: 'semi-3d',
    lineworkPreservation: 'high',
    enableLegend: false,
    enableAreaText: false,
    enableMaterialLegend: false,
    floorplanRoomLabels: [],
    floorplanTemplateId: 'residential-warm-wood',
  },
  [GenerationStep.StyleRender]: {
    prompt: "",
    targetAspectRatio: '16:9',
    aspectRatio: '16:9',
    qualityMode: 'balanced',
    style: "现代建筑可视化",
    lighting: "自然均匀日光",
    materialStrength: 0.8,
    batchCount: 1,
    buildingType: "自动判断",
    spaceType: "自动判断",
    renderStyle: "现代建筑可视化",
    smartMaterial: "自动判断",
    changeStrength: 'medium',
  },
  [GenerationStep.LocalInpainting]: {
    prompt: "",
    targetAspectRatio: '16:9',
    aspectRatio: '16:9',
    qualityMode: 'balanced',
    style: "匹配原图",
    lighting: "匹配原图",
    materialStrength: 0.8,
    batchCount: 1,
    editTarget: 'general',
    inpaintingStrength: 'medium',
    strength: 'medium',
    keepOriginalMaterial: true,
    preserveStructure: true,
    feather: 0,
    buildingType: "自动判断",
    spaceType: "自动判断",
    renderStyle: "匹配原图",
    smartMaterial: "自动判断",
    changeStrength: 'medium',
  },
  [GenerationStep.ModelSnapshotRender]: {
    prompt: "",
    qualityMode: 'balanced',
    style: "写实建筑表现",
    lighting: "自然光",
    materialStrength: 0.8,
    batchCount: 1,
    buildingType: "住宅",
    spaceType: "外立面",
    renderStyle: "现代极简",
    smartMaterial: "浅色石材",
    atmosphere: "日景",
    changeStrength: 'medium',
    preserveGeometry: true,
  },
  [GenerationStep.DesignVariants]: {
    prompt: "",
    targetAspectRatio: '16:9',
    aspectRatio: '16:9',
    qualityMode: 'balanced',
    style: "方案变体",
    lighting: "匹配原图",
    materialStrength: 0.8,
    batchCount: 4,
    stylePackId: 'interior-common',
    variantStrategy: 'style-matrix',
    variantStyles: ['modern-minimal', 'cream-style', 'light-luxury', 'natural-wood'],
    variantNames: ['方案 A', '方案 B', '方案 C', '方案 D'],
    variantChangeScope: 'full-design',
    variantLocks: ['structure', 'camera', 'walls-openings'],
    variantStrategyNotes: [],
    customPrompt: "",
    preserveStructure: true,
    preserveCamera: true,
    strength: 'balanced',
    buildingType: "自动判断",
    spaceType: "自动判断",
    smartMaterial: "自动判断",
    changeStrength: 'medium',
  },
  [GenerationStep.PlanColorize]: {
    prompt: "",
    targetAspectRatio: '16:9',
    aspectRatio: '16:9',
    qualityMode: 'balanced',
    style: "图纸智能表达",
    lighting: "匹配原图",
    materialStrength: 0.8,
    batchCount: 1,
    drawingType: 'residential',
    template: 'colored-plan',
    enableZoningColor: true,
    enableRoomLabels: false,
    enableFurnitureEnhance: true,
    enableCirculationArrows: false,
    enableScaleEnhance: true,
    enableLandscapeFill: false,
    preserveLinework: true,
    customPrompt: "",
    manualRoomLabels: [],
    buildingType: "自动判断",
    spaceType: "自动判断",
    renderStyle: "图纸智能表达",
    smartMaterial: "自动判断",
    changeStrength: 'medium',
  },
  [GenerationStep.MaterialReplace]: {
    prompt: "",
    targetAspectRatio: '16:9',
    aspectRatio: '16:9',
    qualityMode: 'balanced',
    style: "材质软装替换",
    lighting: "匹配原图",
    materialStrength: 0.8,
    batchCount: 1,
    editTarget: 'material',
    editMode: 'smart-type',
    customMaterialPrompt: "",
    materialReferenceAssetIds: [],
    materialPatternScale: 'medium',
    materialDirection: 'auto',
    materialFinish: 'matte',
    materialReplaceScope: 'material-only',
    preserveLighting: true,
    preserveGeometry: true,
    preserveStructure: true,
    strength: 'balanced',
    feather: 0,
    buildingType: "自动判断",
    spaceType: "自动判断",
    renderStyle: "匹配原图",
    smartMaterial: "自动判断",
    changeStrength: 'medium',
  },
  [GenerationStep.PanoramaQuickRender]: {
    prompt: "",
    qualityMode: 'high',
    style: "漫游全景快渲",
    lighting: "自然光",
    materialStrength: 0.8,
    batchCount: 1,
    preserveGeometry: true,
    panoramaChangeStrength: 'medium',
    panoramaQuality: 'high',
    buildingType: "自动判断",
    spaceType: "自动判断",
    renderStyle: "电影级写实",
    smartMaterial: "自动判断",
    atmosphere: "自然光",
    changeStrength: 'medium',
  },
  [GenerationStep.ObjectInsert]: {
    prompt: "",
    targetAspectRatio: '16:9',
    aspectRatio: '16:9',
    qualityMode: 'balanced',
    style: "元素植入",
    lighting: "匹配原图",
    materialStrength: 0.8,
    batchCount: 1,
    preserveStructure: true,
    preserveCamera: true,
    customPrompt: "",
    objectInsertExtraPrompt: "",
    objectInsertUIMode: 'simple',
    objectInsertCandidateStrategy: 'natural-fit',
    objectInsertCandidateStrategies: ['natural-fit'],
    objectInsertCandidatePromptHints: [],
    objectInsertSurface: 'auto',
    objectFidelity: 'balanced',
    enforceContactShadow: true,
    enforceOcclusion: true,
    enforcePerspectiveScale: true,
    objectPlacement: {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      rotation: 0,
    },
  },
  [GenerationStep.FreeReferenceImage]: {
    prompt: "",
    aspectRatio: '16:9',
    qualityMode: 'balanced',
    style: "自由参考生图",
    lighting: "匹配原图",
    materialStrength: 0.8,
    batchCount: 1,
    preserveStructure: true,
    preserveCamera: true,
    freeReferenceReferences: [],
    freeReferenceResolution: 1024,
    freeReferenceAspectRatio: '16:9',
    targetAspectRatio: '16:9',
  },
  [GenerationStep.ImagePolish]: {
    prompt: IMAGE_POLISH_PROMPT,
    negativePrompt: IMAGE_POLISH_NEGATIVE_PROMPT,
    qualityMode: 'balanced',
    style: '质感提升',
    lighting: '匹配原图',
    materialStrength: 0.2,
    batchCount: 1,
    targetCount: 1,
    preserveStructure: true,
    preserveCamera: true,
    preserveColor: true,
    preserveMaterialAppearance: true,
    keepOriginalAspectRatio: true,
    strength: 'weak',
    changeStrength: 'weak',
    styleStrength: 'low',
    aspectRatio: 'source',
  },
};

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  // =========================
  // 1. 平面-三维模板
  // =========================
  {
    id: 'floorplan-modern-courtyard-house',
    title: '现代庭院住宅彩平',
    category: '住宅',
    feature: 'floorplan',
    previewImage:
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&q=80&w=1200',
    description: '适合将黑白住宅平面图转为低层现代庭院住宅三维彩平，突出院落、灰空间、木材和自然光。',
    tags: ['住宅', '庭院', '现代', '彩平', '低层建筑'],
    recommendedStyle: '现代主义',
    recommendedLighting: '自然均匀日光',
    recommendedMaterialStrength: 0.8,
    useCase: '适合别墅、合院、小型住宅、庭院住宅的平面图转三维彩平。',
    suitableImages: ['住宅平面图', '别墅或合院平面', '小型庭院住宅黑白平面图'],
    promptText:
      '请将上传的黑白住宅平面图转换为现代庭院住宅风格的彩色三维效果平面图。保持原始平面图中的墙体关系、房间比例、门窗位置和院落组织逻辑，生成俯视或轻微斜俯视角度的三维彩平效果。空间应体现低层住宅的院落关系、灰空间、自然采光和室内外过渡。材质以浅色混凝土、温暖木饰面、玻璃、浅灰石材和少量绿植为主。家具布置应合理、克制，强化居住尺度和空间可读性。输出应干净、真实、专业，适合建筑方案汇报，不要出现文字、水印、尺寸标注或额外边框。',
    config: {
      prompt:
        '偏现代庭院住宅风格，强调院落、灰空间、自然采光、浅色混凝土、木饰面和绿植，保持原始平面布局清晰可读。',
      style: '现代主义',
      lighting: '自然均匀日光',
      materialStrength: 0.8,
    },
  },
  {
    id: 'floorplan-commercial-office',
    title: '商业办公彩色轴测',
    category: '办公商业',
    feature: 'floorplan',
    previewImage:
      'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&q=80&w=1200',
    description: '适合办公、共享空间、商业平面图转三维彩平，强调开放办公、会议空间和材料分区。',
    tags: ['办公', '商业', '轴测', '开放空间', '现代'],
    recommendedStyle: '现代办公',
    recommendedLighting: '明亮日光',
    recommendedMaterialStrength: 0.75,
    useCase: '适合办公室、联合办公、商业空间、售楼处、展示办公区的平面图表达。',
    suitableImages: ['办公空间平面图', '商业空间平面图', '共享办公或售楼处黑白平面'],
    promptText:
      '请将上传的黑白商业办公平面图转换为高质量彩色三维轴测平面图。保持原始平面图的功能分区、墙体边界、交通流线和空间比例，自动识别开放办公区、会议室、接待区、洽谈区、茶水区和辅助空间。请使用现代办公空间设计语言，加入合理的办公家具、玻璃隔断、地毯、木饰面、白色墙面、浅灰地面和局部品牌色点缀。整体光线明亮、空间层次清晰，适合设计汇报和商业展示。输出应为俯视或轻微斜俯视的三维彩平，不要生成街景透视图、文字、水印、尺寸标注或 UI 元素。',
    config: {
      prompt:
        '偏现代商业办公彩平，强调开放办公、会议室、玻璃隔断、办公家具、地毯分区和明亮专业的空间氛围。',
      style: '现代办公',
      lighting: '明亮日光',
      materialStrength: 0.75,
    },
  },
  {
    id: 'floorplan-new-chinese-residence',
    title: '新中式住宅彩平',
    category: '住宅',
    feature: 'floorplan',
    previewImage:
      'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&q=80&w=1200',
    description: '适合住宅平面转新中式三维彩平，突出木格栅、浅石材、东方秩序和温润居住氛围。',
    tags: ['住宅', '新中式', '东方', '木格栅', '彩平'],
    recommendedStyle: '新中式',
    recommendedLighting: '柔和自然光',
    recommendedMaterialStrength: 0.85,
    useCase: '适合大平层、会所、住宅样板间、中式庭院住宅的平面图转彩平。',
    suitableImages: ['大平层住宅平面图', '会所或样板间平面', '中式庭院住宅平面图'],
    promptText:
      '请将上传的黑白住宅平面图转换为新中式风格的彩色三维效果平面图。保持原始空间边界、墙体关系、门窗位置和功能分区，输出俯视或轻微斜俯视的三维彩平。整体设计应体现东方空间秩序、对称感和温润材质。材质使用浅色石材、深浅木饰面、木格栅、米白墙面、局部水景或绿植点缀。家具和软装应简洁、雅致，有东方气质但不过度装饰。画面应干净、真实、专业，适合设计汇报，不要出现文字、水印、尺寸标注、标题栏或边框。',
    config: {
      prompt:
        '偏新中式住宅彩平，使用木格栅、浅石材、米白墙面、东方软装和温润自然光，保持空间布局清晰。',
      style: '新中式',
      lighting: '柔和自然光',
      materialStrength: 0.85,
    },
  },

  // =========================
  // 2. 风格渲染模板
  // =========================
  {
    id: 'style-render-wabi-sabi',
    title: '日式侘寂空间',
    category: '风格渲染',
    feature: 'style-render',
    previewImage:
      'https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&q=80&w=1200',
    description: '将参考图渲染为安静、克制、自然肌理丰富的日式侘寂风格。',
    tags: ['侘寂', '日式', '自然材质', '微水泥', '安静'],
    recommendedStyle: '日式侘寂',
    recommendedLighting: '柔和漫射光',
    recommendedMaterialStrength: 0.8,
    useCase: '适合室内空间、民宿、茶室、住宅客厅、卧室等安静氛围空间。',
    suitableImages: ['室内空间参考图', '民宿或茶室空间图', '住宅客厅或卧室效果图'],
    promptText:
      '请基于上传的参考图生成日式侘寂风格的高质量空间渲染效果。保持原始参考图的主体对象、空间构图、视角关系和主要轮廓，不要随意改变空间结构。整体风格应安静、克制、自然，使用微水泥、浅木、亚麻织物、米白墙面、粗陶器物、自然石材和少量枯枝或绿植。光线应柔和、低对比、具有自然漫射感。请减少复杂装饰，强调留白、材质肌理、手工质感和时间感。输出真实、干净、专业的设计效果图，不要出现文字、水印、尺寸标注、边框或额外 UI 元素。',
    config: {
      prompt:
        '保留原始构图和空间关系，渲染为日式侘寂风格，使用微水泥、浅木、亚麻、自然石材、柔和漫射光，整体安静克制。',
      style: '日式侘寂',
      lighting: '柔和漫射光',
      materialStrength: 0.8,
    },
  },
  {
    id: 'style-render-nordic-warm',
    title: '北欧温暖风格',
    category: '风格渲染',
    feature: 'style-render',
    previewImage:
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&q=80&w=1200',
    description: '将参考图渲染为明亮、舒适、温暖的北欧居住空间。',
    tags: ['北欧', '暖木', '明亮', '住宅', '舒适'],
    recommendedStyle: '北欧温暖',
    recommendedLighting: '自然日光',
    recommendedMaterialStrength: 0.75,
    useCase: '适合客厅、卧室、餐厅、公寓、住宅样板间等空间渲染。',
    suitableImages: ['客厅参考图', '卧室或餐厅空间图', '公寓和住宅样板间效果图'],
    promptText:
      '请基于上传的参考图生成北欧温暖风格的高质量渲染效果图。保持参考图中的主体内容、构图、视角和空间比例关系。整体采用浅木色、暖白墙面、浅灰织物、柔软地毯、简洁家具、自然绿植和温和自然光。空间应明亮、舒适、干净，有真实生活感但不过度杂乱。请增强材质真实感、软装层次、光影细节和空间温度。输出适合设计汇报的专业效果图，不要出现文字、水印、尺寸标注、边框或额外 UI 元素。',
    config: {
      prompt:
        '保留原始构图，改成北欧温暖风格，使用浅木、暖白墙面、浅灰织物、自然光、绿植和舒适软装。',
      style: '北欧温暖',
      lighting: '自然日光',
      materialStrength: 0.75,
    },
  },
  {
    id: 'style-render-italian-luxury',
    title: '意式轻奢渲染',
    category: '风格渲染',
    feature: 'style-render',
    previewImage:
      'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&q=80&w=1200',
    description: '将参考图渲染为高级、克制、有材质质感的意式轻奢空间。',
    tags: ['意式', '轻奢', '大理石', '金属', '高级'],
    recommendedStyle: '意式轻奢',
    recommendedLighting: '高级柔和灯光',
    recommendedMaterialStrength: 0.85,
    useCase: '适合高端住宅、会所、样板间、客厅、餐厅、主卧空间。',
    suitableImages: ['高端住宅参考图', '会所或样板间空间图', '客厅、餐厅或主卧效果图'],
    promptText:
      '请基于上传的参考图生成意式轻奢风格的高质量渲染效果图。保持参考图的构图、视角、主体空间关系和主要轮廓，不要随意改变结构。整体风格应高级、克制、精致，使用浅色或深色大理石、木饰面、皮革、金属线条、柔和灯带、低饱和高级灰和局部暖色点缀。家具比例应优雅，材质反射真实，空间层次清晰。请增强灯光氛围、材质质感和细节完成度。输出真实、干净、专业的设计效果图，不要出现文字、水印、尺寸标注、边框或额外 UI 元素。',
    config: {
      prompt:
        '保留原始构图，渲染为意式轻奢风格，强化大理石、木饰面、皮革、金属线条、柔和灯带和高级灰色调。',
      style: '意式轻奢',
      lighting: '高级柔和灯光',
      materialStrength: 0.85,
    },
  },

  // =========================
  // 3. 局部修饰模板
  // =========================
  {
    id: 'inpaint-living-room-material-upgrade',
    title: '客厅材质提升',
    category: '局部修饰',
    feature: 'inpaint',
    previewImage:
      'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&q=80&w=1200',
    description: '适合对客厅局部区域进行墙面、地面、家具和软装材质质感提升。',
    tags: ['客厅', '材质提升', '软装', '局部优化'],
    recommendedStyle: '匹配原图',
    recommendedLighting: '匹配原图',
    recommendedMaterialStrength: 0.7,
    useCase: '适合已有客厅效果图中的局部材质、软装、墙面或家具质感优化。',
    suitableImages: ['客厅效果图', '墙面或地面局部选区', '家具和软装材质优化区域'],
    promptText:
      '提升客厅材质真实感和设计完成度，例如优化墙面质感、地面材质、沙发织物、茶几、地毯、装饰画、绿植和局部灯光。',
    config: {
      prompt:
        '提升客厅局部材质、软装、墙面、地面、家具和灯光细节。',
      style: '匹配原图',
      lighting: '匹配原图',
      materialStrength: 0.7,
      inpaintingStrength: 'medium',
      keepOriginalMaterial: true,
    },
  },
  {
    id: 'inpaint-kitchen-lighting-refine',
    title: '厨房灯光优化',
    category: '局部修饰',
    feature: 'inpaint',
    previewImage:
      'https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&q=80&w=1200',
    description: '适合优化厨房区域的灯光、柜体、台面、墙砖和空间明亮度。',
    tags: ['厨房', '灯光', '橱柜', '石材', '局部修饰'],
    recommendedStyle: '匹配原图',
    recommendedLighting: '柔和功能照明',
    recommendedMaterialStrength: 0.75,
    useCase: '适合厨房局部过暗、材质单薄、柜体或台面不够精致的效果图修饰。',
    suitableImages: ['厨房效果图', '橱柜与台面局部选区', '厨房灯光和材质优化区域'],
    promptText:
      '增强厨房的功能照明和材质细节，包括柜体面板、石材台面、墙面砖、金属五金、灯带、吊灯或局部反射。',
    config: {
      prompt:
        '优化厨房区域的功能照明、柜体、石材台面、墙砖、金属五金和灯带细节。',
      style: '匹配原图',
      lighting: '柔和功能照明',
      materialStrength: 0.75,
      inpaintingStrength: 'medium',
      keepOriginalMaterial: true,
    },
  },
  {
    id: 'inpaint-wood-veneer-replace',
    title: '木饰面替换',
    category: '局部修饰',
    feature: 'inpaint',
    previewImage:
      'https://images.unsplash.com/photo-1615874694520-474822394e73?auto=format&fit=crop&q=80&w=1200',
    description: '适合将局部墙面、柜体或背景板替换为更高级的木饰面材质。',
    tags: ['木饰面', '背景墙', '柜体', '材质替换', '局部重绘'],
    recommendedStyle: '匹配原图',
    recommendedLighting: '匹配原图',
    recommendedMaterialStrength: 0.85,
    useCase: '适合电视背景墙、柜体、卧室墙面、走廊墙面等局部材质替换。',
    suitableImages: ['电视背景墙选区', '柜体或卧室墙面局部图', '走廊墙面材质替换区域'],
    promptText:
      '将目标区域替换为木饰面材质，木纹真实、尺度合理、反射自然，并具有高级质感。',
    config: {
      prompt:
        '将目标区域替换为高级木饰面，木纹真实、尺度合理、边缘自然融合。',
      style: '匹配原图',
      lighting: '匹配原图',
      materialStrength: 0.85,
      inpaintingStrength: 'strong',
      keepOriginalMaterial: false,
    },
  },
];
