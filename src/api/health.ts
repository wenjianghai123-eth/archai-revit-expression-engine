import { GenerationProvider } from '../types';

export interface BackendHealth {
  ok: boolean;
  version: string;
  provider: GenerationProvider;
}

export async function getBackendHealth(): Promise<BackendHealth> {
  let response: Response;
  try {
    response = await fetch('/api/health');
  } catch {
    throw new Error('无法连接后端服务，请确认 npm run dev:server 已启动。');
  }

  if (!response.ok) {
    throw new Error(`后端健康检查失败（HTTP ${response.status}）。`);
  }

  return parseBackendHealth(await response.json());
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
  return value === 'mock' || value === 'gemini' || value === 'grsai-nano-banana';
}
