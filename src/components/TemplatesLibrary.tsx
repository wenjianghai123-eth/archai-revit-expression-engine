import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Clipboard, Eye, Heart, History, Layers, Search, Sparkles, Star, Wand2, X } from 'lucide-react';
import { GenerationConfig, PromptTemplate } from '../types';
import { useEnterpriseAssetPreferences } from '../hooks/useEnterpriseAssetPreferences';
import { AspectRatioImage } from './common/AspectRatioImage';
import { GenerationImageViewer } from './common/GenerationImageViewer';

type FeatureFilter = 'all' | PromptTemplate['feature'];

interface TemplatesLibraryProps {
  templates: PromptTemplate[];
  currentConfig: GenerationConfig;
  onApply: (template: PromptTemplate) => void;
}

const FEATURE_FILTERS: Array<{ label: string; value: FeatureFilter }> = [
  { label: '全部', value: 'all' },
  { label: '平面彩平', value: 'floorplan' },
  { label: '自由参考生图', value: 'free-reference-image' },
  { label: '材质软装替换', value: 'material-replace' },
  { label: '元素植入', value: 'object-insert' },
  { label: '方案变体', value: 'design-variants' },
];

const CATEGORY_FILTERS = ['全部', '平面彩平', '自由参考生图', '材质软装替换', '元素植入', '方案变体'];
function featureLabel(feature: PromptTemplate['feature']): string {
  if (feature === 'image-polish') return '质感提升';
  if (feature === 'floorplan') return '平面彩平';
  if (feature === 'free-reference-image') return '自由参考生图';
  if (feature === 'material-replace') return '材质软装替换';
  if (feature === 'design-variants') return '方案变体';
  if (feature === 'style-render') return '风格渲染';
  if (feature === 'object-insert') return '元素植入';
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

function configSummary(config: GenerationConfig): string {
  const entries = Object.entries(config)
    .filter(([, value]) => value !== undefined && value !== null && value !== '' && !Array.isArray(value) && typeof value !== 'object')
    .slice(0, 5)
    .map(([key, value]) => `${key}: ${String(value)}`);
  return entries.length ? entries.join(' / ') : '无额外参数';
}

export function TemplatesLibrary({ templates, currentConfig, onApply }: TemplatesLibraryProps) {
  const { preferences, toggleFavorite: toggleKnowledgeFavorite, markUsed } = useEnterpriseAssetPreferences();
  const [searchQuery, setSearchQuery] = useState('');
  const [featureFilter, setFeatureFilter] = useState<FeatureFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('全部');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null);
  const [copiedTemplateId, setCopiedTemplateId] = useState<string | null>(null);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);

  useEffect(() => {
    setIsPromptExpanded(false);
  }, [selectedTemplate?.id]);

  const favoriteIds = useMemo(
    () => templates.filter(template => preferences.favoriteIds.includes(`prompt-template:${template.id}`)).map(template => template.id),
    [preferences.favoriteIds, templates],
  );
  const recentUsage = useMemo(
    () => Object.fromEntries(templates.flatMap(template => {
      const usedAt = preferences.recentUsage[`prompt-template:${template.id}`];
      return usedAt ? [[template.id, usedAt]] : [];
    })),
    [preferences.recentUsage, templates],
  );

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
    return (featureFilter === 'all' ? templates : templates.filter((template) => template.feature === featureFilter)).slice(0, 3);
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
    markUsed(`prompt-template:${template.id}`);
    onApply(template);
  };

  const toggleFavorite = (templateId: string) => {
    toggleKnowledgeFavorite(`prompt-template:${templateId}`);
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
        <div className="shrink-0 border-b border-slate-200/70 bg-white px-3 py-3 md:px-4">
          <div className="mx-auto max-w-[1600px] space-y-2">
            <div className="grid gap-3 xl:grid-cols-[minmax(260px,0.9fr)_minmax(520px,1.6fr)] xl:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white shadow-lg shadow-slate-200">
                  <Layers className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h1 className="text-lg font-bold tracking-tight text-slate-900">提示词模板库</h1>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">
                      {filteredTemplates.length} / {templates.length} 个模板
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">从满意的生成结果沉淀全局提示词模板</p>
                </div>
              </div>

              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="搜索模板名称、分类、风格或关键词..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none transition-all placeholder:text-slate-400 focus:border-blue-300 focus:bg-white"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {FEATURE_FILTERS.map((filter) => (
                    <button
                      key={filter.value}
                      onClick={() => setFeatureFilter(filter.value)}
                      className={`shrink-0 rounded-full border px-2.5 py-1.5 text-xs font-bold transition-all ${
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
                    className={`shrink-0 rounded-full border px-2.5 py-1.5 text-xs font-bold transition-all ${
                      favoritesOnly
                        ? 'border-rose-500 bg-rose-500 text-white'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    我的收藏
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {CATEGORY_FILTERS.map((category) => (
                <button
                  key={category}
                  onClick={() => setCategoryFilter(category)}
                  className={`shrink-0 rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition-all ${
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

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 custom-scrollbar md:px-4">
          <div className="mx-auto max-w-[1600px] space-y-3">
            {recommendedTemplates.length > 0 ? (
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-500" />
                  <h2 className="text-sm font-bold text-slate-900">推荐模板</h2>
                  <span className="text-xs text-slate-400">{featureFilter === 'all' ? '按功能精选' : featureLabel(featureFilter)}</span>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {recommendedTemplates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplate(template)}
                    className="group overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                  >
                    <div className="flex gap-3 p-3">
                      <div className="w-32 shrink-0">
                        <AspectRatioImage src={template.previewImage} alt={template.title} className="rounded-lg" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold text-blue-600">{featureLabel(template.feature)}</p>
                        <h3 className="mt-1 truncate text-sm font-bold text-slate-900">{template.title}</h3>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{promptSummary(template.promptText)}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
            ) : null}

            {recentTemplates.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-slate-500" />
                  <h2 className="text-sm font-bold text-slate-900">最近使用</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recentTemplates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => setSelectedTemplate(template)}
                      className="max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs shadow-sm hover:border-blue-200"
                    >
                      <span className="font-bold text-slate-800">{template.title}</span>
                      <span className="ml-2 text-slate-400">{featureLabel(template.feature)}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {filteredTemplates.length === 0 ? (
              <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
                  <Sparkles className="h-6 w-6 text-blue-500" />
                </div>
                <h2 className="text-base font-bold text-slate-900">{templates.length === 0 ? '暂无真实提示词模板' : '没有找到匹配的模板'}</h2>
                <p className="mt-2 max-w-sm text-sm text-slate-500">
                  {templates.length === 0 ? '在核心功能生成满意结果后，点击结果卡片上的“保存为提示词模板”，这里会展示真实结果模板。' : '没有找到匹配的模板，请尝试更换关键词或筛选条件。'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {filteredTemplates.map((template) => {
                  const isActive = currentConfig.prompt === template.promptText || currentConfig.prompt === template.config.prompt;
                  const isFavorite = favoriteIds.includes(template.id);

                  return (
                    <article
                      key={template.id}
                      className={`arch-card flex h-full min-h-[400px] flex-col p-2 ${
                        isActive ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'
                      }`}
                    >
                      <div className="relative shrink-0 overflow-hidden rounded-xl bg-slate-100">
                        <AspectRatioImage src={template.previewImage} alt={template.title} className="rounded-xl border-0 shadow-none" />
                        <div className="absolute left-2 top-2 flex gap-1.5">
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
                          className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur transition-colors ${
                            isFavorite
                              ? 'border-rose-200 bg-rose-500 text-white'
                              : 'border-white/70 bg-white/90 text-slate-500 hover:text-rose-500'
                          }`}
                          title={isFavorite ? '取消收藏' : '收藏模板'}
                        >
                          <Heart className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
                        </button>
                      </div>

                      <div className="flex min-h-0 flex-1 flex-col p-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{template.category}</p>
                            <h2 className="mt-1 truncate text-sm font-bold text-slate-900">{template.title}</h2>
                          </div>
                        </div>

                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{template.description || '由成功生成结果保存。'}</p>

                        <div className="mt-2 flex min-h-6 flex-wrap gap-1.5 overflow-hidden">
                          {(template.tags || []).slice(0, 3).map((tagValue) => (
                            <TemplateTag key={tagValue}>#{tagValue}</TemplateTag>
                          ))}
                          {(template.tags || []).length > 3 ? <TemplateTag>+{(template.tags || []).length - 3}</TemplateTag> : null}
                        </div>

                        <div className="mt-2 rounded-lg bg-slate-50 p-2">
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Prompt</p>
                          <p className="line-clamp-4 text-[11px] leading-4 text-slate-600">{promptSummary(template.promptText)}</p>
                        </div>

                        <div className="mt-2 rounded-lg bg-slate-50 p-2">
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">参数摘要</p>
                          <p className="line-clamp-2 text-[11px] leading-4 text-slate-600">{configSummary(template.config as GenerationConfig)}</p>
                        </div>

                        {template.inputPreviews?.length ? (
                          <div className="mt-2 flex gap-1.5 overflow-hidden">
                            {template.inputPreviews.slice(0, 4).map((item, index) => (
                              <div key={`${item.assetId || item.url}-${index}`} className="w-24 shrink-0">
                                <AspectRatioImage src={item.url} alt={item.label} className="rounded-lg" />
                              </div>
                            ))}
                          </div>
                        ) : null}

                        <p className="mt-2 text-[10px] font-semibold text-slate-400">{template.createdAt ? `创建于 ${template.createdAt}` : '创建时间未记录'}</p>

                        <div className="mt-auto grid shrink-0 grid-cols-3 gap-1.5 border-t border-slate-100 pt-2">
                          <button
                            onClick={() => handleApply(template)}
                            className="arch-button-primary rounded-lg px-2 py-2 text-xs"
                          >
                            <Wand2 className="h-4 w-4" />
                            应用模板
                          </button>
                          <button
                            onClick={() => setSelectedTemplate(template)}
                            className="arch-button-secondary rounded-lg px-2 py-2 text-xs"
                          >
                            <Eye className="h-4 w-4" />
                            查看详情
                          </button>
                          <button
                            onClick={() => handleCopyPrompt(template)}
                            className="arch-button-secondary rounded-lg bg-slate-950 px-2 py-2 text-xs text-white hover:bg-slate-900 hover:text-white"
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
                <GenerationImageViewer
                  sourceImageUrl={selectedTemplate.inputPreviews?.[0]?.url}
                  sourceImageAssetId={selectedTemplate.inputPreviews?.[0]?.assetId || selectedTemplate.sourceAssetId}
                  resultImageUrl={selectedTemplate.outputUrl || selectedTemplate.previewImage || selectedTemplate.coverUrl}
                  resultImageAssetId={selectedTemplate.outputAssetId || selectedTemplate.coverAssetId}
                  featureName="提示词模板详情"
                  step={selectedTemplate.generationStep}
                  sourceMissingMessage="暂无原图，无法对比。"
                />

                <div className="mt-5 flex flex-wrap gap-2">
                  <TemplateTag>{selectedTemplate.category}</TemplateTag>
                  <TemplateTag>{featureLabel(selectedTemplate.feature)}</TemplateTag>
                  {(selectedTemplate.tags || []).map((tagValue) => (
                    <TemplateTag key={tagValue}>#{tagValue}</TemplateTag>
                  ))}
                </div>

                <p className="mt-4 text-sm leading-6 text-slate-600">{selectedTemplate.description || '由成功生成结果保存的全局提示词模板。'}</p>

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

                <div className="mt-5 rounded-xl border border-slate-100 bg-white p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">本次输入素材</p>
                  {selectedTemplate.inputPreviews?.length ? (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {selectedTemplate.inputPreviews.map((item, index) => (
                        <div key={`${item.assetId || item.url}-${index}`} className="overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                          <AspectRatioImage src={item.url} alt={item.label} className="rounded-lg" />
                          <p className="truncate px-2 py-1 text-[10px] font-bold text-slate-600">{item.label}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-400">没有可预览的输入素材。</p>
                  )}
                </div>

                <div className="mt-5 rounded-xl border border-slate-100 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">参数配置</p>
                  <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-[11px] leading-5 text-slate-600 custom-scrollbar">
                    {JSON.stringify(selectedTemplate.config, null, 2)}
                  </pre>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-4 rounded-xl border border-slate-100 p-4">
                  <DetailRow label="outputAssetId" value={selectedTemplate.outputAssetId || '未记录'} />
                  <DetailRow label="createdFromJobId" value={selectedTemplate.createdFromJobId || '未记录'} />
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
