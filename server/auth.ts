import { NextFunction, Request, Response } from 'express';
import { createRequire } from 'node:module';
import type { JwtPayload, SignOptions } from 'jsonwebtoken';
import type jsonwebtoken from 'jsonwebtoken';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken') as typeof jsonwebtoken;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member';
  status: 'active' | 'disabled';
  createdAt: string;
}

export const DEV_AUTH_USER_ID = 'dev-user';

export const devAuthUser: AuthUser = {
  id: DEV_AUTH_USER_ID,
  email: 'dev@archai.local',
  name: 'ArchAI Dev User',
  role: 'admin',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
};

export type AuthMode = 'dev' | 'supabase';

type AuthFailure = { status: 401 | 403; message: string; code: string };
type RequestWithUser = Request & { authUser?: AuthUser; authFailure?: AuthFailure };

interface AuthTokenPayload extends JwtPayload {
  sub: string;
  userId: string;
  email: string;
  role: AuthUser['role'];
}

export async function attachAuthUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authMode = readAuthMode();
  if (!authMode) {
    (req as RequestWithUser).authFailure = {
      status: 401,
      message: 'Authentication is required.',
      code: 'AUTH_REQUIRED',
    };
    next();
    return;
  }

  if (authMode === 'dev') {
    const role = req.headers['x-dev-user-role'] === 'member' ? 'member' : 'admin';
    const status = req.headers['x-dev-user-status'] === 'disabled' ? 'disabled' : 'active';
    if (status === 'disabled') {
      (req as RequestWithUser).authFailure = {
        status: 403,
        message: 'Account is disabled. Please contact an administrator.',
        code: 'AUTH_USER_DISABLED',
      };
    } else {
      (req as RequestWithUser).authUser = {
        ...devAuthUser,
        id: typeof req.headers['x-dev-user-id'] === 'string' ? req.headers['x-dev-user-id'] : devAuthUser.id,
        email: typeof req.headers['x-dev-user-email'] === 'string' ? req.headers['x-dev-user-email'] : devAuthUser.email,
        role,
        status,
      };
    }
    next();
    return;
  }

  try {
    const token = readBearerToken(req);
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[auth] middleware', {
        path: req.path,
        hasAuthorizationHeader: Boolean(req.headers.authorization),
        hasToken: Boolean(token),
      });
    }
    if (!token) {
      (req as RequestWithUser).authFailure = {
        status: 401,
        message: 'Authentication is required.',
        code: 'AUTH_REQUIRED',
      };
      next();
      return;
    }

    const payload = verifyAuthToken(token);
    if (!payload) {
      (req as RequestWithUser).authFailure = {
        status: 401,
        message: 'Invalid or expired token.',
        code: 'AUTH_INVALID',
      };
      next();
      return;
    }

    const { getUserProfile } = await import('./storage');
    const profile = await getUserProfile(payload.userId || payload.sub);
    if (!profile) {
      (req as RequestWithUser).authFailure = {
        status: 403,
        message: 'Account is not activated by an administrator.',
        code: 'AUTH_PROFILE_REQUIRED',
      };
      next();
      return;
    }

    if (profile.status === 'disabled') {
      (req as RequestWithUser).authFailure = {
        status: 403,
        message: 'Account is disabled. Please contact an administrator.',
        code: 'AUTH_USER_DISABLED',
      };
      next();
      return;
    }

    (req as RequestWithUser).authUser = {
      id: profile.id,
      email: profile.email || payload.email || '',
      name: profile.name || payload.email || 'ArchAI User',
      role: profile.role,
      status: profile.status,
      createdAt: profile.createdAt,
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if ((req as RequestWithUser).authUser) {
    next();
    return;
  }

  const authFailure = (req as RequestWithUser).authFailure;
  if (authFailure) {
    res.status(authFailure.status).json({
      ok: false,
      error: {
        message: authFailure.message,
        code: authFailure.code,
      },
    });
    return;
  }

  res.status(401).json({
    ok: false,
    error: {
      message: 'Authentication is required.',
      code: 'AUTH_REQUIRED',
    },
  });
}

export function getCurrentUser(req: Request): AuthUser | null {
  return (req as RequestWithUser).authUser ?? null;
}

export function getAuthFailure(req: Request): AuthFailure | null {
  return (req as RequestWithUser).authFailure ?? null;
}

export function getRequiredCurrentUser(req: Request): AuthUser {
  return (req as RequestWithUser).authUser ?? devAuthUser;
}

export function readAuthMode(): AuthMode | null {
  const authMode = process.env.AUTH_MODE || 'dev';
  if (authMode === 'dev' || authMode === 'supabase') return authMode;
  return null;
}

function readBearerToken(req: Request): string | null {
  const authorization = req.headers.authorization;
  if (!authorization) return null;

  const [scheme, token] = authorization.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

export function signAuthToken(user: AuthUser): string {
  return jwt.sign(
    {
      sub: user.id,
      userId: user.id,
      email: user.email,
      role: user.role,
    },
    readJwtSecret(),
    { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'] },
  );
}

function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    const payload = jwt.verify(token, readJwtSecret());
    if (!isAuthTokenPayload(payload)) return null;
    return payload;
  } catch (error) {
    console.warn('[auth] token verify failed', {
      reason: error instanceof Error ? error.name || error.message : String(error),
    });
    return null;
  }
}

export function readJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret?.trim()) return secret.trim();
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production.');
  }
  return 'archai-dev-jwt-secret-change-me';
}

function isAuthTokenPayload(value: string | JwtPayload): value is AuthTokenPayload {
  return typeof value !== 'string'
    && typeof value.sub === 'string'
    && typeof value.userId === 'string'
    && typeof value.email === 'string'
    && (value.role === 'admin' || value.role === 'member');
}

