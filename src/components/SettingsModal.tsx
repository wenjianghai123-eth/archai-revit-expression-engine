import React from 'react';
import { Activity, LogOut, RefreshCw, UserCircle, X, type LucideIcon } from 'lucide-react';
import { AuthUser } from '../lib/api';

interface SettingsModalProps {
  isOpen: boolean;
  backendHealth: string;
  currentUser: AuthUser | null;
  currentUserStatus: string;
  onSignOut: () => void;
  isChecking: boolean;
  onRefresh: () => void;
  onClose: () => void;
}

export function SettingsModal({
  isOpen,
  backendHealth,
  currentUser,
  currentUserStatus,
  onSignOut,
  isChecking,
  onRefresh,
  onClose,
}: SettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">烛照AI 设置</h2>
            <p className="text-xs text-slate-500">账户与后端运行状态</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" title="关闭">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <StatusRow
            icon={UserCircle}
            label="当前用户"
            value={currentUser ? `${currentUser.name} · ${currentUser.email}` : currentUserStatus}
          />
          {currentUser && (
            <button
              onClick={onSignOut}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:border-rose-200 hover:text-rose-700"
            >
              <LogOut className="h-4 w-4" />
              退出登录
            </button>
          )}
          <StatusRow icon={Activity} label="服务状态" value={backendHealth} />
          <button
            onClick={onRefresh}
            disabled={isChecking}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:border-blue-200 hover:text-blue-700 disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isChecking ? 'animate-spin' : ''}`} />
            重新检查后端状态
          </button>
        </div>

        <div className="border-t border-slate-100 bg-slate-50 p-5">
          <p className="text-xs leading-5 text-slate-500">密钥与环境变量不会在客户端设置页展示。</p>
        </div>
      </div>
    </div>
  );
}

function StatusRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded bg-white text-blue-600">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
        <p className="truncate text-sm font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}
