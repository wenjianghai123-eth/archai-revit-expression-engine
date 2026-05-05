import { NextFunction, Request, Response } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member';
  createdAt: string;
}

export const DEV_AUTH_USER_ID = 'dev-user';

export const devAuthUser: AuthUser = {
  id: DEV_AUTH_USER_ID,
  email: 'dev@archai.local',
  name: 'ArchAI Dev User',
  role: 'admin',
  createdAt: '2026-01-01T00:00:00.000Z',
};

type RequestWithUser = Request & { authUser?: AuthUser };

let supabaseAdminClient: SupabaseClient | null = null;

export async function attachAuthUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authMode = process.env.AUTH_MODE || 'dev';

  if (authMode === 'dev') {
    (req as RequestWithUser).authUser = devAuthUser;
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

    (req as RequestWithUser).authUser = {
      id: data.user.id,
      email: data.user.email || '',
      name: readUserName(data.user.user_metadata) || data.user.email || 'Supabase User',
      role: readUserRole(data.user.app_metadata) || readUserRole(data.user.user_metadata) || 'member',
      createdAt: data.user.created_at,
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

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('AUTH_MODE=supabase requires VITE_SUPABASE_URL or SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY.');
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

function readUserRole(metadata: unknown): AuthUser['role'] | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const role = (metadata as Record<string, unknown>).role;
  return role === 'admin' || role === 'member' ? role : null;
}
