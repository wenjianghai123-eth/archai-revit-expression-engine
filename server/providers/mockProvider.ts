import crypto from 'node:crypto';
import { GenerateImageInput, GenerateImageOutput, ImageGenerationProvider } from './types';

export const mockProvider: ImageGenerationProvider = {
  name: 'mock',
  async generateImage(input: GenerateImageInput): Promise<GenerateImageOutput> {
    return createMockGeneration(input);
  },
};

export function createMockGeneration(input: GenerateImageInput, extraWarnings: string[] = []): GenerateImageOutput {
  const createdAt = new Date().toISOString();
  const isObjectInsert = isObjectInsertInput(input);
  const visualMode: GenerateImageInput['mode'] | 'object-insert' = isObjectInsert ? 'object-insert' : input.mode;
  const warnings = [
    '当前为服务端 mock provider，未调用真实模型。',
    ...extraWarnings,
  ];

  if (input.mode === 'floorplan' && !input.materialImageDataUrl) {
    warnings.push('未提供参考材质图，mock 结果使用默认材质语义。');
  }

  if ((input.mode === 'inpaint' || input.mode === 'material-replace') && input.maskMode === 'full-image') {
    warnings.push('Mock inpaint 已明确使用整图重绘 mask。');
  } else if ((input.mode === 'inpaint' || input.mode === 'material-replace') && !input.maskImageDataUrl) {
    warnings.push('未提供 maskImageDataUrl，mock 结果未进行真实局部区域约束。');
  }

  if ((input.mode === 'inpaint' || input.mode === 'material-replace') && input.maskImageDataUrl) {
    warnings.push('Mock inpaint 已接收 maskImageDataUrl，仅用于开发占位，不代表真实局部重绘能力。');
  }

  if (input.mode === 'model-render') {
    warnings.push('Mock model-render 已接收模型视角截图，结果仅用于开发占位。');
  }
  if (input.mode === 'panorama-roam-render') {
    warnings.push('Mock panorama-roam-render received a 2:1 panorama input; result is a development placeholder.');
  }
  if (input.mode === 'plan-colorize') {
    warnings.push('Mock plan-colorize 已接收图纸智能表达配置，结果仅用于开发占位。');
  }
  if (isObjectInsert) {
    warnings.push('Mock object-insert received source, object reference, placement preview, and mask inputs; result is a development placeholder.');
  }

  return {
    id: crypto.randomUUID(),
    provider: 'mock',
    dataUrl: createMockImageDataUrl(visualMode, input.prompt, createdAt, readMockSize(input)),
    mimeType: 'image/svg+xml',
    metadata: {
      mode: input.mode,
      step: input.step || input.config.step,
      businessMode: visualMode,
      inputSource: typeof input.config.inputSource === 'string'
        ? input.config.inputSource
        : typeof input.config.modelSnapshotMetadata === 'object' && input.config.modelSnapshotMetadata && 'inputSource' in input.config.modelSnapshotMetadata
          ? (input.config.modelSnapshotMetadata as { inputSource?: string }).inputSource
          : undefined,
      variantIndex: typeof input.config.variantIndex === 'number' ? input.config.variantIndex : undefined,
      variantLabel: typeof input.config.variantLabel === 'string' ? input.config.variantLabel : undefined,
      variantStyle: typeof input.config.variantStyle === 'string' ? input.config.variantStyle : undefined,
      batchCount: typeof input.config.batchCount === 'number' ? input.config.batchCount : undefined,
      drawingType: typeof input.config.drawingType === 'string' ? input.config.drawingType : undefined,
      template: typeof input.config.template === 'string' ? input.config.template : undefined,
      enableZoningColor: typeof input.config.enableZoningColor === 'boolean' ? input.config.enableZoningColor : undefined,
      enableRoomLabels: typeof input.config.enableRoomLabels === 'boolean' ? input.config.enableRoomLabels : undefined,
      enableFurnitureEnhance: typeof input.config.enableFurnitureEnhance === 'boolean' ? input.config.enableFurnitureEnhance : undefined,
      enableCirculationArrows: typeof input.config.enableCirculationArrows === 'boolean' ? input.config.enableCirculationArrows : undefined,
      enableScaleEnhance: typeof input.config.enableScaleEnhance === 'boolean' ? input.config.enableScaleEnhance : undefined,
      enableLandscapeFill: typeof input.config.enableLandscapeFill === 'boolean' ? input.config.enableLandscapeFill : undefined,
      preserveLinework: typeof input.config.preserveLinework === 'boolean' ? input.config.preserveLinework : undefined,
    },
    createdAt,
    warnings,
  };
}

function createMockImageDataUrl(
  mode: GenerateImageInput['mode'] | 'object-insert',
  prompt: string,
  createdAt: string,
  size: { width: number; height: number },
): string {
  const title = {
    floorplan: 'Mock Floorplan Generation',
    'style-render': 'Mock Style Render Generation',
    inpaint: 'Mock Inpaint Generation',
    'model-render': 'Mock Model Snapshot Render',
    'design-variants': 'Mock Design Variant',
    'material-replace': 'Mock Material Replace',
    'plan-colorize': 'Mock Plan Colorize',
    'panorama-roam-render': 'Mock Panorama Roam Render',
    'object-insert': 'Mock Object Insert',
  }[mode];
  const promptPreview = prompt.length > 90 ? `${prompt.slice(0, 90)}...` : prompt;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#e2e8f0"/>
          <stop offset="100%" stop-color="#bfdbfe"/>
        </linearGradient>
      </defs>
      <rect width="${size.width}" height="${size.height}" fill="url(#bg)"/>
      <rect x="${size.width * 0.08}" y="${size.height * 0.12}" width="${size.width * 0.84}" height="${size.height * 0.76}" rx="18" fill="#ffffff" opacity="0.82"/>
      ${mode === 'inpaint' || mode === 'material-replace' || mode === 'object-insert' ? '<rect x="360" y="310" width="480" height="230" rx="28" fill="#fb7185" opacity="0.28"/><rect x="380" y="330" width="440" height="190" rx="22" fill="none" stroke="#be123c" stroke-width="8" stroke-dasharray="18 14"/>' : ''}
      <path d="M220 560 L360 360 L520 480 L680 260 L980 560 Z" fill="#2563eb" opacity="0.18"/>
      <path d="M220 560 L360 360 L520 480 L680 260 L980 560" fill="none" stroke="#2563eb" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="140" y="180" fill="#0f172a" font-family="Arial, sans-serif" font-size="44" font-weight="700">${escapeSvg(title)}</text>
      <text x="140" y="245" fill="#475569" font-family="Arial, sans-serif" font-size="24">Provider: mock · ${escapeSvg(createdAt)}</text>
      <foreignObject x="140" y="300" width="920" height="160">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial, sans-serif; color: #334155; font-size: 28px; line-height: 1.45;">
          ${escapeSvg(promptPreview)}
        </div>
      </foreignObject>
    </svg>
  `;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function isObjectInsertInput(input: GenerateImageInput): boolean {
  return input.step === 'object_insert'
    || input.config.step === 'object_insert'
    || isRecord(input.config.objectInsert);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readMockSize(input: GenerateImageInput): { width: number; height: number } {
  const width = typeof input.targetWidth === 'number' && Number.isInteger(input.targetWidth) && input.targetWidth >= 64
    ? input.targetWidth
    : 1200;
  const height = typeof input.targetHeight === 'number' && Number.isInteger(input.targetHeight) && input.targetHeight >= 64
    ? input.targetHeight
    : 800;
  return { width, height };
}

function escapeSvg(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
