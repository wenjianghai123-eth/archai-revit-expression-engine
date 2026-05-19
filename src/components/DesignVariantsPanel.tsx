import { Download, FileText, Heart, ImagePlus, LayoutGrid, Printer, Sparkles, Star } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { designVariantPacks, getDesignVariantPack } from '../constants/designVariantPacks';
import { DesignVariantBatchCount, GenerationConfig, GenerationResultOption, StepState, UploadedImage, VariantStyleKey } from '../types';
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
  onRenameGenerationResult: (resultId: string, variantName: string) => void;
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

const styleDescriptionByKey: Record<string, string> = {
  'modern-minimal': '以简洁线条、克制色彩和精致材质为主，强调空间秩序与高级感。',
  'cream-style': '采用柔和米色系与温暖材质，营造舒适、亲和的空间氛围。',
  'wabi-sabi': '强调自然肌理、低饱和色彩和朴素质感，呈现安静松弛的空间气质。',
  'light-luxury': '通过石材、金属和层次灯光提升精致度，形成更具品质感的视觉表达。',
  industrial: '保留粗粝肌理、金属和混凝土质感，强化空间个性与展示张力。',
  'commercial-showroom': '突出展示焦点、精致灯光和清晰动线，适合商业陈列与品牌表达。',
  'hotel-lobby': '强调高级氛围、层次灯光和优雅饰面，适合公区和接待空间。',
  'office-space': '以高效布局、干净材料和专业光感为主，适合办公与企业空间。',
  'natural-wood': '使用温润木质、自然采光和柔和色彩，形成放松舒适的空间感受。',
  'premium-gray': '以高级灰和克制对比组织空间，突出石材、金属与整体质感。',
  custom: '根据自定义说明形成差异化方案方向。',
};

