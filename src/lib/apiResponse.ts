export interface ParsedApiResponse<T> {
  status: number;
  data: T | null;
}

const SAFE_INTERNAL_SERVICE_ERROR_MESSAGE = '当前服务暂时不可用，请稍后重试。';
const INTERNAL_ERROR_CODES = new Set([
  'SUPABASE_SCHEMA_MISMATCH',
  'PGRST205',
  'INTERNAL_SERVICE_ERROR',
]);
const INTERNAL_ERROR_PATTERNS = [
  /SUPABASE_SCHEMA_MISMATCH/iu,
  /PGRST205/iu,
  /public\.project_design_workflows/iu,
  /schema cache/iu,
  /SUPABASE_SETUP\.md/iu,
  /service_role/iu,
];

export async function parseApiResponse<T>(response: Response): Promise<T | null> {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();

  if (!text.trim()) {
    throw new Error(`API returned empty response. status=${response.status}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `API returned non-JSON response. status=${response.status}, body=${text.slice(0, 300)}`,
    );
  }

  if (!response.ok) {
    const message = readApiErrorMessage(data) || `API request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

export async function parseApiResponseEnvelope<T>(response: Response): Promise<ParsedApiResponse<T>> {
  const data = await parseApiResponse<T>(response);
  return {
    status: response.status,
    data,
  };
}

export function readApiErrorMessage(value: unknown, fallbackStatus?: number): string | null {
  const code = readApiErrorCode(value);
  if (isInternalErrorCode(code) || containsInternalErrorDetails(value)) {
    return SAFE_INTERNAL_SERVICE_ERROR_MESSAGE;
  }
  if (code === 'AUTH_REQUIRED') {
    return '请先登录。';
  }
  if (code === 'AUTH_INVALID') {
    return '登录已过期，请重新登录。';
  }
  if (code === 'TOKEN_EXPIRED') {
    return '登录状态已失效，请重新登录。';
  }
  if (code === 'API_ROUTE_NOT_FOUND') {
    return '接口地址不存在，请检查前后端 API 路径或后端部署配置。';
  }
  if (code === 'BACKEND_NOT_CONFIGURED') {
    return '后端服务暂不可用，请检查 VITE_API_BASE_URL 是否指向已部署的 Express 后端。';
  }
  if (code === 'AUTH_LOGIN_FAILED') {
    return '账号或密码错误';
  }
  if (code === 'AUTH_PROFILE_REQUIRED') {
    return '账号尚未由管理员激活，请联系管理员。';
  }
  if (code === 'AUTH_USER_DISABLED') {
    return '账号已停用，请联系管理员。';
  }
  if (code === 'UPLOAD_IMAGE_TYPE_INVALID') {
    return '图片格式不支持。请上传 PNG、JPG、JPEG 或 WEBP 图片。';
  }
  const message = readRawApiErrorMessage(value);
  if (message) {
    if (containsInternalErrorDetails(message)) {
      return SAFE_INTERNAL_SERVICE_ERROR_MESSAGE;
    }
    const detail = readApiErrorDetails(value);
    const base = code ? `${code}: ${message}` : message;
    return detail.length > 0 ? `${base} | ${detail.join(' | ')}` : base;
  }

  if (fallbackStatus) {
    return `API request failed with status ${fallbackStatus}`;
  }

  return null;
}

function readApiErrorDetails(value: unknown): string[] {
  const details: string[] = [];
  const error = isRecord(value) && isRecord(value.error) ? value.error : isRecord(value) ? value : null;
  if (!error) return details;

  if (typeof error.provider === 'string' && error.provider.trim().length > 0) {
    details.push(`provider=${error.provider.trim()}`);
  }
  if (typeof error.statusCode === 'number') {
    details.push(`statusCode=${error.statusCode}`);
  }
  if (typeof error.rawSnippet === 'string' && error.rawSnippet.trim().length > 0) {
    if (containsInternalErrorDetails(error.rawSnippet)) return details;
    details.push(`raw=${error.rawSnippet.trim()}`);
  }
  return details;
}

export function readApiErrorCode(value: unknown): string | null {
  if (isRecord(value)) {
    if (typeof value.code === 'string' && value.code.trim().length > 0) {
      return value.code;
    }

    if (isRecord(value.error) && typeof value.error.code === 'string' && value.error.code.trim().length > 0) {
      return value.error.code;
    }
  }

  return null;
}

function isInternalErrorCode(code: string | null): boolean {
  return Boolean(code && INTERNAL_ERROR_CODES.has(code));
}

function containsInternalErrorDetails(value: unknown): boolean {
  if (typeof value === 'string') {
    return INTERNAL_ERROR_PATTERNS.some(pattern => pattern.test(value));
  }
  if (!isRecord(value)) return false;
  if (typeof value.code === 'string' && isInternalErrorCode(value.code)) return true;
  if (typeof value.message === 'string' && containsInternalErrorDetails(value.message)) return true;
  if (typeof value.details === 'string' && containsInternalErrorDetails(value.details)) return true;
  if (typeof value.hint === 'string' && containsInternalErrorDetails(value.hint)) return true;
  if (isRecord(value.error)) return containsInternalErrorDetails(value.error);
  if (typeof value.error === 'string') return containsInternalErrorDetails(value.error);
  return false;
}

function readRawApiErrorMessage(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (isRecord(value)) {
    if (typeof value.message === 'string' && value.message.trim().length > 0) {
      return value.message;
    }

    if (typeof value.error === 'string' && value.error.trim().length > 0) {
      return value.error;
    }

    if (isRecord(value.error) && typeof value.error.message === 'string' && value.error.message.trim().length > 0) {
      return value.error.message;
    }
  }

  return null;
}

export function readNonJsonResponseError(response: Response, body: string): Error {
  return new Error(
    `API returned non-JSON response. status=${response.status}, body=${body.slice(0, 300)}`,
  );
}

function readErrorMessage(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (isRecord(value)) {
    if (typeof value.message === 'string' && value.message.trim().length > 0) {
      return value.message;
    }

    if (typeof value.error === 'string' && value.error.trim().length > 0) {
      return value.error;
    }

    if (isRecord(value.error) && typeof value.error.message === 'string' && value.error.message.trim().length > 0) {
      return value.error.message;
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
