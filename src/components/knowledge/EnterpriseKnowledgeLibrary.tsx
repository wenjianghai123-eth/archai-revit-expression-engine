import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Box,
  BriefcaseBusiness,
  Building2,
  Clock3,
  FolderKanban,
  Heart,
  Link2,
  Search,
  ShieldCheck,
  Sparkles,
  Tags,
  UserRound,
  X,
} from 'lucide-react';

import { MOCK_FURNITURE_STYLES, MOCK_MATERIALS } from '../../constants';
import { showcaseCases } from '../../constants/showcaseCases';
import { useEnterpriseAssetPreferences } from '../../hooks/useEnterpriseAssetPreferences';
import {
  adaptFurnitureStyle,
  adaptMaterialAsset,
  adaptModelAsset,
  adaptPromptTemplate,
  adaptShowcaseCase,
  adaptStyleReferenceFromTemplate,
  applyEnterpriseAssetPreferences,
  EnterpriseAsset,
  EnterpriseAssetKind,
  EnterpriseAssetScope,
  enterpriseAssetKindDefinitions,
  filterEnterpriseAssets,
  readEnterpriseAssetKindLabel,
} from '../../knowledge/enterpriseAssets';
import { listModelAssets } from '../../lib/api';
import type { PromptTemplate } from '../../types';
import { CaseImage } from '../common/CaseImage';

interface EnterpriseKnowledgeLibraryProps {
  templates: PromptTemplate[];
  currentProjectId?: string | null;
  currentUserId?: string;
  isAdmin?: boolean;
  onApplyTemplate?: (template: PromptTemplate) => void;
  onOpenModelLibrary: () => void;
}

const scopeOptions: Array<{ value: EnterpriseAssetScope; label: string }> = [
  { value: 'all', label: '全部资产' },
  { value: 'administrator-shared', label: '企业共享' },
  { value: 'personal', label: '个人资产' },
  { value: 'favorites', label: '我的收藏' },
  { value: 'recent', label: '最近使用' },
  { value: 'project', label: '当前项目' },
];

