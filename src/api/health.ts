import { buildApiUrl } from '../lib/apiBaseUrl';
import { parseApiResponse } from '../lib/apiResponse';
import { GenerationProvider } from '../types';
import { isAbortError } from '../utils/apiConnectionStatus';

const backendUnavailableMessage = '后端服务暂不可用，请稍后重试或检查 VITE_API_BASE_URL 是否指向已部署的 Express 后端。';

export interface BackendHealth {
  ok: boolean;
  version: string;
  provider: GenerationProvider;
}

export async function getBackendHealth(signal?: AbortSignal): Promise<BackendHealth> {
  let response: Response;
  try {
    response = await fetch(buildApiUrl('/api/health'), { signal });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new Error(backendUnavailableMessage);
  }

  if (isLikelySpaFallbackResponse(response)) {
    throw new Error(backendUnavailableMessage);
  }

  const body = await parseApiResponse<unknown>(response);

  if (body === null) {
    throw new Error(`后端健康检查返回空响应。status=${response.status}`);
  }

  return parseBackendHealth(body);
}

function parseBackendHealth(value: unknown): BackendHealth {
  if (!isRecord(value)) {
    throw new Error('后端健康检查返回了无效响应。');
  }

  if (
    value.ok !== true ||
    typeof value.version !== 'string' ||
    !isGenerationProvider(value.provider)
  ) {
    throw new Error('后端健康检查字段不完整。');
  }

  return {
    ok: value.ok,
    version: value.version,
    provider: value.provider,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isGenerationProvider(value: unknown): value is GenerationProvider {
  return value === 'mock'
    || value === 'gemini'
    || value === 'grsai-banana2'
    || value === 'grsai-nano-banana'
    || value === 'apiyi-nano-banana2-edit';
}

function isLikelySpaFallbackResponse(response: Response): boolean {
  const contentType = response.headers.get('Content-Type') || '';
  return response.ok && contentType.toLowerCase().includes('text/html');
}
