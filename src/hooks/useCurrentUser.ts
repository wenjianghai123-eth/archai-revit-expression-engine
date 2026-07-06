import { useCallback, useEffect, useState } from 'react';
import { AuthUser, getCurrentUser } from '../lib/api';
import { getSupabaseClient, getSupabaseSession, isSupabaseConfigured } from '../lib/supabase';

export function useCurrentUser() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    if (!isSupabaseConfigured()) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const session = await getSupabaseSession();
      if (!session?.access_token) {
        setUser(null);
        return;
      }

      const currentUser = await getCurrentUser(session.access_token);
      setUser(currentUser);
    } catch (err) {
      setUser(null);
      setError(readAuthErrorMessage(err, '无法读取当前用户。'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Supabase 尚未配置，无法使用邮箱密码登录。');
      return;
    }

    setIsSigningIn(true);
    setError(null);
    setAuthMessage(null);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        throw signInError;
      }

      const accessToken = data.session?.access_token;
      if (!accessToken) {
        throw new Error('登录状态验证失败，请重新登录。');
      }

      if (import.meta.env.DEV) {
        console.debug('[auth] login success', {
          hasUser: Boolean(data.user),
          hasAccessToken: Boolean(accessToken),
          userId: data.user?.id,
        });
      }

      const currentUser = await getCurrentUser(accessToken);
      setUser(currentUser);
      setAuthMessage(null);
    } catch (err) {
      setUser(null);
      setError(readAuthErrorMessage(err, '账号或密码错误'));
    } finally {
      setIsSigningIn(false);
      setIsLoading(false);
    }
  }, [refresh]);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
    }

    setUser(null);
    setAuthMessage(null);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    void refresh();
    const supabase = getSupabaseClient();
    const subscription = supabase?.auth.onAuthStateChange(() => {
      void refresh();
    }).data.subscription;

    return () => {
      subscription?.unsubscribe();
    };
  }, [refresh]);

  return {
    user,
    isLoading,
    error,
    isSigningIn,
    authMessage,
    isSupabaseConfigured: isSupabaseConfigured(),
    refresh,
    signInWithEmail,
    signOut,
  };
}

function readAuthErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error || '');
  if (/invalid login credentials|invalid email or password|email not confirmed|invalid credentials/iu.test(message)) {
    return '账号或密码错误';
  }
  if (/AUTH_REQUIRED|Authentication is required|AUTH_INVALID|JWT|expired|invalid token/iu.test(message)) {
    return '登录状态已失效，请重新登录。';
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
