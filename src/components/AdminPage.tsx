import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, Coins, KeyRound, Loader2, LogOut, ShieldCheck, UserPlus } from 'lucide-react';
import {
  AdminDashboard,
  AuthUser,
  createAdminUser,
  getAdminDashboard,
  grantAdminUserCredits,
  listAdminUsers,
  resetAdminUserPassword,
  updateAdminUser,
  UserProfile,
} from '../lib/api';

interface AdminPageProps {
  currentUser: AuthUser;
  onBackToApp: () => void;
  onSignOut: () => void;
}

export function AdminPage({ currentUser, onBackToApp, onSignOut }: AdminPageProps) {
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'member' as UserProfile['role'], initialCredits: 100 });
  const [resetPasswords, setResetPasswords] = useState<Record<string, string>>({});
  const [creditAmounts, setCreditAmounts] = useState<Record<string, number>>({});

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [nextDashboard, nextUsers] = await Promise.all([getAdminDashboard(), listAdminUsers()]);
      setDashboard(nextDashboard);
      setUsers(nextUsers);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '后台数据加载失败。');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser.role === 'admin') void load();
    else setIsLoading(false);
  }, [currentUser.role]);

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsCreating(true);
    setError(null);
    setMessage(null);
    try {
      await createAdminUser(form);
      setForm({ name: '', email: '', password: '', role: 'member', initialCredits: 100 });
      setMessage('用户已创建。请通过安全渠道把邮箱和初始密码发送给用户。');
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '创建用户失败。');
    } finally {
      setIsCreating(false);
    }
  };

  const handlePatchUser = async (user: UserProfile, patch: Partial<Pick<UserProfile, 'role' | 'status'>>) => {
    setError(null);
    setMessage(null);
    try {
      await updateAdminUser(user.id, patch);
      setMessage('用户已更新。');
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : '更新用户失败。');
    }
  };

  const handleResetPassword = async (user: UserProfile) => {
    const password = resetPasswords[user.id] || '';
    if (password.length < 8) {
      setError('新密码至少需要 8 个字符。');
      return;
    }
    setError(null);
    setMessage(null);
    try {
      await resetAdminUserPassword(user.id, password);
      setResetPasswords(prev => ({ ...prev, [user.id]: '' }));
      setMessage('密码已重置。请通过安全渠道通知用户。');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : '重置密码失败。');
    }
  };

  const handleGrantCredits = async (user: UserProfile) => {
    const amount = creditAmounts[user.id] || 0;
    if (!Number.isInteger(amount) || amount <= 0) {
      setError('请输入正整数 credits。');
      return;
    }
    setError(null);
    setMessage(null);
    try {
      await grantAdminUserCredits(user.id, { amount, reason: 'Admin manual credit grant' });
      setMessage(`已为 ${user.email} 增加 ${amount} credits。`);
      await load();
    } catch (grantError) {
      setError(grantError instanceof Error ? grantError.message : '增加 credits 失败。');
    }
  };

  if (currentUser.role !== 'admin') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <AlertCircle className="mx-auto h-8 w-8 text-red-600" />
          <h1 className="mt-4 text-xl font-bold text-slate-950">无权限访问</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">当前账号不是 admin，无法进入后台。</p>
          <button onClick={onBackToApp} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">返回前台</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 text-slate-900">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-blue-600">Admin</p>
              <h1 className="text-2xl font-bold text-slate-950">ArchAI 后台</h1>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onBackToApp} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600">
              <ArrowLeft className="h-4 w-4" /> 返回前台
            </button>
            <button onClick={onSignOut} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">
              <LogOut className="h-4 w-4" /> 退出登录
            </button>
          </div>
        </header>

        {isLoading ? (
          <div className="flex items-center gap-3 rounded-2xl bg-white p-5 text-sm font-bold text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" /> 正在加载后台数据...
          </div>
        ) : null}
        {error ? <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
        {message ? <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div> : null}

        {dashboard ? (
          <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="用户数量" value={dashboard.stats.userCount} />
            <StatCard label="项目数量" value={dashboard.stats.projectCount} />
            <StatCard label="生成任务" value={dashboard.stats.generationJobCount} />
            <StatCard label="成功任务" value={dashboard.stats.succeededJobCount} />
            <StatCard label="失败任务" value={dashboard.stats.failedJobCount} />
            <StatCard label="消耗 credits" value={dashboard.stats.totalCreditsConsumed} />
          </section>
        ) : null}

        <section className="grid gap-4 xl:grid-cols-[380px_1fr]">
          <form onSubmit={handleCreateUser} className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-blue-600" />
              <h2 className="text-base font-bold text-slate-950">创建用户</h2>
            </div>
            <TextInput label="姓名" value={form.name} onChange={value => setForm(prev => ({ ...prev, name: value }))} required />
            <TextInput label="邮箱" type="email" value={form.email} onChange={value => setForm(prev => ({ ...prev, email: value }))} required />
            <TextInput label="初始密码" type="password" value={form.password} onChange={value => setForm(prev => ({ ...prev, password: value }))} required />
            <label className="mt-3 block text-xs font-bold text-slate-500">
              角色
              <select value={form.role} onChange={event => setForm(prev => ({ ...prev, role: event.target.value as UserProfile['role'] }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <option value="member">member</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <label className="mt-3 block text-xs font-bold text-slate-500">
              初始积分
              <input type="number" min="0" step="1" value={form.initialCredits} onChange={event => setForm(prev => ({ ...prev, initialCredits: Number(event.target.value) }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
            </label>
            <button disabled={isCreating} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              创建账号
            </button>
          </form>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-base font-bold text-slate-950">用户管理</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2">用户</th>
                    <th className="px-3 py-2">角色</th>
                    <th className="px-3 py-2">状态</th>
                    <th className="px-3 py-2">重置密码</th>
                    <th className="px-3 py-2">Credits</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map(user => (
                    <tr key={user.id}>
                      <td className="px-3 py-3">
                        <div className="font-bold text-slate-900">{user.name}</div>
                        <div className="text-slate-500">{user.email}</div>
                        <div className="font-mono text-[10px] text-slate-400">{user.id}</div>
                      </td>
                      <td className="px-3 py-3">
                        <select value={user.role} onChange={event => void handlePatchUser(user, { role: event.target.value as UserProfile['role'] })} className="rounded-lg border border-slate-200 bg-white px-2 py-1">
                          <option value="member">member</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <button onClick={() => void handlePatchUser(user, { status: user.status === 'active' ? 'disabled' : 'active' })} className={`rounded-lg px-3 py-1 font-bold ${user.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                          {user.status === 'active' ? 'active' : 'disabled'}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-2">
                          <input type="password" value={resetPasswords[user.id] || ''} onChange={event => setResetPasswords(prev => ({ ...prev, [user.id]: event.target.value }))} placeholder="新密码" className="w-32 rounded-lg border border-slate-200 px-2 py-1" />
                          <button onClick={() => void handleResetPassword(user)} className="rounded-lg bg-slate-900 px-2 py-1 font-bold text-white"><KeyRound className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-2">
                          <input type="number" min="1" value={creditAmounts[user.id] || ''} onChange={event => setCreditAmounts(prev => ({ ...prev, [user.id]: Number(event.target.value) }))} className="w-24 rounded-lg border border-slate-200 px-2 py-1" />
                          <button onClick={() => void handleGrantCredits(user)} className="rounded-lg bg-emerald-600 px-2 py-1 font-bold text-white"><Coins className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </div>
    </div>
  );
}

function TextInput({ label, value, onChange, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return (
    <label className="mt-3 block text-xs font-bold text-slate-500">
      {label}
      <input type={type} value={value} onChange={event => onChange(event.target.value)} required={required} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-300" />
    </label>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-950">{value.toLocaleString('zh-CN')}</p>
    </div>
  );
}
