import React, { useEffect, useState } from 'react';
import { AlertCircle, Coins, Loader2, ShieldCheck, UserPlus } from 'lucide-react';
import { AdminDashboard, AuthUser, GenerationJob, getAdminDashboard, grantUserCredits } from '../lib/api';

interface AdminPageProps {
  currentUser: AuthUser;
}

export function AdminPage({ currentUser }: AdminPageProps) {
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grantUserId, setGrantUserId] = useState('');
  const [grantAmount, setGrantAmount] = useState(100);
  const [grantReason, setGrantReason] = useState('Admin manual credit grant');
  const [grantMessage, setGrantMessage] = useState<string | null>(null);
  const [isGranting, setIsGranting] = useState(false);

  const loadDashboard = async () => {
    setIsLoading(true);
    setError(null);

    try {
      setDashboard(await getAdminDashboard());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Admin 数据加载失败。');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser.role === 'admin') {
      void loadDashboard();
    } else {
      setIsLoading(false);
    }
  }, [currentUser.role]);

  const handleGrantCredits = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsGranting(true);
    setGrantMessage(null);
    setError(null);

    try {
      const result = await grantUserCredits({
        userId: grantUserId.trim(),
        amount: grantAmount,
        reason: grantReason,
      });
      setGrantMessage(`已为 ${result.balance.userId} 增加 ${grantAmount} credits，当前余额 ${result.balance.balance}。`);
      await loadDashboard();
    } catch (grantError) {
      setError(grantError instanceof Error ? grantError.message : '增加 credits 失败。');
    } finally {
      setIsGranting(false);
    }
  };

  if (currentUser.role !== 'admin') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <AlertCircle className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-slate-950">无权限访问</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">当前账号不是 admin，无法进入后台。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 text-slate-900">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-blue-600">Admin</p>
              <h1 className="text-2xl font-bold text-slate-950">ArchAI 后台</h1>
            </div>
          </div>
        </header>

        {isLoading ? (
          <div className="flex items-center gap-3 rounded-2xl bg-white p-5 text-sm font-bold text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            正在加载后台数据...
          </div>
        ) : error ? (
          <div className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {dashboard ? (
          <>
            <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <StatCard label="用户数量" value={dashboard.stats.userCount} />
              <StatCard label="项目数量" value={dashboard.stats.projectCount} />
              <StatCard label="生成任务" value={dashboard.stats.generationJobCount} />
              <StatCard label="成功任务" value={dashboard.stats.succeededJobCount} />
              <StatCard label="失败任务" value={dashboard.stats.failedJobCount} />
              <StatCard label="总消耗 credits" value={dashboard.stats.totalCreditsConsumed} />
            </section>

            <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
              <div className="space-y-4">
                <JobTable title="最近 20 条 GenerationJob" jobs={dashboard.recentJobs} />
                <JobTable title="最近 20 条错误任务" jobs={dashboard.recentErrorJobs} emptyText="暂无失败任务。" />
              </div>

              <form onSubmit={handleGrantCredits} className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                    <Coins className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-950">手动增加 Credits</h2>
                    <p className="text-xs text-slate-500">用于内部补额度和运营处理。</p>
                  </div>
                </div>

                <label className="block text-xs font-bold text-slate-500">
                  用户 ID
                  <input
                    value={grantUserId}
                    onChange={event => setGrantUserId(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-300"
                    placeholder="dev-user 或 Supabase user id"
                    required
                  />
                </label>

                <label className="mt-3 block text-xs font-bold text-slate-500">
                  增加数量
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={grantAmount}
                    onChange={event => setGrantAmount(Number(event.target.value))}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-300"
                    required
                  />
                </label>

                <label className="mt-3 block text-xs font-bold text-slate-500">
                  备注
                  <input
                    value={grantReason}
                    onChange={event => setGrantReason(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-300"
                  />
                </label>

                <button disabled={isGranting} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                  {isGranting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  增加 Credits
                </button>

                {grantMessage ? <p className="mt-3 text-xs font-semibold text-emerald-600">{grantMessage}</p> : null}
              </form>
            </section>
          </>
        ) : null}
      </div>
    </div>
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

function JobTable({ title, jobs, emptyText = '暂无任务。' }: { title: string; jobs: GenerationJob[]; emptyText?: string }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-base font-bold text-slate-950">{title}</h2>
      </div>
      {jobs.length === 0 ? (
        <div className="p-5 text-sm text-slate-500">{emptyText}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-bold">Job</th>
                <th className="px-3 py-2 font-bold">User</th>
                <th className="px-3 py-2 font-bold">Mode</th>
                <th className="px-3 py-2 font-bold">Status</th>
                <th className="px-3 py-2 font-bold">Provider</th>
                <th className="px-3 py-2 font-bold">Created</th>
                <th className="px-3 py-2 font-bold">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.map(job => (
                <tr key={job.id}>
                  <td className="max-w-[180px] truncate px-3 py-2 font-mono text-slate-700">{job.id}</td>
                  <td className="max-w-[160px] truncate px-3 py-2 font-mono text-slate-500">{job.userId}</td>
                  <td className="px-3 py-2 text-slate-700">{job.mode}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-slate-100 px-2 py-1 font-bold text-slate-600">{job.status}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{job.provider}</td>
                  <td className="px-3 py-2 text-slate-500">{formatDate(job.createdAt)}</td>
                  <td className="max-w-[260px] truncate px-3 py-2 text-red-600">{job.errorMessage || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
