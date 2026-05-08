import { GenerationConfig, GenerationProvider } from '../types';

interface GenerationRequest {
  inputImageDataUrl: string;
  materialImageDataUrl?: string;
  maskImageDataUrl?: string;
  prompt: string;
  config: GenerationConfig;
}

export interface GenerationResponse {
  id: string;
  provider: GenerationProvider;
  imageDataUrl: string;
  createdAt: string;
  warnings: string[];
}

export function generateFloorplanTo3D(request: GenerationRequest): Promise<GenerationResponse> {
  return postGeneration('/api/generate/floorplan', request);
}

export function generateStyleRender(request: GenerationRequest): Promise<GenerationResponse> {
  return postGeneration('/api/generate/style-render', request);
}

export function generateInpainting(request: GenerationRequest): Promise<GenerationResponse> {
  return postGeneration('/api/generate/inpaint', request);
}

async function postGeneration(endpoint: string, request: GenerationRequest): Promise<GenerationResponse> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
  } catch {
    throw new Error('无法连接后端服务，请确认 npm run dev:server 已启动。');
  }

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return parseGenerationResponse(await response.json());
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (isRecord(body) && typeof body.error === 'string') {
      return body.error;
    }
  } catch {
    // Fall through to the generic message below.
  }

  return `生成请求失败（HTTP ${response.status}）。`;
}

function parseGenerationResponse(value: unknown): GenerationResponse {
  if (!isRecord(value)) {
    throw new Error('生成服务返回了无效响应。');
  }

  if (
    typeof value.id !== 'string' ||
    !isGenerationProvider(value.provider) ||
    typeof value.imageDataUrl !== 'string' ||
    typeof value.createdAt !== 'string' ||
    !Array.isArray(value.warnings) ||
    !value.warnings.every(item => typeof item === 'string')
  ) {
    throw new Error('生成服务返回字段不完整。');
  }

  return {
    id: value.id,
    provider: value.provider,
    imageDataUrl: value.imageDataUrl,
    createdAt: value.createdAt,
    warnings: value.warnings,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isGenerationProvider(value: unknown): value is GenerationProvider {
  return value === 'mock' || value === 'gemini' || value === 'grsai-banana2' || value === 'grsai-nano-banana';
}
