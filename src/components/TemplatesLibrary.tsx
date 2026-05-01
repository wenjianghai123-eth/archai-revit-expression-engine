import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Clipboard, Eye, Heart, History, Layers, Search, Sparkles, Star, Wand2, X } from 'lucide-react';
import { GenerationConfig, PromptTemplate } from '../types';

type FeatureFilter = 'all' | PromptTemplate['feature'];

interface TemplatesLibraryProps {
  templates: PromptTemplate[];
  currentConfig: GenerationConfig;
  onApply: (template: PromptTemplate) => void;
}

const FEATURE_FILTERS: Array<{ label: string; value: FeatureFilter }> = [
  { label: '全部', value: 'all' },
  { label: '平面彩平', value: 'floorplan' },
  { label: '风格渲染', value: 'style-render' },
  { label: '局部修饰', value: 'inpaint' },
];

const CATEGORY_FILTERS = ['全部', '住宅', '商业', '室内', '景观', '材质', '局部优化'];
const FAVORITES_STORAGE_KEY = 'archai-template-favorites-v1';
const RECENT_STORAGE_KEY = 'archai-template-recent-v1';

function readStringList(key: string): string[] {
  if (typeof window === 'undefined') return [];

  try {
    const value = JSON.parse(window.localStorage.getItem(key) || '[]') as unknown;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function readRecentUsage(): Record<string, string> {
  if (typeof window === 'undefined') return {};

  try {
    const value = JSON.parse(window.localStorage.getItem(RECENT_STORAGE_KEY) || '{}') as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string'),
    );
  } catch {
    return {};
  }
}

function featureLabel(feature: PromptTemplate['feature']): string {
  if (feature === 'floorplan') return '平面彩平';
  if (feature === 'style-render') return '风格渲染';
  return '局部修饰';
}

function TemplateTag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">{children}</span>;
}

function DetailRow({ label, value }: { label: string; value?: string | number }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value ?? '未设置'}</p>
    </div>
  );
}

function matchesTemplateCategory(template: PromptTemplate, category: string): boolean {
  if (category === '全部') return true;

  const text = [
    template.category,
    template.title,
    template.description,
    template.promptText,
    template.useCase,
    ...(template.tags || []),
    ...(template.suitableImages || []),
  ].join(' ');

  if (category === '商业') return /商业|办公|展示|会所|售楼|店|商/.test(text);
  if (category === '室内') return /室内|客厅|卧室|厨房|餐厅|空间|住宅样板间/.test(text);
  if (category === '景观') return /景观|庭院|院落|绿植|植物|水景|室外/.test(text);
  if (category === '材质') return /材质|木饰面|石材|微水泥|大理石|墙面|地面|台面|织物/.test(text);
  if (category === '局部优化') return template.feature === 'inpaint' || /局部|修饰|优化|替换|重绘/.test(text);

  return text.includes(category);
}

function promptSummary(prompt: string): string {
  return prompt.length > 132 ? `${prompt.slice(0, 132)}...` : prompt;
}

