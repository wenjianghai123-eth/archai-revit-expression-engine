import { useCallback, useEffect, useState } from 'react';
import { AuthUser, getCurrentUser } from '../lib/api';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';

export function useCurrentUser() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setUser(await getCurrentUser());
    } catch (err) {
      setUser(null);
      setError(err instanceof Error ? err.message : '无法读取当前用户。');
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
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        throw signInError;
      }

      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请检查邮箱和密码。');
    } finally {
      setIsSigningIn(false);
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
