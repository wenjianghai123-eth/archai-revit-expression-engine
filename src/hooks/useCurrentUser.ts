import { useCallback, useEffect, useState } from 'react';
import { AuthUser, getCurrentUser, loginWithPassword } from '../lib/api';
import { clearAuthSession, getAccessToken, readStoredAuthUser, saveAuthSession } from '../lib/authToken';
import { getConfiguredApiBaseUrl } from '../lib/apiBaseUrl';

export function useCurrentUser() {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredAuthUser());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const accessToken = getAccessToken();
    if (!accessToken) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      if (import.meta.env.DEV) {
        console.debug('[auth] verify /api/me', {
          hasToken: Boolean(accessToken),
        });
      }
      const currentUser = await getCurrentUser(accessToken);
      setUser(currentUser);
      saveAuthSession(accessToken, currentUser);
    } catch (err) {
      setUser(null);
      if (isInvalidTokenError(err)) {
        clearAuthSession();
      }
      setError(readAuthErrorMessage(err, '无法读取当前用户。'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setIsSigningIn(true);
    setIsLoading(true);
    setError(null);
    setAuthMessage(null);

    try {
      const login = await loginWithPassword({ email, password });

      if (import.meta.env.DEV) {
        console.debug('[auth] login success', {
          hasUser: Boolean(login.user),
          hasAccessToken: Boolean(login.accessToken),
          userId: login.user?.id,
        });
      }

      saveAuthSession(login.accessToken, login.user);

      if (import.meta.env.DEV) {
        console.debug('[auth] verify /api/me', {
          hasToken: Boolean(getAccessToken()),
        });
      }

      const currentUser = await getCurrentUser(login.accessToken);
      saveAuthSession(login.accessToken, currentUser);
      setUser(currentUser);
      setAuthMessage(null);
    } catch (err) {
      setUser(null);
      setError(readAuthErrorMessage(err, '账号或密码错误'));
    } finally {
      setIsSigningIn(false);
      setIsLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    clearAuthSession();
    setUser(null);
    setAuthMessage(null);
    setIsLoading(false);
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    user,
    isLoading,
    error,
    isSigningIn,
    authMessage,
    isAuthConfigured: isAuthConfigured(),
    refresh,
    signInWithEmail,
    signOut,
  };
}

function isAuthConfigured(): boolean {
  return Boolean(getConfiguredApiBaseUrl() || typeof window !== 'undefined');
}

function isInvalidTokenError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /登录已过期|登录状态已失效|AUTH_INVALID|TOKEN_EXPIRED|expired|invalid token/iu.test(message);
}

function readAuthErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error || '');
  if (/AUTH_LOGIN_FAILED|账号或密码错误|invalid login credentials|invalid email or password|email not confirmed|invalid credentials/iu.test(message)) {
    return '账号或密码错误';
  }
  if (/API_ROUTE_NOT_FOUND|接口地址不存在/iu.test(message)) {
    return '接口地址不存在，请检查前后端 API 路径或后端部署配置。';
  }
  if (/AUTH_INVALID|JWT|expired|invalid token|TOKEN_EXPIRED/iu.test(message)) {
    return '登录状态已失效，请重新登录。';
  }
  if (/AUTH_REQUIRED|Authentication is required/iu.test(message)) {
    return getAccessToken()
      ? '登录凭证未被后端识别，请检查认证配置。'
      : '请先登录。';
  }
  if (/AUTH_PROFILE_REQUIRED/iu.test(message)) {
    return '账号尚未由管理员激活，请联系管理员。';
  }
  if (/AUTH_USER_DISABLED/iu.test(message)) {
    return '账号已停用，请联系管理员。';
  }
  if (/后端服务暂不可用|VITE_API_BASE_URL/iu.test(message)) {
    return '后端服务暂不可用，请检查部署配置。';
  }
  return message.trim() || fallback;
}
