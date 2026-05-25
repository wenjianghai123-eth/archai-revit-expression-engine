import { NextFunction, Request, Response } from 'express';
import { getCurrentUser } from './auth';

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface ApiError {
  message: string;
  code: string;
}

export function apiOk<T>(data: T): ApiResponse<T> {
  return { ok: true, data };
}

export function apiError(message: string, code: string): ApiResponse<never> {
  return { ok: false, error: { message, code } };
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

    if (isPayloadTooLargeError(error)) {
      res.status(413).json(apiError(`Request body is too large. Current API limit is ${jsonLimit}.`, 'REQUEST_BODY_TOO_LARGE'));
      return;
    }

    if (isJsonParseError(error)) {
      res.status(400).json(apiError('Request body must be valid JSON.', 'INVALID_JSON_BODY'));
      return;
    }

    res.status(500).json(apiError(resolveErrorResponseMessage(error), safeError.code || 'INTERNAL_SERVER_ERROR'));
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

function resolveErrorResponseMessage(error: unknown): string {
  if (process.env.NODE_ENV !== 'production' && error instanceof Error && error.message.trim().length > 0) {
    return sanitizeLogText(error.message);
  }

  return 'Server failed to process the request. Please try again later.';
}

function sanitizeStackForLog(stack: string | undefined): string[] | undefined {
  if (!stack) return undefined;
  return stack.split(/\r?\n/u).slice(0, 6).map(line => sanitizeLogText(line));
}

export function isPayloadTooLargeError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { type?: unknown }).type === 'entity.too.large');
}

export function isJsonParseError(error: unknown): boolean {
  return error instanceof SyntaxError && Boolean(error && typeof error === 'object' && 'body' in error);
}

function readAllowedCorsOrigins(): string[] {
  const rawValue = process.env.CORS_ORIGIN || process.env.CORS_ORIGINS;
  if (!rawValue || rawValue.trim().length === 0) {
    return ['http://localhost:3000', 'http://127.0.0.1:3000'];
  }

  return rawValue.split(',').map(item => item.trim()).filter(Boolean);
}

function isCorsOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  return allowedOrigins.includes('*') || allowedOrigins.includes(origin);
}
