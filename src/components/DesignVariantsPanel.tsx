import { Download, Heart, ImagePlus, LayoutGrid, Sparkles, Star } from 'lucide-react';
import { type ReactNode } from 'react';
import { GenerationConfig, GenerationResultOption, StepState, UploadedImage, VariantGenerationStrategy, VariantStyleKey } from '../types';
import { downloadDataUrl } from '../utils/download';
import { getDataUrlExtension } from './workspace/workspaceUtils';

interface DesignVariantsPanelProps {
  state: StepState;
  resultOptions: GenerationResultOption[];
  selectedResultId: string | null;
  previewImage: string | null | undefined;
  uploadError: string | null;
  onUploadInput: () => void;
  onUpdateInputImage: (image: UploadedImage | null) => void;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
  onGenerate: () => void;
  onSelectGenerationResult: (resultId: string) => void;
  onToggleGenerationFavorite: (resultId: string) => void;
}

export const variantStyleOptions: Array<{ key: VariantStyleKey; label: string }> = [
  { key: 'modern-minimal', label: '现代极简' },
  { key: 'wabi-sabi', label: '侘寂' },
  { key: 'cream-style', label: '奶油风' },
  { key: 'light-luxury', label: '轻奢' },
  { key: 'industrial', label: '工业风' },
  { key: 'commercial-showroom', label: '商业展示风' },
  { key: 'hotel-lobby', label: '酒店大堂风' },
  { key: 'office-space', label: '办公空间风' },
  { key: 'natural-wood', label: '自然木质' },
  { key: 'premium-gray', label: '高级灰' },
  { key: 'custom', label: '自定义' },
];

const defaultStylesByCount: Record<2 | 4, VariantStyleKey[]> = {
  2: ['modern-minimal', 'natural-wood'],
  4: ['modern-minimal', 'cream-style', 'light-luxury', 'natural-wood'],
};

export function DesignVariantsPanel({
  state,
  resultOptions,
  selectedResultId,
  previewImage,
  uploadError,
  onUploadInput,
  onUpdateInputImage,
  onUpdateConfig,
  onGenerate,
  onSelectGenerationResult,
  onToggleGenerationFavorite,
}: DesignVariantsPanelProps) {
  const batchCount = state.config.batchCount === 2 ? 2 : 4;
  const variantStrategy = state.config.variantStrategy || 'style-matrix';
  const selectedStyles = resolveSelectedStyles(state.config, batchCount);
  const selectedResult = resultOptions.find(result => result.id === selectedResultId) || resultOptions.find(result => result.isSelected) || resultOptions[0] || null;

  const handleBatchCountChange = (nextBatchCount: 2 | 4) => {
    onUpdateConfig({
      batchCount: nextBatchCount,
      variantStyles: resolveSelectedStyles({ ...state.config, batchCount: nextBatchCount }, nextBatchCount),
    });
  };

  const handleStyleToggle = (style: VariantStyleKey) => {
    const current = selectedStyles.filter(item => item !== style);
    const next = selectedStyles.includes(style) ? current : [...selectedStyles, style];
    onUpdateConfig({ variantStyles: next.slice(0, batchCount) });
  };

  return (
    <section className="min-w-0 flex-1 overflow-y-auto bg-slate-100 p-4 custom-scrollbar">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
              <LayoutGrid className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-950">方案变体</h2>
              <p className="text-xs text-slate-500">一次生成多种设计方向，快速对比方案</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onGenerate}
            disabled={!state.inputImage || state.isGenerating}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {state.isGenerating ? '正在生成方案组...' : '生成方案组'}
          </button>
        </div>

        <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
          <aside className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold text-slate-500">原图</p>
              {state.inputImage ? (
                <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                  <img src={state.inputImage.dataUrl || state.inputImage.url} alt="原图" className="h-44 w-full object-cover" />
                  <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-slate-500">
                    <span className="truncate font-semibold">{state.inputImage.name}</span>
                    <button type="button" onClick={() => onUpdateInputImage(null)} className="font-bold text-slate-700">移除</button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onUploadInput}
                  className="mt-3 flex h-44 w-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm font-bold text-slate-500 hover:border-blue-300 hover:bg-blue-50"
                >
                  <ImagePlus className="mb-2 h-7 w-7" />
                  上传原图
                </button>
              )}
              {uploadError ? <p className="mt-2 text-xs font-semibold text-red-600">{uploadError}</p> : null}
            </div>

            <ControlGroup title="生成数量">
              <SegmentedButton active={batchCount === 2} onClick={() => handleBatchCountChange(2)} label="2 张" />
              <SegmentedButton active={batchCount === 4} onClick={() => handleBatchCountChange(4)} label="4 张" />
            </ControlGroup>

            <ControlGroup title="方案模式">
              <SegmentedButton active={variantStrategy === 'style-matrix'} onClick={() => onUpdateConfig({ variantStrategy: 'style-matrix' })} label="多风格方案矩阵" />
              <SegmentedButton active={variantStrategy === 'same-style'} onClick={() => onUpdateConfig({ variantStrategy: 'same-style' })} label="同一风格多方案" />
            </ControlGroup>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold text-slate-500">设计方向</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {variantStyleOptions.map(option => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => handleStyleToggle(option.key)}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold ${selectedStyles.includes(option.key) ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {selectedStyles.includes('custom') ? (
                <input
                  value={state.config.customStyleLabel || ''}
                  onChange={event => onUpdateConfig({ customStyleLabel: event.currentTarget.value })}
                  placeholder="输入自定义方向"
                  className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-300"
                />
              ) : null}
            </div>

            <label className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <span className="text-xs font-bold text-slate-500">自定义补充</span>
              <textarea
                value={state.config.customPrompt || ''}
                onChange={event => onUpdateConfig({ customPrompt: event.currentTarget.value, prompt: event.currentTarget.value })}
                placeholder="可选，例如：保留原始结构和相机角度，强化自然采光。"
                className="mt-3 h-24 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-300"
              />
            </label>
          </aside>

          <main className="min-w-0 space-y-4">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">当前大图预览</p>
                  <p className="mt-0.5 text-xs text-slate-500">{selectedResult?.variantLabel || selectedResult?.variantStyleLabel || '等待生成方案组'}</p>
                </div>
                {previewImage ? (
                  <button
                    type="button"
                    onClick={() => downloadDataUrl(previewImage, `design-variant-${Date.now()}.${getDataUrlExtension(previewImage)}`)}
                    className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700"
                  >
                    <Download className="mr-1 inline h-3.5 w-3.5" />
                    下载
                  </button>
                ) : null}
              </div>
              <div className="flex h-[360px] items-center justify-center bg-slate-50">
                {previewImage ? (
                  <img src={previewImage} alt="当前方案" className="h-full w-full object-contain" />
                ) : (
                  <div className="text-center text-sm font-bold text-slate-400">
                    <LayoutGrid className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                    方案矩阵结果区
                  </div>
                )}
              </div>
            </div>

            <div className={`grid gap-3 ${batchCount === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-2'}`}>
              {resultOptions.length > 0 ? resultOptions.map((result, index) => (
                <VariantCard
                  key={result.id}
                  result={result}
                  index={index}
                  active={result.id === selectedResultId || result.isSelected}
                  onSelect={() => onSelectGenerationResult(result.id)}
                  onFavorite={() => onToggleGenerationFavorite(result.id)}
                />
              )) : Array.from({ length: batchCount }).map((_, index) => (
                <div key={index} className="flex min-h-60 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white text-sm font-bold text-slate-300">
                  {readVariantLabel(index)}
                </div>
              ))}
            </div>
          </main>
        </div>
      </div>
    </section>
  );
}