export function TemplatesLibrary({ templates, currentConfig, onApply }: TemplatesLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [featureFilter, setFeatureFilter] = useState<FeatureFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('全部');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => readStringList(FAVORITES_STORAGE_KEY));
  const [recentUsage, setRecentUsage] = useState<Record<string, string>>(readRecentUsage);
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null);
  const [copiedTemplateId, setCopiedTemplateId] = useState<string | null>(null);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteIds));
  }, [favoriteIds]);

  useEffect(() => {
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recentUsage));
  }, [recentUsage]);

  useEffect(() => {
    setIsPromptExpanded(false);
  }, [selectedTemplate?.id]);

  const filteredTemplates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return templates.filter((template) => {
      const searchableText = [
        template.title,
        template.category,
        template.description,
        template.promptText,
        template.recommendedStyle,
        template.useCase,
        ...(template.suitableImages || []),
        ...(template.tags || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch = !query || searchableText.includes(query);
      const matchesFeature = featureFilter === 'all' || template.feature === featureFilter;
      const matchesCategory = matchesTemplateCategory(template, categoryFilter);
      const matchesFavorite = !favoritesOnly || favoriteIds.includes(template.id);

      return matchesSearch && matchesFeature && matchesCategory && matchesFavorite;
    });
  }, [templates, searchQuery, featureFilter, categoryFilter, favoritesOnly, favoriteIds]);

  const recommendedTemplates = useMemo(() => {
    if (featureFilter === 'all') {
      const preferredIds = ['floorplan-modern-courtyard-house', 'style-render-wabi-sabi', 'inpaint-living-room-material-upgrade'];
      return preferredIds
        .map((templateId) => templates.find((template) => template.id === templateId))
        .filter((template): template is PromptTemplate => Boolean(template));
    }

    return templates.filter((template) => template.feature === featureFilter).slice(0, 3);
  }, [templates, featureFilter]);

  const recentTemplates = useMemo(
    () =>
      templates
        .filter((template) => recentUsage[template.id])
        .sort((a, b) => new Date(recentUsage[b.id]).getTime() - new Date(recentUsage[a.id]).getTime())
        .slice(0, 4),
    [templates, recentUsage],
  );

  const handleApply = (template: PromptTemplate) => {
    setRecentUsage((previous) => ({
      ...previous,
      [template.id]: new Date().toISOString(),
    }));
    onApply(template);
  };

  const toggleFavorite = (templateId: string) => {
    setFavoriteIds((previous) =>
      previous.includes(templateId) ? previous.filter((currentId) => currentId !== templateId) : [...previous, templateId],
    );
  };

  const handleCopyPrompt = async (template: PromptTemplate) => {
    try {
      await navigator.clipboard.writeText(template.promptText);
      setCopiedTemplateId(template.id);
      window.setTimeout(() => setCopiedTemplateId(null), 1800);
    } catch {
      setCopiedTemplateId(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#f5f7fb]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-slate-200/70 bg-white p-4">
          <div className="mx-auto max-w-7xl space-y-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-200">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-slate-900">提示词模板库</h1>
                  <p className="mt-1 text-sm text-slate-500">参考效果图与对应提示词，快速复用建筑表达风格</p>
                </div>
              </div>

              <div className="relative w-full lg:max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="搜索模板名称、分类、风格或关键词..."
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition-all placeholder:text-slate-400 focus:border-blue-300 focus:bg-white"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {FEATURE_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    onClick={() => setFeatureFilter(filter.value)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition-all ${
                      featureFilter === filter.value
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
                <button
                  onClick={() => setFavoritesOnly((value) => !value)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition-all ${
                    favoritesOnly
                      ? 'border-rose-500 bg-rose-500 text-white'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                  }`}
                >
                  我的收藏
                </button>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {CATEGORY_FILTERS.map((category) => (
                  <button
                    key={category}
                    onClick={() => setCategoryFilter(category)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-all ${
                      categoryFilter === category
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="mx-auto max-w-7xl space-y-4">
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-500" />
                  <h2 className="text-sm font-bold text-slate-900">推荐模板</h2>
                  <span className="text-xs text-slate-400">{featureFilter === 'all' ? '按功能精选' : featureLabel(featureFilter)}</span>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {recommendedTemplates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplate(template)}
                    className="group overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                  >
                    <div className="flex gap-3 p-3">
                      <img src={template.previewImage} alt={template.title} className="h-20 w-24 rounded-lg object-cover" referrerPolicy="no-referrer" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold text-blue-600">{featureLabel(template.feature)}</p>
                        <h3 className="mt-1 truncate text-sm font-bold text-slate-900">{template.title}</h3>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{template.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {recentTemplates.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-slate-500" />
                  <h2 className="text-sm font-bold text-slate-900">最近使用</h2>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {recentTemplates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => setSelectedTemplate(template)}
                      className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs shadow-sm hover:border-blue-200"
                    >
                      <span className="font-bold text-slate-800">{template.title}</span>
                      <span className="ml-2 text-slate-400">{featureLabel(template.feature)}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {filteredTemplates.length === 0 ? (
              <div className="arch-empty">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
                  <Sparkles className="h-8 w-8 text-blue-500" />
                </div>
                <h2 className="text-lg font-bold text-slate-900">没有找到匹配的模板</h2>
                <p className="mt-2 max-w-sm text-sm text-slate-500">没有找到匹配的模板，请尝试更换关键词或筛选条件。</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {filteredTemplates.map((template) => {
                  const isActive = currentConfig.prompt === template.config.prompt;
                  const isFavorite = favoriteIds.includes(template.id);

                  return (
                    <article
                      key={template.id}
                      className={`arch-card p-2 ${
                        isActive ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'
                      }`}
                    >
                      <div className="relative h-36 overflow-hidden rounded-2xl bg-slate-100">
                        <img src={template.previewImage} alt={template.title} className="h-full w-full object-cover transition-transform duration-500 hover:scale-105" referrerPolicy="no-referrer" />
                        <div className="absolute left-3 top-3 flex gap-2">
                          <span className="rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold text-slate-700 backdrop-blur">
                            {featureLabel(template.feature)}
                          </span>
                          {isActive && (
                            <span className="flex items-center gap-1 rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-bold text-white">
                              <Check className="h-3 w-3" />
                              已应用
                            </span>
                          )}
                        </div>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleFavorite(template.id);
                          }}
                          className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur transition-colors ${
                            isFavorite
                              ? 'border-rose-200 bg-rose-500 text-white'
                              : 'border-white/70 bg-white/90 text-slate-500 hover:text-rose-500'
                          }`}
                          title={isFavorite ? '取消收藏' : '收藏模板'}
                        >
                          <Heart className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
                        </button>
                      </div>

                      <div className="flex h-44 flex-col p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{template.category}</p>
                            <h2 className="mt-1 truncate text-sm font-bold text-slate-900">{template.title}</h2>
                          </div>
                        </div>

                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{template.description}</p>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(template.tags || []).slice(0, 4).map((tagValue) => (
                            <TemplateTag key={tagValue}>#{tagValue}</TemplateTag>
                          ))}
                        </div>

                        <div className="mt-2 rounded-xl bg-slate-50 p-2">
                          <p className="line-clamp-2 text-[11px] leading-4 text-slate-600">{promptSummary(template.promptText)}</p>
                        </div>

                        <div className="mt-auto grid grid-cols-3 gap-1.5 border-t border-slate-100 pt-2">
                          <button
                            onClick={() => handleApply(template)}
                            className="arch-button-primary rounded-xl py-2 text-xs"
                          >
                            <Wand2 className="h-4 w-4" />
                            应用模板
                          </button>
                          <button
                            onClick={() => setSelectedTemplate(template)}
                            className="arch-button-secondary rounded-xl py-2 text-xs"
                          >
                            <Eye className="h-4 w-4" />
                            查看详情
                          </button>
                          <button
                            onClick={() => handleCopyPrompt(template)}
                            className="arch-button-secondary rounded-xl bg-slate-950 py-2 text-xs text-white hover:bg-slate-900 hover:text-white"
                          >
                            <Clipboard className="h-4 w-4" />
                            {copiedTemplateId === template.id ? '已复制' : '复制'}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {selectedTemplate && (
          <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-sm">
            <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b border-slate-100 p-5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">模板详情</p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">{selectedTemplate.title}</h2>
                </div>
                <button onClick={() => setSelectedTemplate(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="关闭">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
                <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-100">
                  <img src={selectedTemplate.previewImage} alt={selectedTemplate.title} className="h-72 w-full object-cover" referrerPolicy="no-referrer" />
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <TemplateTag>{selectedTemplate.category}</TemplateTag>
                  <TemplateTag>{featureLabel(selectedTemplate.feature)}</TemplateTag>
                  {(selectedTemplate.tags || []).map((tagValue) => (
                    <TemplateTag key={tagValue}>#{tagValue}</TemplateTag>
                  ))}
                </div>

                <p className="mt-4 text-sm leading-6 text-slate-600">{selectedTemplate.description}</p>

                <div className="mt-5 rounded-xl bg-slate-50 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">完整提示词</p>
                    <button
                      onClick={() => setIsPromptExpanded((value) => !value)}
                      className="flex items-center gap-1 rounded bg-white px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100"
                    >
                      {isPromptExpanded ? '收起' : '展开'}
                      <ChevronDown className={`h-3 w-3 transition-transform ${isPromptExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                  <div
                    className={`overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700 custom-scrollbar ${
                      isPromptExpanded ? 'max-h-96' : 'max-h-28'
                    }`}
                  >
                    {selectedTemplate.promptText}
                  </div>
                </div>

                {selectedTemplate.useCase && (
                  <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400">适用场景</p>
                    <p className="mt-2 text-sm leading-6 text-blue-900">{selectedTemplate.useCase}</p>
                  </div>
                )}

                <div className="mt-5 rounded-xl border border-slate-100 bg-white p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">适合什么图片</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(selectedTemplate.suitableImages || ['当前功能对应的清晰输入图']).map((item) => (
                      <span key={item} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-4 rounded-xl border border-slate-100 p-4">
                  <DetailRow label="Style" value={selectedTemplate.recommendedStyle || selectedTemplate.config.style} />
                  <DetailRow label="Lighting" value={selectedTemplate.recommendedLighting || selectedTemplate.config.lighting} />
                  <DetailRow
                    label="Material"
                    value={selectedTemplate.recommendedMaterialStrength ?? selectedTemplate.config.materialStrength}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 border-t border-slate-100 p-5">
                <button
                  onClick={() => handleApply(selectedTemplate)}
                  className="arch-button-primary rounded-xl py-2.5"
                >
                  <Wand2 className="h-4 w-4" />
                  应用模板
                </button>
                <button
                  onClick={() => handleCopyPrompt(selectedTemplate)}
                  className="arch-button-secondary rounded-xl py-2.5"
                >
                  <Clipboard className="h-4 w-4" />
                  {copiedTemplateId === selectedTemplate.id ? '已复制' : '复制提示词'}
                </button>
                <button
                  onClick={() => setSelectedTemplate(null)}
                  className="rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
