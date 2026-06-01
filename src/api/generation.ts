import { buildApiUrl } from '../lib/apiBaseUrl';
import { parseApiResponse } from '../lib/apiResponse';
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
  imageUrl?: string | null;
  outputImageUrl?: string | null;
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
    response = await fetch(buildApiUrl(endpoint), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
  } catch {
    throw new Error('无法连接后端服务，请确认后端服务已启动，并检查 VITE_API_BASE_URL 是否指向后端域名。');
  }

  const body = await parseApiResponse<unknown>(response);

  if (body === null) {
    if (response.ok) {
      throw new Error(`生成服务返回空响应。status=${response.status}`);
    }

    throw new Error(`生成请求失败（HTTP ${response.status}）。`);
  }

  if (!response.ok) {
    if (isRecord(body) && typeof body.error === 'string') {
      throw new Error(body.error);
    }

    if (isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string') {
      throw new Error(body.error.message);
    }

    throw new Error(`生成请求失败（HTTP ${response.status}）。`);
  }

  return parseGenerationResponse(body);
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
    imageUrl: typeof value.imageUrl === 'string' ? value.imageUrl : null,
    outputImageUrl: typeof value.outputImageUrl === 'string' ? value.outputImageUrl : null,
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
