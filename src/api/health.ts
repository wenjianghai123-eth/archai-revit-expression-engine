import { buildApiUrl } from '../lib/apiBaseUrl';
import { parseApiResponse } from '../lib/apiResponse';
import { GenerationProvider } from '../types';
import { isAbortError } from '../utils/apiConnectionStatus';

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
    throw new Error('无法连接后端服务，请确认本地服务已启动或刷新重试。');
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
