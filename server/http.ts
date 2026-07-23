import { NextFunction, Request, Response } from 'express';
import { getCurrentUser } from './auth';

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface ApiError {
  message: string;
  code: string;
  provider?: string;
  statusCode?: number;
  rawSnippet?: string;
}

export function apiOk<T>(data: T): ApiResponse<T> {
  return { ok: true, data };
}

export function apiError(message: string, code: string, details: Partial<Omit<ApiError, 'message' | 'code'>> = {}): ApiResponse<never> {
  return { ok: false, error: { message, code, ...details } };
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = getCurrentUser(req);
  if (user?.role === 'admin') {
    next();
    return;
  }

  res.status(403).json(apiError('Admin permission is required.', 'ADMIN_FORBIDDEN'));
}

export function configureCors(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  const allowedOrigins = readAllowedCorsOrigins();

  if (origin && isCorsOriginAllowed(origin, allowedOrigins)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (!origin && allowedOrigins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Request-Id');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}

export function createErrorHandler(jsonLimit: string) {
  return (error: unknown, req: Request, res: Response<ApiResponse<never>>, _next: NextFunction): void => {
    const requestId = req.headers['x-request-id'];
    const safeRequestId = typeof requestId === 'string' ? sanitizeLogText(requestId) : undefined;
    const safeError = sanitizeErrorForLog(error);
    if (isSupabaseSchemaMismatchError(error)) {
      console.error('[Supabase schema mismatch]', {
        requestId: safeRequestId,
        method: req.method,
        path: req.path,
        code: safeError.code,
        message: safeError.message,
        operation: readSupabaseOperation(error),
        stack: process.env.NODE_ENV !== 'production' ? safeError.stack : undefined,
      });
    } else {
      console.error('API error', {
        requestId: safeRequestId,
        method: req.method,
        path: req.path,
        errorName: safeError.name,
        errorMessage: safeError.message,
        errorCode: safeError.code,
        errorStack: safeError.stack,
        error: safeError,
      });
    }

    if (isPayloadTooLargeError(error)) {
      res.status(413).json(apiError(`Request body is too large. Current API limit is ${jsonLimit}.`, 'REQUEST_BODY_TOO_LARGE'));
      return;
    }

    if (isJsonParseError(error)) {
      res.status(400).json(apiError('Request body must be valid JSON.', 'INVALID_JSON_BODY'));
      return;
    }

    const errorCode = isSupabaseSchemaMismatchError(error)
      ? 'INTERNAL_SERVICE_ERROR'
      : safeError.code || 'INTERNAL_SERVER_ERROR';
    res.status(resolveErrorHttpStatus(errorCode)).json(apiError(
      resolveErrorResponseMessage(error, errorCode),
      errorCode,
      errorCode === 'INTERNAL_SERVICE_ERROR' ? {} : readPublicErrorDetails(error),
    ));
  };
}

export function createGenerationJobRateLimiter(generationJobRateLimitPerMinute: number) {
  const buckets = new Map<string, { count: number; windowStartedAt: number }>();

  return (req: Request, res: Response<ApiResponse<never>>, next: NextFunction): void => {
    const user = getCurrentUser(req);
    if (!user) {
      res.status(401).json(apiError('Authentication is required before creating a generation job.', 'AUTH_REQUIRED'));
      return;
    }

    const now = Date.now();
    const windowMs = 60 * 1000;
    const bucket = buckets.get(user.id);

    if (!bucket || now - bucket.windowStartedAt >= windowMs) {
      buckets.set(user.id, { count: 1, windowStartedAt: now });
      next();
      return;
    }

    if (bucket.count >= generationJobRateLimitPerMinute) {
      res.status(429).json(apiError(
        `Generation job limit reached. Please wait a minute and try again.`,
        'GENERATION_JOB_RATE_LIMITED',
      ));
      return;
    }

    bucket.count += 1;
    next();
  };
}

export function sanitizeErrorForLog(error: unknown): { name: string; message: string; code?: string; stack?: string[] } {
  if (error instanceof Error) {
    const rawCode = (error as Error & { code?: unknown }).code;
    const code = typeof rawCode === 'string' ? rawCode : undefined;
    return { name: error.name, message: sanitizeLogText(error.message), code, stack: sanitizeStackForLog(error.stack) };
  }

  return { name: typeof error, message: sanitizeLogText(String(error)) };
}

export function sanitizeLogText(value: string): string {
  return value
    .replace(/[\r\n\t]/g, ' ')
    .replace(/(password|passwd|pwd)(["'\s:=]+)([^"',\s}]+)/giu, '$1$2[REDACTED]')
    .replace(/[^\x20-\x7E]/g, '?')
    .slice(0, 500);
}

function resolveErrorResponseMessage(error: unknown, errorCode: string): string {
  if (errorCode === 'INTERNAL_SERVICE_ERROR') {
    return '当前服务暂时不可用，请稍后重试。';
  }
  if (errorCode === 'FLOOR_PLAN_SCHEMA_NOT_READY') {
    return '平面图区域数据库尚未初始化，请管理员执行 Supabase migration 后重试。';
  }

  if (process.env.NODE_ENV !== 'production' && error instanceof Error && error.message.trim().length > 0) {
    return sanitizeLogText(error.message);
  }

  return 'Server failed to process the request. Please try again later.';
}

function resolveErrorHttpStatus(errorCode: string): number {
  return errorCode === 'FLOOR_PLAN_SCHEMA_NOT_READY' || errorCode === 'INTERNAL_SERVICE_ERROR' ? 503 : 500;
}

function readPublicErrorDetails(error: unknown): Partial<Omit<ApiError, 'message' | 'code'>> {
  if (!error || typeof error !== 'object') return {};
  const record = error as Record<string, unknown>;
  const provider = typeof record.provider === 'string' ? sanitizeLogText(record.provider) : undefined;
  const rawStatusCode = record.statusCode ?? record.status ?? record.httpStatus;
  const statusCode = typeof rawStatusCode === 'number' ? rawStatusCode : undefined;
  const rawSnippet = typeof record.rawSnippet === 'string' ? sanitizeLogText(record.rawSnippet) : undefined;
  return {
    ...(provider ? { provider } : {}),
    ...(typeof statusCode === 'number' ? { statusCode } : {}),
    ...(rawSnippet ? { rawSnippet } : {}),
  };
}

function sanitizeStackForLog(stack: string | undefined): string[] | undefined {
  if (!stack) return undefined;
  return stack.split(/\r?\n/u).slice(0, 6).map(line => sanitizeLogText(line));
}

function isSupabaseSchemaMismatchError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  const code = typeof record.code === 'string' ? record.code : undefined;
  if (code === 'SUPABASE_SCHEMA_MISMATCH' || code === 'PGRST205') return true;
  const text = [
    typeof record.message === 'string' ? record.message : '',
    typeof record.details === 'string' ? record.details : '',
    typeof record.hint === 'string' ? record.hint : '',
  ].join(' ');
  return /PGRST205|schema cache|public\.project_design_workflows|SUPABASE_SCHEMA_MISMATCH/iu.test(text);
}

function readSupabaseOperation(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const operation = (error as Record<string, unknown>).operation;
  return typeof operation === 'string' ? sanitizeLogText(operation) : undefined;
}

export function isPayloadTooLargeError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { type?: unknown }).type === 'entity.too.large');
}

export function isJsonParseError(error: unknown): boolean {
  return error instanceof SyntaxError && Boolean(error && typeof error === 'object' && 'body' in error);
}

function readAllowedCorsOrigins(): string[] {
  const defaultOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000', 'https://guangtian123-eth.netlify.app'];
  const rawValue = process.env.CORS_ORIGIN || process.env.CORS_ORIGINS;
  if (!rawValue || rawValue.trim().length === 0) {
    return defaultOrigins;
  }

  return Array.from(new Set([
    ...rawValue.split(',').map(item => item.trim()).filter(Boolean),
    'https://guangtian123-eth.netlify.app',
  ]));
}

function isCorsOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  return allowedOrigins.includes('*') || allowedOrigins.includes(origin);
}