function VariantCard({
  result,
  index,
  active,
  onSelect,
  onFavorite,
}: {
  result: GenerationResultOption;
  index: number;
  active: boolean;
  onSelect: () => void;
  onFavorite: () => void;
}) {
  const label = result.variantLabel || readVariantLabel(index);
  const styleLabel = result.variantStyleLabel || readVariantStyleLabel(result.variantStyle);
  return (
    <article className={`overflow-hidden rounded-lg border bg-white shadow-sm ${active ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'}`}>
      <button type="button" onClick={onSelect} className="block w-full text-left">
        <div className="relative h-56 bg-slate-100">
          <img src={result.imageUrl} alt={label} className="h-full w-full object-cover" />
          {result.isSelected ? (
            <span className="absolute left-3 top-3 rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white">已设为主方案</span>
          ) : null}
        </div>
      </button>
      <div className="space-y-3 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-900">{label}</p>
            <p className="mt-0.5 text-xs text-slate-500">{styleLabel}</p>
          </div>
          <button type="button" onClick={onFavorite} className={`rounded-full p-1.5 ${result.isFavorite ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'}`} title="收藏">
            <Heart className={`h-4 w-4 ${result.isFavorite ? 'fill-current' : ''}`} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={onSelect} className="rounded-md bg-slate-900 px-2 py-2 text-xs font-bold text-white">
            {result.isSelected ? '已设为主方案' : '设为主方案'}
          </button>
          <button type="button" onClick={onFavorite} className="rounded-md bg-slate-100 px-2 py-2 text-xs font-bold text-slate-700">收藏</button>
          <button type="button" onClick={() => downloadDataUrl(result.imageUrl, `${label}-${Date.now()}.${getDataUrlExtension(result.imageUrl)}`)} className="rounded-md bg-slate-100 px-2 py-2 text-xs font-bold text-slate-700">下载</button>
        </div>
        <button type="button" onClick={onSelect} className="inline-flex items-center gap-1 text-xs font-bold text-blue-700">
          <Star className="h-3.5 w-3.5" />
          继续编辑
        </button>
      </div>
    </article>
  );
}

function ControlGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold text-slate-500">{title}</p>
      <div className="mt-3 grid gap-2">{children}</div>
    </div>
  );
}

function SegmentedButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-2 text-sm font-bold ${active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
    >
      {label}
    </button>
  );
}

function resolveSelectedStyles(config: GenerationConfig, batchCount: 2 | 4): VariantStyleKey[] {
  const styles = Array.isArray(config.variantStyles) ? [...config.variantStyles] : [];
  for (const style of defaultStylesByCount[batchCount]) {
    if (styles.length >= batchCount) break;
    if (!styles.includes(style)) styles.push(style);
  }
  return styles.slice(0, batchCount);
}

function readVariantLabel(index: number): string {
  return `方案 ${String.fromCharCode(65 + index)}`;
}

function readVariantStyleLabel(style: VariantStyleKey | undefined): string {
  return variantStyleOptions.find(option => option.key === style)?.label || '设计方向';
}
