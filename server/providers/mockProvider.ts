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
  const warnings = [
    '当前为服务端 mock provider，未调用真实模型。',
    ...extraWarnings,
  ];

  if (input.mode === 'floorplan' && !input.materialImageDataUrl) {
    warnings.push('未提供参考材质图，mock 结果使用默认材质语义。');
  }

  if (input.mode === 'inpaint' && input.maskMode === 'full-image') {
    warnings.push('Mock inpaint 已明确使用整图重绘 mask。');
  } else if (input.mode === 'inpaint' && !input.maskImageDataUrl) {
    warnings.push('未提供 maskImageDataUrl，mock 结果未进行真实局部区域约束。');
  }

  if (input.mode === 'inpaint' && input.maskImageDataUrl) {
    warnings.push('Mock inpaint 已接收 maskImageDataUrl，仅用于开发占位，不代表真实局部重绘能力。');
  }

  return {
    id: crypto.randomUUID(),
    provider: 'mock',
    dataUrl: createMockImageDataUrl(input.mode, input.prompt, createdAt),
    mimeType: 'image/svg+xml',
    createdAt,
    warnings,
  };
}

function createMockImageDataUrl(mode: 'floorplan' | 'style-render' | 'inpaint', prompt: string, createdAt: string): string {
  const title = {
    floorplan: 'Mock Floorplan Generation',
    'style-render': 'Mock Style Render Generation',
    inpaint: 'Mock Inpaint Generation',
  }[mode];
  const promptPreview = prompt.length > 90 ? `${prompt.slice(0, 90)}...` : prompt;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#e2e8f0"/>
          <stop offset="100%" stop-color="#bfdbfe"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="800" fill="url(#bg)"/>
      <rect x="96" y="96" width="1008" height="608" rx="18" fill="#ffffff" opacity="0.82"/>
      ${mode === 'inpaint' ? '<rect x="360" y="310" width="480" height="230" rx="28" fill="#fb7185" opacity="0.28"/><rect x="380" y="330" width="440" height="190" rx="22" fill="none" stroke="#be123c" stroke-width="8" stroke-dasharray="18 14"/>' : ''}
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

function escapeSvg(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