export function EnterpriseKnowledgeLibrary({
  templates,
  currentProjectId,
  currentUserId,
  isAdmin = false,
  onApplyTemplate,
  onOpenModelLibrary,
}: EnterpriseKnowledgeLibraryProps) {
  const { preferences, toggleFavorite, markUsed, toggleProjectLink } = useEnterpriseAssetPreferences();
  const [modelAssets, setModelAssets] = useState<EnterpriseAsset[]>([]);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<EnterpriseAssetKind | 'all'>('all');
  const [scope, setScope] = useState<EnterpriseAssetScope>('all');
  const [category, setCategory] = useState('all');
  const [tag, setTag] = useState('all');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listModelAssets()
      .then(records => {
        if (cancelled) return;
        setModelAssets(records.map(adaptModelAsset));
        setModelLoadError(null);
      })
      .catch(error => {
        if (cancelled) return;
        setModelAssets([]);
        setModelLoadError(error instanceof Error ? error.message : '个人模型资产加载失败。');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const baseAssets = useMemo(() => {
    const promptAssets = templates.map(template => adaptPromptTemplate(template, currentUserId));
    const styleReferences = templates
      .map(adaptStyleReferenceFromTemplate)
      .filter((asset): asset is EnterpriseAsset => Boolean(asset));
    return [
      ...MOCK_MATERIALS.map(adaptMaterialAsset),
      ...MOCK_FURNITURE_STYLES.map(adaptFurnitureStyle),
      ...modelAssets,
      ...styleReferences,
      ...showcaseCases.map(adaptShowcaseCase),
      ...promptAssets,
    ];
  }, [currentUserId, modelAssets, templates]);
  const assets = useMemo(
    () => applyEnterpriseAssetPreferences(baseAssets, preferences),
    [baseAssets, preferences],
  );
  const kindScopedAssets = useMemo(
    () => kind === 'all' ? assets : assets.filter(asset => asset.kind === kind),
    [assets, kind],
  );
  const categories = useMemo(
    () => ['all', ...Array.from(new Set(kindScopedAssets.map(asset => asset.category))).sort((a, b) => a.localeCompare(b, 'zh-CN'))],
    [kindScopedAssets],
  );
  const tags = useMemo(
    () => Array.from(new Set(kindScopedAssets.flatMap(asset => asset.tags))).slice(0, 14),
    [kindScopedAssets],
  );
  const filteredAssets = useMemo(() => filterEnterpriseAssets(assets, {
    query,
    kind,
    category,
    tag,
    scope,
    projectId: currentProjectId,
  }), [assets, category, currentProjectId, kind, query, scope, tag]);
  const selectedAsset = assets.find(asset => asset.id === selectedAssetId) || null;
  const kindCounts = useMemo(
    () => Object.fromEntries(enterpriseAssetKindDefinitions.map(item => [
      item.value,
      assets.filter(asset => asset.kind === item.value).length,
    ])) as Record<EnterpriseAssetKind, number>,
    [assets],
  );

  useEffect(() => {
    setCategory('all');
    setTag('all');
  }, [kind]);

  const handleUse = (asset: EnterpriseAsset) => {
    markUsed(asset.id);
    setSelectedAssetId(asset.id);
    if (asset.reference.type === 'prompt-template') {
      const template = templates.find(item => item.id === asset.reference.id);
      if (template && onApplyTemplate) onApplyTemplate(template);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#f5f7fb]">
      <header className="shrink-0 border-b border-slate-200 bg-white px-3 py-3 md:px-4">
        <div className="mx-auto max-w-[1600px] space-y-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-black text-slate-950">企业素材知识库</h1>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-700">{assets.length} 项统一资产</span>
                  {isAdmin ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-700">管理员视图</span> : null}
                </div>
                <p className="mt-1 text-xs text-slate-500">统一检索材质、家具、灯具、绿植、人物、风格参考、项目案例和提示词模板。</p>
              </div>
            </div>
            <button type="button" onClick={onOpenModelLibrary} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:border-blue-300 hover:text-blue-700">
              <Box className="h-4 w-4" />
              三维模型管理
            </button>
          </div>

          <div className="grid gap-2 xl:grid-cols-[minmax(280px,420px)_1fr]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={event => setQuery(event.currentTarget.value)}
                placeholder="搜索名称、分类、标签、来源信息..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-300 focus:bg-white"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
              <button type="button" onClick={() => setKind('all')} className={filterButtonClass(kind === 'all')}>全部 {assets.length}</button>
              {enterpriseAssetKindDefinitions.map(item => (
                <button key={item.value} type="button" onClick={() => setKind(item.value)} className={filterButtonClass(kind === item.value)}>
                  {item.label} {kindCounts[item.value]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {scopeOptions.map(option => (
              <button
                key={option.value}
                type="button"
                disabled={option.value === 'project' && !currentProjectId}
                onClick={() => setScope(option.value)}
                className={`${filterButtonClass(scope === option.value)} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {option.label}
              </button>
            ))}
            <select value={category} onChange={event => setCategory(event.currentTarget.value)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 outline-none">
              <option value="all">全部分类</option>
              {categories.filter(value => value !== 'all').map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>

          {tags.length ? (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
              <Tags className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <button type="button" onClick={() => setTag('all')} className={tagButtonClass(tag === 'all')}>全部标签</button>
              {tags.map(item => <button key={item} type="button" onClick={() => setTag(item)} className={tagButtonClass(tag === item)}>#{item}</button>)}
            </div>
          ) : null}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-3 custom-scrollbar md:p-4">
        <div className="mx-auto max-w-[1600px]">
          {modelLoadError ? (
            <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">个人模型素材暂未载入：{modelLoadError}</p>
          ) : null}
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-bold text-slate-500">找到 {filteredAssets.length} 项素材</p>
            {scope === 'project' && currentProjectId ? <span className="text-[11px] font-bold text-blue-700">当前项目：{currentProjectId}</span> : null}
          </div>

          {filteredAssets.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredAssets.map(asset => (
                <article key={asset.id} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-lg">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => { setSelectedAssetId(asset.id); markUsed(asset.id); }}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        setSelectedAssetId(asset.id);
                        markUsed(asset.id);
                      }
                    }}
                    className="relative block cursor-pointer text-left"
                  >
                    <EnterpriseAssetPreview asset={asset} className="rounded-none border-0 shadow-none" />
                    <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                      <AssetPill>{readEnterpriseAssetKindLabel(asset.kind)}</AssetPill>
                      <AssetPill tone={asset.visibility === 'administrator-shared' ? 'blue' : 'slate'}>
                        {asset.visibility === 'administrator-shared' ? '企业共享' : '个人资产'}
                      </AssetPill>
                    </div>
                    <button
                      type="button"
                      aria-label={asset.isFavorite ? '取消收藏' : '收藏素材'}
                      onClick={event => {
                        event.stopPropagation();
                        toggleFavorite(asset.id);
                      }}
                      className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border bg-white/90 ${asset.isFavorite ? 'border-rose-300 text-rose-600' : 'border-white text-slate-500'}`}
                    >
                      <Heart className={`h-4 w-4 ${asset.isFavorite ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                  <div className="flex flex-1 flex-col p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{asset.category}</p>
                    <h2 className="mt-1 line-clamp-1 text-sm font-black text-slate-900">{asset.name}</h2>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{asset.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {asset.tags.slice(0, 4).map(item => <span key={item} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">#{item}</span>)}
                    </div>
                    <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                      <p className="flex items-center gap-1.5"><BriefcaseBusiness className="h-3.5 w-3.5" />{asset.source.label}</p>
                      {asset.lastUsedAt ? <p className="mt-1 flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />最近使用：{formatDate(asset.lastUsedAt)}</p> : null}
                    </div>
                    <div className="mt-auto grid grid-cols-2 gap-2 pt-3">
                      <button type="button" onClick={() => handleUse(asset)} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">
                        {asset.kind === 'prompt-template' ? '应用模板' : '使用素材'}
                      </button>
                      <button
                        type="button"
                        disabled={!currentProjectId}
                        onClick={() => currentProjectId && toggleProjectLink(asset.id, currentProjectId)}
                        className={`rounded-xl border px-3 py-2 text-xs font-black disabled:opacity-40 ${currentProjectId && asset.projectIds.includes(currentProjectId) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}
                      >
                        {currentProjectId && asset.projectIds.includes(currentProjectId) ? '已关联项目' : '关联项目'}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
              <Search className="h-9 w-9 text-slate-300" />
              <h2 className="mt-3 text-base font-black text-slate-900">没有符合条件的素材</h2>
              <p className="mt-2 text-sm text-slate-500">可以调整类型、标签、分类或资产范围。部分类型需要先在三维模型管理中上传对应素材。</p>
            </div>
          )}
        </div>
      </main>

      {selectedAsset ? (
        <AssetDetailDrawer
          asset={selectedAsset}
          currentProjectId={currentProjectId}
          onClose={() => setSelectedAssetId(null)}
          onFavorite={() => toggleFavorite(selectedAsset.id)}
          onUse={() => handleUse(selectedAsset)}
          onToggleProject={() => currentProjectId && toggleProjectLink(selectedAsset.id, currentProjectId)}
        />
      ) : null}
    </div>
  );
}

function EnterpriseAssetPreview({ asset, className = '' }: { asset: EnterpriseAsset; className?: string }) {
  return (
    <CaseImage
      src={asset.previewUrl}
      previousUiSrc={asset.previewPreviousUiUrl}
      fallbackSrc={asset.previewFallbackUrl}
      finalFallbackSrc={asset.previewFinalFallbackUrl}
      alt={asset.previewAlt || asset.name}
      className={`aspect-video w-full ${className}`}
      isDemoAsset={asset.fallbackIsDemoAsset}
    />
  );
}

function AssetDetailDrawer({
  asset,
  currentProjectId,
  onClose,
  onFavorite,
  onUse,
  onToggleProject,
}: {
  asset: ReturnType<typeof applyEnterpriseAssetPreferences>[number];
  currentProjectId?: string | null;
  onClose: () => void;
  onFavorite: () => void;
  onUse: () => void;
  onToggleProject: () => void;
}) {
  const isProjectLinked = Boolean(currentProjectId && asset.projectIds.includes(currentProjectId));
  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">{readEnterpriseAssetKindLabel(asset.kind)}</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">{asset.name}</h2>
        </div>
        <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar">
        <EnterpriseAssetPreview asset={asset} />
        <p className="mt-4 text-sm leading-6 text-slate-600">{asset.description}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <AssetPill tone="blue">{asset.visibility === 'administrator-shared' ? '管理员/企业共享' : '个人资产'}</AssetPill>
          <AssetPill>{asset.category}</AssetPill>
          {asset.isFavorite ? <AssetPill tone="rose">已收藏</AssetPill> : null}
          {isProjectLinked ? <AssetPill tone="blue">已关联当前项目</AssetPill> : null}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <DetailItem icon={<ShieldCheck className="h-4 w-4" />} label="资产范围" value={asset.visibility === 'administrator-shared' ? '企业共享' : '仅个人'} />
          <DetailItem icon={<FolderKanban className="h-4 w-4" />} label="来源" value={asset.source.label} />
          <DetailItem icon={<UserRound className="h-4 w-4" />} label="创建者" value={asset.source.createdBy || '企业素材管理员'} />
          <DetailItem icon={<Clock3 className="h-4 w-4" />} label="最近使用" value={asset.lastUsedAt ? formatDate(asset.lastUsedAt) : '尚未使用'} />
        </div>
        {asset.source.originalName ? (
          <div className="mt-4 rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">原始文件</p>
            <p className="mt-1 break-all text-sm font-bold text-slate-700">{asset.source.originalName}</p>
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {asset.tags.map(item => <span key={item} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">#{item}</span>)}
        </div>
      </div>
      <footer className="grid grid-cols-3 gap-2 border-t border-slate-100 p-4">
        <button type="button" onClick={onUse} className="rounded-xl bg-slate-950 px-3 py-2.5 text-sm font-black text-white"><Sparkles className="mr-1 inline h-4 w-4" />使用</button>
        <button type="button" onClick={onFavorite} className={`rounded-xl border px-3 py-2.5 text-sm font-black ${asset.isFavorite ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-700'}`}><Heart className={`mr-1 inline h-4 w-4 ${asset.isFavorite ? 'fill-current' : ''}`} />收藏</button>
        <button type="button" onClick={onToggleProject} disabled={!currentProjectId} className={`rounded-xl border px-3 py-2.5 text-sm font-black disabled:opacity-40 ${isProjectLinked ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-700'}`}><Link2 className="mr-1 inline h-4 w-4" />项目</button>
      </footer>
    </div>
  );
}

function DetailItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-blue-600">{icon}<span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span></div>
      <p className="mt-2 text-sm font-bold text-slate-800">{value}</p>
    </div>
  );
}

function AssetPill({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'blue' | 'rose' }) {
  const toneClass = tone === 'blue' ? 'bg-blue-50 text-blue-700' : tone === 'rose' ? 'bg-rose-50 text-rose-700' : 'bg-white/90 text-slate-700';
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black backdrop-blur ${toneClass}`}>{children}</span>;
}

function filterButtonClass(active: boolean): string {
  return `shrink-0 rounded-full border px-3 py-1.5 text-xs font-black transition ${active ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200'}`;
}

function tagButtonClass(active: boolean): string {
  return `shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
