import { NextFunction, Request, Response } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

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

type AuthFailure = { status: 403; message: string; code: string };
type RequestWithUser = Request & { authUser?: AuthUser; authFailure?: AuthFailure };

let supabaseAdminClient: SupabaseClient | null = null;

export async function attachAuthUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authMode = process.env.AUTH_MODE || 'dev';

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

  if (authMode !== 'supabase') {
    console.warn(`Unsupported AUTH_MODE=${authMode}; falling back to dev auth user.`);
    (req as RequestWithUser).authUser = devAuthUser;
    next();
    return;
  }

  try {
    const token = readBearerToken(req);
    if (!token) {
      next();
      return;
    }

    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      next();
      return;
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      next();
      return;
    }

    const { getUserProfile } = await import('./storage');
    const profile = await getUserProfile(data.user.id);
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
      id: data.user.id,
      email: profile.email || data.user.email || '',
      name: profile.name || readUserName(data.user.user_metadata) || data.user.email || 'Supabase User',
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

export function getRequiredCurrentUser(req: Request): AuthUser {
  return (req as RequestWithUser).authUser ?? devAuthUser;
}

function readBearerToken(req: Request): string | null {
  const authorization = req.headers.authorization;
  if (!authorization) return null;

  const [scheme, token] = authorization.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

function getSupabaseAdminClient(): SupabaseClient | null {
  if (supabaseAdminClient) return supabaseAdminClient;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('AUTH_MODE=supabase requires SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY.');
    return null;
  }

  supabaseAdminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseAdminClient;
}

function readUserName(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const name = (metadata as Record<string, unknown>).name || (metadata as Record<string, unknown>).full_name;
  return typeof name === 'string' && name.trim().length > 0 ? name.trim() : null;
}

