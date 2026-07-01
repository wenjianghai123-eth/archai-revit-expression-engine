import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  Database,
  FolderKanban,
  History,
  LayoutDashboard,
  Layers,
  LogOut,
  Settings,
  ShieldCheck,
  Sparkles,
  WalletCards,
  X,
} from 'lucide-react';
import { AiProviderOption, AuthUser, CreditBalance } from '../lib/api';
import { GenerationStep, SelectableImageProvider } from '../types';
import {
  FeatureDefinition,
  debugFeatureClick,
  defaultFeatureIds,
  getOptionalFeatures,
  getVisibleFeatures,
  readStoredVisibleFeatureIds,
  writeStoredVisibleFeatureIds,
} from '../featureRegistry';
import { FeatureScrollBar } from './workspace/FeatureScrollBar';

interface SidebarProps {
  activeTab: string;
  onTabChange: (id: string) => void;
  onSettingsOpen: () => void;
  isAdmin?: boolean;
  currentUser?: AuthUser | null;
  creditBalance?: CreditBalance | null;
  creditError?: string | null;
  onSignOut?: () => void;
}

export function Sidebar({
  activeTab,
  onTabChange,
  onSettingsOpen,
  isAdmin = false,
  currentUser = null,
  creditBalance = null,
  creditError = null,
  onSignOut,
}: SidebarProps) {
  const groups = [
    {
      title: '创作',
      items: [
        { id: 'home', icon: Sparkles, label: '首页', desc: '创作台概览' },
        { id: 'projects', icon: FolderKanban, label: '项目', desc: '方案项目管理' },
        { id: 'generate', icon: LayoutDashboard, label: 'AI 生成', desc: '图像生成工作台' },
      ],
    },
    {
      title: '资源',
      items: [
        { id: 'assets', icon: Database, label: '模型资产', desc: '管理三维资产' },
        { id: 'templates', icon: Layers, label: '提示词模板', desc: '效果图提示词库' },
        { id: 'history', icon: History, label: '生成历史', desc: '回溯方案记录' },
      ],
    },
  ];
  const mobileTabs = groups.flatMap((group) => group.items);

  return (
    <>
      <div className="hidden h-screen w-72 shrink-0 flex-col border-r border-white/10 bg-[linear-gradient(180deg,#071a1d_0%,#0b2428_58%,#102f35_100%)] text-white shadow-2xl lg:flex">
        <div className="border-b border-white/10 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-white shadow-lg shadow-blue-950/40">
              <img src="/gtlogo.png" alt="烛照AI Logo" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-black tracking-tight">烛照AI</p>
              <p className="mt-0.5 text-[10px] font-bold tracking-[0.18em] text-slate-500">建筑空间智能表达平台</p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <span className="rounded-full border border-blue-400/30 bg-blue-500/10 px-2.5 py-1 text-[10px] font-bold text-blue-200">AI渲图</span>
            <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-[10px] font-bold text-violet-200">烛照AI</span>
          </div>
        </div>

        <nav className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 custom-scrollbar">
          {groups.map((group) => (
            <div key={group.title} className="space-y-2">
              <p className="px-3 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-600">{group.title}</p>
              {group.items.map((tab) => (
                <NavItem key={tab.id} tab={tab} active={activeTab === tab.id} onClick={() => onTabChange(tab.id)} />
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-4">
          {currentUser ? (
            <AccountPanel
              currentUser={currentUser}
              creditBalance={creditBalance}
              creditError={creditError}
              onSignOut={onSignOut}
            />
          ) : null}
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-600">系统</p>
          <button onClick={onSettingsOpen} className="group flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-slate-400 transition-colors hover:bg-white/5 hover:text-white" title="设置">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 group-hover:bg-white/10">
              <Settings className="h-5 w-5" />
            </div>
            <span className="min-w-0">
              <span className="block text-sm font-bold">设置</span>
              <span className="block text-xs text-slate-500">后端与模型状态</span>
            </span>
          </button>
          {isAdmin ? (
            <button onClick={() => { window.location.href = '/admin'; }} className="group mt-2 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-slate-400 transition-colors hover:bg-white/5 hover:text-white" title="后台管理">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 group-hover:bg-white/10">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <span className="min-w-0">
                <span className="block text-sm font-bold">后台管理</span>
                <span className="block text-xs text-slate-500">用户与额度管理</span>
              </span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-white/10 bg-slate-950/95 px-2 py-2 text-white backdrop-blur lg:hidden">
        {mobileTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-bold ${
              activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-slate-400'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.id === 'generate' ? '生成' : tab.label}
          </button>
        ))}
        <button onClick={onSettingsOpen} className="flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-bold text-slate-400">
          <Settings className="h-4 w-4" />
          设置
        </button>
      </div>
    </>
  );
}

function AccountPanel({
  currentUser,
  creditBalance,
  creditError,
  onSignOut,
}: {
  currentUser: AuthUser;
  creditBalance: CreditBalance | null;
  creditError: string | null;
  onSignOut?: () => void;
}) {
  return (
    <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">当前账号</p>
          <p className="mt-1 truncate text-sm font-bold text-white">{currentUser.email}</p>
        </div>
        {onSignOut ? (
          <button
            type="button"
            onClick={onSignOut}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-slate-300 transition hover:bg-rose-500/15 hover:text-rose-200"
            title="退出登录"
            aria-label="退出登录"
          >
            <LogOut className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] font-bold">
        <span className="rounded-lg bg-white/5 px-2 py-1.5 text-slate-300">role: {currentUser.role}</span>
        <span className="rounded-lg bg-white/5 px-2 py-1.5 text-slate-300">status: {currentUser.status}</span>
      </div>

      <div className="mt-2 flex items-center gap-2 rounded-xl bg-white/5 px-2.5 py-2 text-xs font-bold">
        {creditError ? (
          <>
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-300" />
            <span className="min-w-0 text-amber-100">额度读取失败，可继续退出登录</span>
          </>
        ) : (
          <>
            <WalletCards className="h-4 w-4 shrink-0 text-emerald-300" />
            <span className="text-slate-200">剩余算力点：{creditBalance?.balance ?? '读取中'}</span>
          </>
        )}
      </div>
    </div>
  );
}

function NavItem({
  tab,
  active,
  onClick,
}: {
  tab: { id: string; icon: React.ComponentType<{ className?: string }>; label: string; desc: string };
  active: boolean;
  onClick: () => void;
}) {
  const Icon = tab.icon;

  return (
    <button
      onClick={onClick}
      className={`group relative flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all ${
        active
          ? 'bg-gradient-to-r from-teal-600/90 to-cyan-700/90 text-white shadow-lg shadow-teal-950/40'
          : 'text-slate-400 hover:bg-white/5 hover:text-white'
      }`}
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${active ? 'bg-white/15' : 'bg-white/5 group-hover:bg-white/10'}`}>
        <Icon className="h-5 w-5 shrink-0" />
      </div>
      <span className="min-w-0">
        <span className="block text-sm font-bold">{tab.label}</span>
        <span className={`mt-0.5 block text-xs ${active ? 'text-teal-50' : 'text-slate-500'}`}>{tab.desc}</span>
      </span>
      {active && <motion.div layoutId="active-pill" className="absolute -left-4 h-8 w-1 rounded-r-full bg-teal-200" />}
    </button>
  );
}

interface StepperProps {
  currentStep: GenerationStep;
  onStepChange: (step: GenerationStep) => void;
  creditBalance?: number | null;
  selectedProvider?: SelectableImageProvider;
  providers?: AiProviderOption[];
  isProviderLoading?: boolean;
  onProviderChange?: (provider: SelectableImageProvider) => void;
}

export function Stepper({
  currentStep,
  onStepChange,
  creditBalance = null,
  selectedProvider,
  providers = [],
  isProviderLoading = false,
  onProviderChange = () => undefined,
}: StepperProps) {
  const [addedFeatureIds, setAddedFeatureIds] = useState<string[]>(() => readStoredVisibleFeatureIds());
  const [isFeaturePickerOpen, setIsFeaturePickerOpen] = useState(false);
  const visibleFeatures = getVisibleFeatures(addedFeatureIds);
  const optionalFeatures = getOptionalFeatures();
  const visibleFeatureIdSet = new Set(visibleFeatures.map(feature => feature.id));
  const selectedProviderInfo = providers.find(provider => provider.value === selectedProvider);
  const activeFeatureId = visibleFeatures.find(feature => feature.step === currentStep)?.id ?? null;

  const handleSelectFeature = (feature: FeatureDefinition) => {
    debugFeatureClick(feature);
    onStepChange(feature.step);
  };
  const handleAddFeature = (featureId: string) => {
    if (defaultFeatureIds.includes(featureId as typeof defaultFeatureIds[number]) || addedFeatureIds.includes(featureId)) return;
    const nextIds = [...addedFeatureIds, featureId];
    setAddedFeatureIds(nextIds);
    writeStoredVisibleFeatureIds(nextIds);
  };
  const handleRemoveFeature = (featureId: string) => {
    if (defaultFeatureIds.includes(featureId as typeof defaultFeatureIds[number])) return;
    const nextIds = addedFeatureIds.filter(id => id !== featureId);
    setAddedFeatureIds(nextIds);
    writeStoredVisibleFeatureIds(nextIds);
  };

  return (
    <div className="workspace-topbar shrink-0">
      <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-5">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-blue-600">
            <Sparkles className="h-3.5 w-3.5" />
            ARCHITECTURE AI STUDIO
          </div>
          <h1 className="mt-1 text-lg font-bold tracking-tight text-slate-950 md:text-xl">AI 生成</h1>
          <p className="mt-0.5 text-xs text-slate-500">选择功能、上传素材并生成设计效果。</p>
        </div>
        <div className="hidden items-center gap-3 md:flex">
          <label className="flex items-center gap-2 rounded-2xl border border-white/70 bg-white/60 px-3 py-2 text-xs font-bold text-slate-600 shadow-sm backdrop-blur">
            <span className="shrink-0 text-teal-700">AI 接口</span>
            <select
              value={selectedProvider || ''}
              onChange={event => onProviderChange(event.currentTarget.value as SelectableImageProvider)}
              disabled={isProviderLoading}
              className="min-w-56 border-0 bg-transparent py-0 text-xs font-bold text-slate-800 outline-none"
            >
              {isProviderLoading ? <option value="">正在连接API...</option> : null}
              {providers.map(provider => (
                <option key={provider.value} value={provider.value} disabled={!provider.enabled}>
                  {provider.label}{provider.enabled ? '' : '（未配置）'}
                </option>
              ))}
            </select>
            {isProviderLoading ? <span className="shrink-0 text-[10px] font-bold text-slate-400">正在连接API...</span> : null}
          </label>
          <div className="rounded-full border border-white/70 bg-white/55 px-4 py-2 text-xs font-bold text-slate-600 shadow-sm backdrop-blur">
            <span className="text-teal-700">当前功能：{readStepperFeatureLabel(currentStep)}</span>
            {creditBalance !== null ? (
              <>
                <span className="mx-2 text-slate-300">/</span>
                <span>余额：{creditBalance} 算力点</span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="px-4 pb-3 md:hidden">
        <label className="block rounded-2xl border border-white/70 bg-white/60 p-3 text-xs font-bold text-slate-600 shadow-sm backdrop-blur">
          <span className="mb-2 block text-teal-700">AI 接口</span>
          <select
            value={selectedProvider || ''}
            onChange={event => onProviderChange(event.currentTarget.value as SelectableImageProvider)}
            disabled={isProviderLoading}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800"
          >
            {isProviderLoading ? <option value="">正在连接API...</option> : null}
            {providers.map(provider => (
              <option key={provider.value} value={provider.value} disabled={!provider.enabled}>
                {provider.label}{provider.enabled ? '' : '（未配置）'}
              </option>
            ))}
          </select>
          {isProviderLoading ? <span className="mt-1 block text-[10px] font-bold text-slate-400">正在连接API...</span> : null}
        </label>
      </div>
      {selectedProviderInfo && !selectedProviderInfo.enabled ? (
        <div className="mx-4 mb-3 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs font-semibold text-amber-800 md:mx-5">
          当前 AI 接口缺少后端配置：{selectedProviderInfo.missingConfig.join('、')}。请配置后重启服务。
        </div>
      ) : null}

      <FeatureScrollBar
        features={visibleFeatures}
        activeFeatureId={activeFeatureId}
        onSelectFeature={handleSelectFeature}
        onAddFeature={() => setIsFeaturePickerOpen(true)}
      />

      {isFeaturePickerOpen ? (
        <FeaturePicker
          optionalFeatures={optionalFeatures}
          visibleFeatureIdSet={visibleFeatureIdSet}
          onAddFeature={handleAddFeature}
          onRemoveFeature={handleRemoveFeature}
          onClose={() => setIsFeaturePickerOpen(false)}
        />
      ) : null}
    </div>
  );
}

function FeaturePicker({
  optionalFeatures,
  visibleFeatureIdSet,
  onAddFeature,
  onRemoveFeature,
  onClose,
}: {
  optionalFeatures: FeatureDefinition[];
  visibleFeatureIdSet: Set<string>;
  onAddFeature: (featureId: string) => void;
  onRemoveFeature: (featureId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="text-lg font-black text-slate-950">更多功能</h2>
            <p className="mt-1 text-xs text-slate-500">默认核心功能不可移除，其他功能可添加到首页和 AI 生成页。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-3">
          <div className="grid gap-2">
            {optionalFeatures.map(feature => {
              const Icon = feature.icon;
              const isAdded = visibleFeatureIdSet.has(feature.id);
              return (
                <div key={feature.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-slate-900">{feature.title}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{feature.desc}</p>
                  </div>
                  {isAdded ? (
                    <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-600">已添加</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => isAdded ? onRemoveFeature(feature.id) : onAddFeature(feature.id)}
                    className={`h-9 shrink-0 rounded-xl px-3 text-xs font-black transition ${
                      isAdded
                        ? 'bg-white text-slate-500 hover:bg-rose-50 hover:text-rose-600'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {isAdded ? '移除' : '添加'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function readStepperFeatureLabel(step: GenerationStep): string {
  if (step === GenerationStep.FloorplanTo3D) return '平面彩平';
  if (step === GenerationStep.FreeReferenceImage) return '自由参考生图';
  if (step === GenerationStep.ImagePolish) return '质感提升';
  if (step === GenerationStep.MaterialReplace) return '材质软装替换';
  if (step === GenerationStep.ObjectInsert) return '元素植入';
  if (step === GenerationStep.DesignVariants) return '方案变体';
  if (step === GenerationStep.PlanColorize) return '图纸智能表达';
  if (step === GenerationStep.ModelSnapshotRender) return '白模快渲';
  if (step === GenerationStep.PanoramaQuickRender) return '全景快渲';
  if (step === GenerationStep.StyleRender) return '风格渲染';
  return '局部修饰';
}