const defaultStylesByCount: Record<DesignVariantBatchCount, VariantStyleKey[]> = {
  2: ['modern-minimal', 'natural-wood'],
  4: ['modern-minimal', 'cream-style', 'light-luxury', 'natural-wood'],
  8: ['modern-minimal', 'cream-style', 'wabi-sabi', 'light-luxury', 'natural-wood', 'premium-gray', 'industrial', 'hotel-lobby'],
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
  onRenameGenerationResult,
}: DesignVariantsPanelProps) {
  const [exportMode, setExportMode] = useState<'compare' | 'report' | null>(null);
  const batchCount = readBatchCount(state.config.batchCount);
  const variantStrategy = state.config.variantStrategy || 'style-matrix';
  const stylePackId = state.config.stylePackId || 'interior-common';
  const selectedStyles = resolveSelectedStyles(state.config, batchCount);
  const variantNames = resolveVariantNames(state.config, batchCount);
  const selectedResult = resultOptions.find(result => result.id === selectedResultId) || resultOptions.find(result => result.isSelected) || resultOptions[0] || null;

  const handleBatchCountChange = (nextBatchCount: DesignVariantBatchCount) => {
    const pack = getDesignVariantPack(stylePackId);
    onUpdateConfig({
      batchCount: nextBatchCount,
      variantStyles: resolveSelectedStyles({ ...state.config, batchCount: nextBatchCount, variantStyles: pack.styles }, nextBatchCount),
      variantNames: resolveVariantNames({ ...state.config, batchCount: nextBatchCount }, nextBatchCount),
    });
  };

  const handlePackChange = (nextPackId: string) => {
    const pack = getDesignVariantPack(nextPackId);
    onUpdateConfig({
      stylePackId: pack.id,
      variantStyles: pack.styles.slice(0, batchCount),
    });
  };

  const handleStyleChange = (index: number, style: VariantStyleKey) => {
    const next = [...selectedStyles];
    next[index] = style;
    onUpdateConfig({ variantStyles: next.slice(0, batchCount) });
  };

  const handleConfigNameChange = (index: number, name: string) => {
    const next = [...variantNames];
    next[index] = name;
    onUpdateConfig({ variantNames: next });
  };

  const handleResultNameChange = (result: GenerationResultOption, index: number, name: string) => {
    handleConfigNameChange(index, name);
    onRenameGenerationResult(result.id, name || readVariantLabel(index));
  };

  const exportPayload = {
    inputImage: state.inputImage,
    results: resultOptions,
    variantNames,
    styles: selectedStyles,
    createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  };

  return (
    <section className="min-w-0 flex-1 overflow-y-auto bg-slate-100 p-4 custom-scrollbar">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
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
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setExportMode('compare')} disabled={resultOptions.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">
              <Printer className="h-4 w-4" />
              导出对比页
            </button>
            <button type="button" onClick={() => setExportMode('report')} disabled={resultOptions.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">
              <FileText className="h-4 w-4" />
              一键生成汇报页
            </button>
            <button type="button" onClick={onGenerate} disabled={!state.inputImage || state.isGenerating} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              <Sparkles className="h-4 w-4" />
              {state.isGenerating ? `正在生成第 ${Math.max(1, resultOptions.length + 1)} / ${batchCount} 张方案...` : '生成方案组'}
            </button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
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
                <button type="button" onClick={onUploadInput} className="mt-3 flex h-44 w-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm font-bold text-slate-500 hover:border-blue-300 hover:bg-blue-50">
                  <ImagePlus className="mb-2 h-7 w-7" />
                  上传原图
                </button>
              )}
              {uploadError ? <p className="mt-2 text-xs font-semibold text-red-600">{uploadError}</p> : null}
            </div>

            <ControlGroup title="生成数量">
              <SegmentedButton active={batchCount === 2} onClick={() => handleBatchCountChange(2)} label="2 张" />
              <SegmentedButton active={batchCount === 4} onClick={() => handleBatchCountChange(4)} label="4 张" />
              <SegmentedButton active={batchCount === 8} onClick={() => handleBatchCountChange(8)} label="8 张" />
            </ControlGroup>

            <ControlGroup title="方案模式">
              <SegmentedButton active={variantStrategy === 'style-matrix'} onClick={() => onUpdateConfig({ variantStrategy: 'style-matrix' })} label="多风格方案矩阵" />
              <SegmentedButton active={variantStrategy === 'same-style'} onClick={() => onUpdateConfig({ variantStrategy: 'same-style' })} label="同一风格多方案" />
            </ControlGroup>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold text-slate-500">风格包</p>
              <div className="mt-3 grid gap-2">
                {designVariantPacks.map(pack => (
                  <button key={pack.id} type="button" onClick={() => handlePackChange(pack.id)} className={`rounded-md border px-3 py-2 text-left ${stylePackId === pack.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'}`}>
                    <span className="block text-sm font-bold">{pack.label}</span>
                    <span className={`mt-0.5 block text-xs ${stylePackId === pack.id ? 'text-slate-200' : 'text-slate-500'}`}>{pack.description}</span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs font-semibold text-slate-500">应用风格包后，可单独调整每个方案方向。</p>
            </div>

            <label className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <span className="text-xs font-bold text-slate-500">自定义补充</span>
              <textarea value={state.config.customPrompt || ''} onChange={event => onUpdateConfig({ customPrompt: event.currentTarget.value, prompt: event.currentTarget.value })} placeholder="可选，例如：保留原始结构和相机角度，强化自然采光。" className="mt-3 h-24 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-300" />
            </label>
          </aside>

          <main className="min-w-0 space-y-4">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">当前大图预览</p>
                  <p className="mt-0.5 text-xs text-slate-500">{selectedResult?.variantName || selectedResult?.variantLabel || selectedResult?.variantStyleLabel || '等待生成方案组'}</p>
                </div>
                {previewImage ? (
                  <button type="button" onClick={() => downloadDataUrl(previewImage, `design-variant-${Date.now()}.${getDataUrlExtension(previewImage)}`)} className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">
                    <Download className="mr-1 inline h-3.5 w-3.5" />
                    下载
                  </button>
                ) : null}
              </div>
              <div className="flex h-[360px] items-center justify-center bg-slate-50">
                {previewImage ? <img src={previewImage} alt="当前方案" className="h-full w-full object-contain" /> : (
                  <div className="text-center text-sm font-bold text-slate-400">
                    <LayoutGrid className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                    方案矩阵结果区
                  </div>
                )}
              </div>
            </div>

            <div className={`grid gap-3 ${batchCount === 2 ? 'lg:grid-cols-2' : batchCount === 8 ? 'md:grid-cols-2 2xl:grid-cols-4' : 'lg:grid-cols-2'}`}>
              {resultOptions.length > 0 ? resultOptions.map((result, index) => (
                <VariantCard key={result.id} result={result} index={index} active={result.id === selectedResultId || result.isSelected} style={selectedStyles[index]} fallbackName={variantNames[index]} onSelect={() => onSelectGenerationResult(result.id)} onFavorite={() => onToggleGenerationFavorite(result.id)} onRename={name => handleResultNameChange(result, index, name)} />
              )) : Array.from({ length: batchCount }).map((_, index) => (
                <PlaceholderCard key={index} index={index} style={selectedStyles[index]} name={variantNames[index]} onNameChange={name => handleConfigNameChange(index, name)} onStyleChange={style => handleStyleChange(index, style)} />
              ))}
            </div>
          </main>
        </div>
      </div>
      {exportMode ? <DesignVariantPrintModal mode={exportMode} payload={exportPayload} onClose={() => setExportMode(null)} /> : null}
    </section>
  );
}

function PlaceholderCard({ index, style, name, onNameChange, onStyleChange }: { index: number; style: VariantStyleKey; name: string; onNameChange: (name: string) => void; onStyleChange: (style: VariantStyleKey) => void }) {
  return (
    <div className="space-y-3 rounded-lg border border-dashed border-slate-200 bg-white p-3">
      <input value={name} onChange={event => onNameChange(event.currentTarget.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-blue-300" />
      <select value={style} onChange={event => onStyleChange(event.currentTarget.value as VariantStyleKey)} className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
        {variantStyleOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
      </select>
      <div className="flex min-h-48 items-center justify-center rounded-md bg-slate-50 text-sm font-bold text-slate-300">{readVariantLabel(index)}</div>
    </div>
  );
}

function VariantCard({ result, index, active, style, fallbackName, onSelect, onFavorite, onRename }: { result: GenerationResultOption; index: number; active: boolean; style: VariantStyleKey | undefined; fallbackName: string; onSelect: () => void; onFavorite: () => void; onRename: (name: string) => void }) {
  const label = result.variantName || result.variantLabel || fallbackName || readVariantLabel(index);
  const styleLabel = result.variantStyleLabel || readVariantStyleLabel(result.variantStyle || style);
  return (
    <article className={`overflow-hidden rounded-lg border bg-white shadow-sm ${active ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'}`}>
      <button type="button" onClick={onSelect} className="block w-full text-left">
        <div className="relative h-52 bg-slate-100">
          <img src={result.imageUrl} alt={label} className="h-full w-full object-cover" />
          {result.isSelected ? <span className="absolute left-3 top-3 rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white">已设为主方案</span> : null}
        </div>
      </button>
      <div className="space-y-3 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <input value={label} onChange={event => onRename(event.currentTarget.value)} className="w-full rounded-md border border-transparent px-2 py-1 text-sm font-bold text-slate-900 outline-none hover:border-slate-200 focus:border-blue-300" />
            <p className="mt-0.5 px-2 text-xs text-slate-500">{styleLabel}</p>
          </div>
          <button type="button" onClick={onFavorite} className={`rounded-full p-1.5 ${result.isFavorite ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'}`} title="收藏">
            <Heart className={`h-4 w-4 ${result.isFavorite ? 'fill-current' : ''}`} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={onSelect} className="rounded-md bg-slate-900 px-2 py-2 text-xs font-bold text-white">{result.isSelected ? '已设为主方案' : '设为主方案'}</button>
          <button type="button" onClick={onFavorite} className="rounded-md bg-slate-100 px-2 py-2 text-xs font-bold text-slate-700">收藏</button>
          <button type="button" onClick={() => downloadDataUrl(result.imageUrl, `${label}-${Date.now()}.${getDataUrlExtension(result.imageUrl)}`)} className="rounded-md bg-slate-100 px-2 py-2 text-xs font-bold text-slate-700">下载</button>
        </div>
        <button type="button" onClick={onSelect} className="inline-flex items-center gap-1 text-xs font-bold text-blue-700"><Star className="h-3.5 w-3.5" />继续编辑</button>
      </div>
    </article>
  );
}

function DesignVariantPrintModal({ mode, payload, onClose }: { mode: 'compare' | 'report'; payload: { inputImage: UploadedImage | null; results: GenerationResultOption[]; variantNames: string[]; styles: VariantStyleKey[]; createdAt: string }; onClose: () => void }) {
  const title = mode === 'compare' ? '方案对比' : '项目方案汇报';
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4">
      <div className="mx-auto max-w-6xl rounded-xl bg-white p-5 shadow-2xl print:shadow-none">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <h3 className="text-lg font-bold text-slate-950">{title}</h3>
          <div className="flex gap-2">
            <button type="button" onClick={() => window.print()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">打印 / 保存 PDF</button>
            <button type="button" onClick={onClose} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700">关闭</button>
          </div>
        </div>
        {mode === 'compare' ? <DesignVariantCompareSheet payload={payload} /> : <DesignVariantReportPage payload={payload} />}
      </div>
    </div>
  );
}

function DesignVariantCompareSheet({ payload }: { payload: { inputImage: UploadedImage | null; results: GenerationResultOption[]; variantNames: string[]; styles: VariantStyleKey[]; createdAt: string } }) {
  return (
    <section className="print-sheet">
      <header className="mb-5 border-b border-slate-200 pb-4">
        <p className="text-2xl font-bold text-slate-950">项目方案对比</p>
        <p className="mt-1 text-sm text-slate-500">生成时间：{payload.createdAt}</p>
      </header>
      {payload.inputImage ? <img src={payload.inputImage.dataUrl || payload.inputImage.url} alt="原图" className="mb-5 h-52 w-full rounded-lg object-cover" /> : null}
      <div className={`grid gap-4 ${payload.results.length > 4 ? 'md:grid-cols-4' : 'md:grid-cols-2'}`}>
        {payload.results.map((result, index) => <PrintVariant key={result.id} result={result} name={result.variantName || payload.variantNames[index]} style={result.variantStyle || payload.styles[index]} />)}
      </div>
    </section>
  );
}

function DesignVariantReportPage({ payload }: { payload: { inputImage: UploadedImage | null; results: GenerationResultOption[]; variantNames: string[]; styles: VariantStyleKey[]; createdAt: string } }) {
  const primary = payload.results.find(result => result.isSelected) || payload.results[0];
  return (
    <section className="print-sheet space-y-6">
      <header className="rounded-xl bg-slate-950 p-8 text-white">
        <p className="text-3xl font-bold">项目方案汇报</p>
        <p className="mt-2 text-sm text-slate-300">{payload.createdAt}</p>
      </header>
      <div className="grid gap-5 md:grid-cols-2">
        {payload.inputImage ? <img src={payload.inputImage.dataUrl || payload.inputImage.url} alt="现状图" className="h-72 w-full rounded-lg object-cover" /> : null}
        {primary ? <img src={primary.imageUrl} alt="主推方案" className="h-72 w-full rounded-lg object-cover" /> : null}
      </div>
      <div>
        <h4 className="mb-3 text-lg font-bold text-slate-950">方案矩阵</h4>
        <div className={`grid gap-4 ${payload.results.length > 4 ? 'md:grid-cols-4' : 'md:grid-cols-2'}`}>
          {payload.results.map((result, index) => <PrintVariant key={result.id} result={result} name={result.variantName || payload.variantNames[index]} style={result.variantStyle || payload.styles[index]} showDescription />)}
        </div>
      </div>
    </section>
  );
}

function PrintVariant({ result, name, style, showDescription }: { result: GenerationResultOption; name: string; style: VariantStyleKey | undefined; showDescription?: boolean }) {
  return (
    <article className="break-inside-avoid overflow-hidden rounded-lg border border-slate-200">
      <img src={result.imageUrl} alt={name} className="h-52 w-full object-cover" />
      <div className="p-3">
        <p className="font-bold text-slate-950">{name}</p>
        <p className="text-xs text-slate-500">{readVariantStyleLabel(style)}</p>
        {showDescription ? <p className="mt-2 text-xs leading-5 text-slate-600">{styleDescriptionByKey[style || 'custom'] || styleDescriptionByKey.custom}</p> : null}
      </div>
    </article>
  );
}

function ControlGroup({ title, children }: { title: string; children: ReactNode }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-500">{title}</p><div className="mt-3 grid gap-2">{children}</div></div>;
}

function SegmentedButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-md px-3 py-2 text-sm font-bold ${active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{label}</button>;
}

function readBatchCount(value: GenerationConfig['batchCount']): DesignVariantBatchCount {
  return value === 2 || value === 8 ? value : 4;
}

function resolveSelectedStyles(config: GenerationConfig, batchCount: DesignVariantBatchCount): VariantStyleKey[] {
  const styles = Array.isArray(config.variantStyles) && config.variantStyles.length > 0 ? [...config.variantStyles] : getDesignVariantPack(config.stylePackId).styles;
  for (const style of defaultStylesByCount[batchCount]) {
    if (styles.length >= batchCount) break;
    if (!styles.includes(style)) styles.push(style);
  }
  return styles.slice(0, batchCount);
}

function resolveVariantNames(config: GenerationConfig, batchCount: DesignVariantBatchCount): string[] {
  const names = Array.isArray(config.variantNames) ? [...config.variantNames] : [];
  return Array.from({ length: batchCount }, (_, index) => names[index] || readVariantLabel(index));
}

function readVariantLabel(index: number): string {
  return `方案 ${String.fromCharCode(65 + index)}`;
}

function readVariantStyleLabel(style: VariantStyleKey | string | undefined): string {
  return variantStyleOptions.find(option => option.key === style)?.label || '设计方向';
}
