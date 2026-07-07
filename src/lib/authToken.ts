import type { AuthUser } from './api';

const accessTokenKey = 'auth_access_token';
const userKey = 'auth_user';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(accessTokenKey);
  } catch {
    return null;
  }
}

export function saveAuthSession(accessToken: string, user: AuthUser): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(accessTokenKey, accessToken);
  window.localStorage.setItem(userKey, JSON.stringify(user));
  if (import.meta.env.DEV) {
    console.debug('[auth] token saved', {
      hasToken: Boolean(window.localStorage.getItem(accessTokenKey)),
    });
  }
}

export function clearAuthSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(accessTokenKey);
    window.localStorage.removeItem(userKey);
  } catch {
    // Ignore storage errors during logout.
  }
}

export function readStoredAuthUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(userKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    if (
      typeof parsed.id === 'string' &&
      typeof parsed.email === 'string' &&
      typeof parsed.name === 'string' &&
      (parsed.role === 'admin' || parsed.role === 'member') &&
      (parsed.status === 'active' || parsed.status === 'disabled') &&
      typeof parsed.createdAt === 'string'
    ) {
      return parsed as AuthUser;
    }
  } catch {
    return null;
  }
  return null;
}
