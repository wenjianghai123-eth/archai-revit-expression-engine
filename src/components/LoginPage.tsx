import React, { FormEvent, useState } from 'react';
import { KeyRound, Loader2, LogIn, Mail } from 'lucide-react';

interface LoginPageProps {
  isSigningIn: boolean;
  error: string | null;
  message: string | null;
  isSupabaseConfigured: boolean;
  onSignIn: (email: string, password: string) => Promise<void>;
}

export function LoginPage({ isSigningIn, error, message, isSupabaseConfigured, onSignIn }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password || isSigningIn || !isSupabaseConfigured) return;
    await onSignIn(email.trim(), password);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 text-slate-900">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
        <div className="mb-6">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded bg-blue-600 text-white">
            <LogIn className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-bold text-slate-950">登录烛照AI</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            深圳广田股份有限公司内部设计智能助手。账号由管理员创建，请使用分配的邮箱和初始密码登录。
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-400">Email</span>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-blue-400 focus-within:bg-white">
              <Mail className="h-4 w-4 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="name@example.com"
                className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
                disabled={isSigningIn || !isSupabaseConfigured}
                required
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-400">Password</span>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-blue-400 focus-within:bg-white">
              <KeyRound className="h-4 w-4 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder="请输入密码"
                className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
                disabled={isSigningIn || !isSupabaseConfigured}
                required
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={isSigningIn || !email.trim() || !password || !isSupabaseConfigured}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSigningIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            {isSigningIn ? '登录中...' : '登录'}
          </button>
        </form>

        {!isSupabaseConfigured && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
            Supabase 前端环境变量未配置。生产模式请设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY；设置后必须重新 build / redeploy。
          </p>
        )}

        {message && <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-700">{message}</p>}
        {error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{error}</p>}
      </div>
    </div>
  );
}
