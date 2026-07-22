import { Download, FileText, Heart, ImagePlus, LayoutGrid, Printer, RefreshCcw, Sparkles, Star, Trash2 } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { designVariantPacks, getDesignVariantPack } from '../constants/designVariantPacks';
import { DesignVariantBatchCount, DesignVariantDiversity, DesignVariantMatrixItem, DesignVariantVariableKey, GenerationConfig, GenerationResultOption, GenerationStep, ResultSendTargetStep, SecondaryEditAction, StepState, UploadedImage, VariantChangeScope, VariantLock, VariantStyleKey } from '../types';
import { buildResultImageFilename, downloadAsset, downloadFallbackMessage } from '../utils/downloadAsset';
import { getOriginalResultAssetId, getOriginalResultImageUrl } from '../utils/resultImage';
import { PromptVoiceAssistant } from './PromptVoiceAssistant';
import { SmartPromptAssistant } from './workspace/SmartPromptAssistant';
import { ResultSendActions } from './workspace/SecondaryEditActions';
import { AspectRatioImage } from './common/AspectRatioImage';
import { GenerationImageViewer } from './common/GenerationImageViewer';
import { ResultQualityReport } from './common/ResultQualityReport';
import { DesignVariantComparison } from './design-variants/DesignVariantComparison';
import { designVariantVariableDefinitions, findSimilarDesignVariantPairs, readDesignVariantDiversity, readDesignVariantVariableLabel, resolveDesignVariantMatrix } from '../utils/designVariantMatrix';
import { normalizeStepGenerationResult, type NormalizedGenerationResult } from '../utils/normalizeGenerationResult';
import { readAssetImageUrl } from '../utils/assetUrl';
import { downloadImageFile } from '../utils/downloadImageFile';
import { GenerationResultActions } from './common/GenerationResultActions';
import { NormalizedGenerationProgress } from './common/GenerationProgress';

interface DesignVariantsPanelProps {
  state: StepState;
  resultOptions: GenerationResultOption[];
  selectedResultId: string | null;
  previewImage: string | null | undefined;
  uploadError: string | null;
  projectName?: string | null;
  onUploadInput: () => void;
  onUpdateInputImage: (image: UploadedImage | null) => void;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
  onGenerate: () => void;
  onSelectGenerationResult: (resultId: string) => void;
  onToggleGenerationFavorite: (resultId: string) => void;
  onSecondaryEditResult?: (resultId: string, action: SecondaryEditAction) => void;
  onSendResultToStep?: (resultId: string, targetStep: ResultSendTargetStep) => void;
  onRetryVariant?: (variantIndex: number) => void;
  onRenameGenerationResult: (resultId: string, variantName: string) => void;
  onDeleteGenerationResult?: (resultId: string) => void;
  canGenerate?: boolean;
  disabledReason?: string | null;
  onCancelGeneration?: () => void;
  onReset?: () => void;
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
  1: ['modern-minimal'],
  2: ['modern-minimal', 'natural-wood'],
  4: ['modern-minimal', 'cream-style', 'light-luxury', 'natural-wood'],
  8: ['modern-minimal', 'cream-style', 'wabi-sabi', 'light-luxury', 'natural-wood', 'premium-gray', 'industrial', 'hotel-lobby'],
};

const variantChangeScopeOptions: Array<{ value: VariantChangeScope; label: string }> = [
  { value: 'material-only', label: '只变材质' },
  { value: 'soft-decoration', label: '只变软装' },
  { value: 'lighting', label: '只变灯光' },
  { value: 'furniture-layout', label: '调整家具布局' },
  { value: 'color-palette', label: '调整色彩体系' },
  { value: 'full-design', label: '整体方案' },
];

const variantLockOptions: Array<{ value: VariantLock; label: string }> = [
  { value: 'structure', label: '锁定结构' },
  { value: 'camera', label: '锁定视角' },
  { value: 'walls-openings', label: '锁定门窗' },
  { value: 'fixed-furniture', label: '锁定固定家具' },
  { value: 'floor-material', label: '锁定地面' },
  { value: 'ceiling', label: '锁定天花' },
  { value: 'main-color', label: '锁定主色调' },
];

export function DesignVariantsPanel({
  state,
  resultOptions,
  selectedResultId,
  previewImage,
  uploadError,
  projectName,
  onUploadInput,
  onUpdateInputImage,
  onUpdateConfig,
  onGenerate,
  onSelectGenerationResult,
  onToggleGenerationFavorite,
  onSecondaryEditResult,
  onSendResultToStep,
  onRetryVariant,
  onRenameGenerationResult,
  onDeleteGenerationResult = () => undefined,
  canGenerate = true,
  disabledReason,
  onCancelGeneration = () => undefined,
  onReset = () => undefined,
}: DesignVariantsPanelProps) {
  const [exportMode, setExportMode] = useState<'compare' | 'report' | null>(null);
  const [compareResultIds, setCompareResultIds] = useState<string[]>([]);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [downloadAllMessage, setDownloadAllMessage] = useState<string | null>(null);
  const batchCount = readBatchCount(state.config.batchCount);
  const variantStrategy = state.config.variantStrategy || 'style-matrix';
  const stylePackId = state.config.stylePackId || 'interior-common';
  const selectedStyles = resolveSelectedStyles(state.config, batchCount);
  const variantNames = resolveVariantNames(state.config, batchCount);
  const variantChangeScope = readVariantChangeScope(state.config.variantChangeScope);
  const variantLocks = resolveVariantLocks(state.config.variantLocks);
  const variantStrategyNotes = resolveVariantStrategyNotes(state.config, batchCount);
  const variantDiversity = readDesignVariantDiversity(state.config.variantDiversity);
  const variantMatrix = useMemo(() => resolveDesignVariantMatrix(state.config, batchCount), [batchCount, state.config]);
  const activeMatrixVariables = state.config.variantMatrixVariables || designVariantVariableDefinitions.map(item => item.key);
  const lockedMatrixVariables = state.config.variantVariableLocks || [];
  const similarPairs = useMemo(() => findSimilarDesignVariantPairs(variantMatrix), [variantMatrix]);
  const selectedResult = resultOptions.find(result => result.id === selectedResultId) || resultOptions.find(result => result.isSelected) || resultOptions[0] || null;
  const sourceImageUrl = readAssetImageUrl(state.inputImage) || null;
  const normalizedResult = normalizeStepGenerationResult(state, {
    originalImageUrl: sourceImageUrl,
    originalAssetId: state.inputImage?.assetId,
    resultImageUrl: getOriginalResultImageUrl(selectedResult, previewImage),
    resultAssetId: getOriginalResultAssetId(selectedResult),
  });

  const handleBatchCountChange = (nextBatchCount: DesignVariantBatchCount) => {
    const pack = getDesignVariantPack(stylePackId);
    const patch: Partial<GenerationConfig> = {
      batchCount: nextBatchCount,
      variantStyles: resolveSelectedStyles({ ...state.config, batchCount: nextBatchCount, variantStyles: pack.styles }, nextBatchCount),
      variantNames: resolveVariantNames({ ...state.config, batchCount: nextBatchCount }, nextBatchCount),
      variantStrategyNotes: resolveVariantStrategyNotes({ ...state.config, batchCount: nextBatchCount }, nextBatchCount),
    };
    onUpdateConfig({ ...patch, variantMatrix: resolveDesignVariantMatrix({ ...state.config, ...patch, variantMatrix: undefined }, nextBatchCount) });
  };

  const handlePackChange = (nextPackId: string) => {
    const pack = getDesignVariantPack(nextPackId);
    const patch: Partial<GenerationConfig> = {
      stylePackId: pack.id,
      variantStyles: pack.styles.slice(0, batchCount),
    };
    onUpdateConfig({ ...patch, variantMatrix: resolveDesignVariantMatrix({ ...state.config, ...patch, variantMatrix: undefined }, batchCount) });
  };

  const handleStyleChange = (index: number, style: VariantStyleKey) => {
    const next = [...selectedStyles];
    next[index] = style;
    const styles = next.slice(0, batchCount);
    onUpdateConfig({ variantStyles: styles, variantMatrix: resolveDesignVariantMatrix({ ...state.config, variantStyles: styles, variantMatrix: undefined }, batchCount) });
  };

  const handleConfigNameChange = (index: number, name: string) => {
    const next = [...variantNames];
    next[index] = name;
    onUpdateConfig({ variantNames: next });
  };

  const handleVariantNoteChange = (index: number, note: string) => {
    const next = [...variantStrategyNotes];
    next[index] = note;
    onUpdateConfig({ variantStrategyNotes: next.slice(0, batchCount) });
  };

  const handleVariantLockChange = (lock: VariantLock, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...variantLocks, lock]))
      : variantLocks.filter(item => item !== lock);
    onUpdateConfig({ variantLocks: next });
  };

  const handleDiversityChange = (value: DesignVariantDiversity) => {
    const nextConfig = { ...state.config, variantDiversity: value, variantMatrix: undefined };
    onUpdateConfig({ variantDiversity: value, variantMatrix: resolveDesignVariantMatrix(nextConfig, batchCount) });
  };

  const handleMatrixVariableChange = (key: DesignVariantVariableKey, enabled: boolean) => {
    const nextVariables = enabled
      ? Array.from(new Set([...activeMatrixVariables, key]))
      : activeMatrixVariables.filter(item => item !== key);
    const nextLocks = enabled ? lockedMatrixVariables.filter(item => item !== key) : lockedMatrixVariables;
    const nextConfig = { ...state.config, variantMatrixVariables: nextVariables, variantVariableLocks: nextLocks, variantMatrix: undefined };
    onUpdateConfig({ variantMatrixVariables: nextVariables, variantVariableLocks: nextLocks, variantMatrix: resolveDesignVariantMatrix(nextConfig, batchCount) });
  };

  const handleMatrixVariableLock = (key: DesignVariantVariableKey, locked: boolean) => {
    const nextLocks = locked ? Array.from(new Set([...lockedMatrixVariables, key])) : lockedMatrixVariables.filter(item => item !== key);
    const nextVariables = locked ? activeMatrixVariables.filter(item => item !== key) : activeMatrixVariables;
    const nextConfig = { ...state.config, variantMatrixVariables: nextVariables, variantVariableLocks: nextLocks, variantMatrix: undefined };
    onUpdateConfig({ variantMatrixVariables: nextVariables, variantVariableLocks: nextLocks, variantMatrix: resolveDesignVariantMatrix(nextConfig, batchCount) });
  };

  const handleCompareToggle = (resultId: string) => {
    setCompareResultIds(current => current.includes(resultId)
      ? current.filter(id => id !== resultId)
      : [...current.slice(-1), resultId]);
  };

  const handleResultNameChange = (result: GenerationResultOption, index: number, name: string) => {
    handleConfigNameChange(index, name);
    onRenameGenerationResult(result.id, name || readVariantLabel(index));
  };

  const handleDownloadAll = async () => {
    if (isDownloadingAll || resultOptions.length === 0) return;
    setIsDownloadingAll(true);
    setDownloadAllMessage(null);
    try {
      for (let index = 0; index < resultOptions.length; index += 1) {
        const result = resultOptions[index];
        await downloadImageFile({
          imageUrl: getOriginalResultImageUrl(result, result.imageUrl),
          assetId: getOriginalResultAssetId(result),
          projectName,
          featureName: `方案变体-${readVariantLabel(index)}`,
        });
      }
      setDownloadAllMessage(`已开始保存 ${resultOptions.length} 张方案`);
    } catch (error) {
      setDownloadAllMessage(error instanceof Error ? error.message : '保存全部失败，请稍后重试。');
    } finally {
      setIsDownloadingAll(false);
    }
  };

  const exportPayload = {
    inputImage: state.inputImage,
    results: resultOptions,
    variantNames,
    styles: selectedStyles,
    matrix: variantMatrix,
    createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  };

  return (
    <section className="workspace-surface flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-4">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1920px] flex-col gap-4">
        <div className="glass-panel flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/60 px-4 py-3">
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
          </div>
        </div>

        <div className="variant-workspace grid min-h-0 min-w-0 flex-1 gap-4">
          <aside className="variant-left-panel min-h-0 space-y-4 overflow-y-auto pr-1 custom-scrollbar">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold text-slate-500">原图</p>
              {state.inputImage ? (
                <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                  <AspectRatioImage src={state.inputImage.dataUrl || state.inputImage.url} alt="原图" className="rounded-none border-0 shadow-none" />
                  <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-slate-500">
                    <span className="truncate font-semibold">{state.inputImage.name}</span>
                    <button type="button" onClick={() => onUpdateInputImage(null)} className="font-bold text-slate-700">移除</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={onUploadInput} className="mt-3 flex aspect-video w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm font-bold text-slate-500 hover:border-blue-300 hover:bg-blue-50">
                  <ImagePlus className="mb-2 h-7 w-7" />
                  上传原图
                </button>
              )}
              {uploadError ? <p className="mt-2 text-xs font-semibold text-red-600">{uploadError}</p> : null}
            </div>

            <ControlGroup title="生成数量">
              <SegmentedButton active={batchCount === 1} onClick={() => handleBatchCountChange(1)} label="1 张" />
              <SegmentedButton active={batchCount === 2} onClick={() => handleBatchCountChange(2)} label="2 张" />
              <SegmentedButton active={batchCount === 4} onClick={() => handleBatchCountChange(4)} label="4 张" />
              <SegmentedButton active={batchCount === 8} onClick={() => handleBatchCountChange(8)} label="8 张" />
            </ControlGroup>

            <ControlGroup title="方案模式">
              <SegmentedButton active={variantStrategy === 'style-matrix'} onClick={() => onUpdateConfig({ variantStrategy: 'style-matrix' })} label="多风格方案矩阵" />
              <SegmentedButton active={variantStrategy === 'same-style'} onClick={() => onUpdateConfig({ variantStrategy: 'same-style' })} label="同一风格多方案" />
            </ControlGroup>

            <ControlGroup title="多样性强度">
              <SegmentedButton active={variantDiversity === 'low'} onClick={() => handleDiversityChange('low')} label="低：相近方案" />
              <SegmentedButton active={variantDiversity === 'balanced'} onClick={() => handleDiversityChange('balanced')} label="中：平衡差异" />
              <SegmentedButton active={variantDiversity === 'high'} onClick={() => handleDiversityChange('high')} label="高：拉开方向" />
            </ControlGroup>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-slate-500">设计变量矩阵</p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-400">“变化”进入本方案差异，“锁定”要求所有方案保持稳定。</p>
                </div>
                <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">8 类变量</span>
              </div>
              <div className="mt-3 space-y-2">
                {designVariantVariableDefinitions.map(variable => {
                  const changed = activeMatrixVariables.includes(variable.key);
                  const locked = lockedMatrixVariables.includes(variable.key);
                  return (
                    <div key={variable.key} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 rounded-lg bg-slate-50 px-2 py-2">
                      <span className="truncate text-xs font-bold text-slate-700">{variable.label}</span>
                      <button type="button" onClick={() => handleMatrixVariableChange(variable.key, !changed)} className={`rounded-md px-2 py-1 text-[10px] font-black ${changed ? 'bg-blue-600 text-white' : 'bg-white text-slate-400'}`}>变化</button>
                      <button type="button" onClick={() => handleMatrixVariableLock(variable.key, !locked)} className={`rounded-md px-2 py-1 text-[10px] font-black ${locked ? 'bg-amber-500 text-white' : 'bg-white text-slate-400'}`}>锁定</button>
                    </div>
                  );
                })}
              </div>
              {similarPairs.length > 0 ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
                  相似方案提示：{similarPairs.slice(0, 3).map(pair => `方案 ${String.fromCharCode(65 + pair.leftIndex)} 与方案 ${String.fromCharCode(65 + pair.rightIndex)} 相似度 ${Math.round(pair.similarity * 100)}%`).join('；')}。可提高多样性或增加变化变量。
                </div>
              ) : null}
            </div>

            <ControlGroup title="变化范围">
              {variantChangeScopeOptions.map(option => (
                <SegmentedButton
                  key={option.value}
                  active={variantChangeScope === option.value}
                  onClick={() => onUpdateConfig({ variantChangeScope: option.value })}
                  label={option.label}
                />
              ))}
            </ControlGroup>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold text-slate-500">锁定项</p>
              <div className="mt-3 grid gap-2">
                {variantLockOptions.map(option => (
                  <label key={option.value} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                    <span>{option.label}</span>
                    <input
                      type="checkbox"
                      checked={variantLocks.includes(option.value)}
                      onChange={event => handleVariantLockChange(option.value, event.currentTarget.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900"
                    />
                  </label>
                ))}
              </div>
            </div>

            <SmartPromptAssistant
              mode="design-variants"
              config={state.config}
              compact
              fields={['buildingType', 'spaceType', 'smartMaterial', 'lighting', 'changeStrength']}
              onUpdateConfig={onUpdateConfig}
            />

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
              <span className="text-xs font-bold text-slate-500">额外补充要求</span>
              <div className="mt-3">
                <PromptVoiceAssistant
                  generationStep={GenerationStep.DesignVariants}
                  currentPrompt={state.config.customPrompt || ''}
                  context={state.config as unknown as Record<string, unknown>}
                  onApplyPrompt={prompt => onUpdateConfig({ customPrompt: prompt })}
                />
              </div>
              <textarea value={state.config.customPrompt || ''} onChange={event => onUpdateConfig({ customPrompt: event.currentTarget.value })} placeholder="可选，例如：保留原始结构和相机角度，强化自然采光。" className="mt-3 h-24 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-300" />
            </label>
          </aside>

          <main className="variant-center-panel min-h-0 min-w-0 space-y-4 overflow-y-auto pr-1 custom-scrollbar">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">当前大图预览</p>
                  <p className="mt-0.5 text-xs text-slate-500">{selectedResult?.variantName || selectedResult?.variantLabel || selectedResult?.variantStyleLabel || '等待生成方案组'}</p>
                </div>
              </div>
              <div className="bg-slate-50 p-3">
                {previewImage ? (
                  <GenerationImageViewer
                    sourceImageUrl={sourceImageUrl}
                    sourceImageAssetId={state.inputImage?.assetId}
                    resultImageUrl={previewImage}
                    resultImageAssetId={getOriginalResultAssetId(selectedResult)}
                    featureName="方案变体"
                    step={GenerationStep.DesignVariants}
                    sourceMissingMessage="暂无原图，无法对比。"
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center">
                  <div className="text-center text-sm font-bold text-slate-400">
                    <LayoutGrid className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                    方案矩阵结果区
                  </div>
                  </div>
                )}
              </div>
              {selectedResult ? (
                <div className="border-t border-slate-100 p-3">
                  <ResultQualityReport resultId={selectedResult.id} metadata={selectedResult.metadata} />
                </div>
              ) : null}
            </div>

            {resultOptions.length > 0 ? <DesignVariantComparison results={resultOptions} selectedIds={compareResultIds} onToggle={handleCompareToggle} /> : null}

            <div className={`grid gap-3 ${batchCount === 1 ? 'grid-cols-1' : batchCount === 2 ? 'lg:grid-cols-2' : batchCount === 8 ? 'md:grid-cols-2 2xl:grid-cols-4' : 'lg:grid-cols-2'}`}>
              {resultOptions.length > 0 ? resultOptions.map((result, index) => {
                const variantIndex = typeof result.variantIndex === 'number' ? result.variantIndex : index;
                return (
                  <VariantCard
                    key={result.id}
                    result={result}
                    index={variantIndex}
                    active={result.id === selectedResultId || result.isSelected}
                    style={selectedStyles[variantIndex] || selectedStyles[index]}
                    fallbackName={variantNames[variantIndex] || variantNames[index]}
                    projectName={projectName}
                    sourceImage={state.inputImage}
                    onSelect={() => onSelectGenerationResult(result.id)}
                    onFavorite={() => onToggleGenerationFavorite(result.id)}
                    onContinueEdit={() => onSecondaryEditResult?.(result.id, 'continue-edit')}
                    onSend={targetStep => onSendResultToStep?.(result.id, targetStep)}
                    onOpenReport={() => setExportMode('report')}
                    onRetry={() => onRetryVariant?.(variantIndex)}
                    onRename={name => handleResultNameChange(result, variantIndex, name)}
                    onDelete={() => onDeleteGenerationResult(result.id)}
                  />
                );
              }) : Array.from({ length: batchCount }).map((_, index) => (
                <PlaceholderCard key={index} index={index} style={selectedStyles[index]} name={variantNames[index]} note={variantStrategyNotes[index] || ''} matrixItem={variantMatrix[index]} onNameChange={name => handleConfigNameChange(index, name)} onStyleChange={style => handleStyleChange(index, style)} onNoteChange={note => handleVariantNoteChange(index, note)} />
              ))}
            </div>
          </main>

          <aside className="variant-right-panel min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="variant-right-panel-content min-h-0 flex-1 space-y-4 overflow-y-auto p-4 custom-scrollbar">
              <div>
                <p className="text-sm font-black text-slate-900">生成任务</p>
                <p className="mt-1 text-xs text-slate-500">确认本轮输出并提交方案矩阵。</p>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
                <SummaryItem label="方案数量" value={`${batchCount} 张`} />
                <SummaryItem label="方案模式" value={variantStrategy === 'style-matrix' ? '多风格矩阵' : '同风格变化'} />
                <SummaryItem label="预计算力点" value={`${batchCount} 点`} />
                <SummaryItem label="输出比例" value={state.config.targetAspectRatio || state.config.aspectRatio || '16:9'} />
                <SummaryItem label="输出尺寸" value={state.config.apiyiImageSize || '1K'} />
                <SummaryItem label="当前项目" value={projectName || '未命名项目'} />
              </div>
              <NormalizedGenerationProgress result={normalizedResult} />
              <GenerationResultActions result={normalizedResult} featureName="方案变体" projectName={projectName} />
              {!state.inputImage ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">请先上传原图。</p> : null}
              {disabledReason && !canGenerate && !state.isGenerating ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">{disabledReason}</p> : null}
              {state.generationError ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold leading-5 text-rose-700">{state.generationError}</p> : null}
              {downloadAllMessage ? <p className="text-xs font-semibold text-slate-600">{downloadAllMessage}</p> : null}
            </div>
            <div className="variant-right-panel-footer space-y-2 border-t border-slate-200 bg-white p-4">
              <button type="button" onClick={onGenerate} disabled={!canGenerate} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45">
                <Sparkles className={`h-4 w-4 ${state.isGenerating ? 'animate-pulse' : ''}`} />
                {state.isGenerating ? `正在生成 ${batchCount} 个方案` : resultOptions.length ? '重新生成方案组' : '生成方案组'}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => void handleDownloadAll()} disabled={resultOptions.length === 0 || isDownloadingAll} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 disabled:opacity-40"><Download className="h-4 w-4" />{isDownloadingAll ? '保存中' : '保存全部'}</button>
                {state.isGenerating && state.generationJobId ? <button type="button" onClick={onCancelGeneration} className="h-10 rounded-lg bg-rose-50 text-xs font-bold text-rose-700">取消任务</button> : <button type="button" onClick={onReset} disabled={state.isGenerating} className="h-10 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 disabled:opacity-40">重置</button>}
              </div>
            </div>
          </aside>
        </div>
      </div>
      {exportMode ? <DesignVariantPrintModal mode={exportMode} payload={exportPayload} onClose={() => setExportMode(null)} /> : null}
    </section>
  );
}

function PlaceholderCard({ index, style, name, note, matrixItem, onNameChange, onStyleChange, onNoteChange }: { index: number; style: VariantStyleKey; name: string; note: string; matrixItem: DesignVariantMatrixItem; onNameChange: (name: string) => void; onStyleChange: (style: VariantStyleKey) => void; onNoteChange: (note: string) => void }) {
  return (
    <div className="flex h-full flex-col space-y-3 rounded-xl border border-dashed border-slate-200 bg-white p-3">
      <input value={name} onChange={event => onNameChange(event.currentTarget.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-blue-300" />
      <select value={style} onChange={event => onStyleChange(event.currentTarget.value as VariantStyleKey)} className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
        {variantStyleOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
      </select>
      <textarea
        value={note}
        onChange={event => onNoteChange(event.currentTarget.value)}
        maxLength={200}
        placeholder="方案备注，例如：更暖的木色、增强展示墙、减少金属感"
        className="h-20 w-full resize-none rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 outline-none focus:border-blue-300"
      />
      <div className="rounded-lg bg-blue-50 px-3 py-2 text-[11px] leading-5 text-slate-600">
        <p><span className="font-black text-blue-800">改变变量：</span>{matrixItem.changedVariables.map(readDesignVariantVariableLabel).join('、') || '无'}</p>
        <p><span className="font-black text-amber-700">锁定变量：</span>{matrixItem.lockedVariables.map(readDesignVariantVariableLabel).join('、') || '无'}</p>
        <p className="mt-1 text-slate-500">{matrixItem.differenceSummary}</p>
      </div>
      <div className="flex aspect-video items-center justify-center rounded-xl bg-slate-50 text-sm font-bold text-slate-300">{readVariantLabel(index)}</div>
    </div>
  );
}

function readMetadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readMetadataVariableKeys(metadata: Record<string, unknown> | undefined, key: string): DesignVariantVariableKey[] {
  const value = metadata?.[key];
  if (!Array.isArray(value)) return [];
  const allowed = new Set(designVariantVariableDefinitions.map(item => item.key));
  return value.filter((item): item is DesignVariantVariableKey => typeof item === 'string' && allowed.has(item as DesignVariantVariableKey));
}

function VariantCard({ result, index, active, style, fallbackName, projectName, sourceImage, onSelect, onFavorite, onContinueEdit, onSend, onOpenReport, onRetry, onRename, onDelete }: { result: GenerationResultOption; index: number; active: boolean; style: VariantStyleKey | undefined; fallbackName: string; projectName?: string | null; sourceImage: UploadedImage | null; onSelect: () => void; onFavorite: () => void; onContinueEdit: () => void; onSend?: (targetStep: ResultSendTargetStep) => void; onOpenReport: () => void; onRetry?: () => void; onRename: (name: string) => void; onDelete: () => void }) {
  const label = result.variantName || result.variantLabel || fallbackName || readVariantLabel(index);
  const styleLabel = result.variantStyleLabel || readVariantStyleLabel(result.variantStyle || style);
  const designDirection = result.designDirection || readMetadataString(result.metadata, 'designDirection') || styleLabel;
  const changeScopeLabel = result.changeScopeLabel || readMetadataString(result.metadata, 'changeScopeLabel');
  const lockedItemsLabel = result.lockedItemsLabel || readMetadataString(result.metadata, 'lockedItemsLabel');
  const strategyNote = result.strategyNote || readMetadataString(result.metadata, 'strategyNote');
  const designDescription = result.designDescription || readMetadataString(result.metadata, 'designDescription') || buildVariantDesignDescription({
    index,
    name: label,
    styleLabel,
    changeScopeLabel,
    lockedItemsLabel,
    strategyNote,
  });
  const changedVariables = result.changedVariables || readMetadataVariableKeys(result.metadata, 'changedVariables');
  const lockedVariables = result.lockedVariables || readMetadataVariableKeys(result.metadata, 'lockedVariables');
  const differenceSummary = result.differenceSummary || readMetadataString(result.metadata, 'differenceSummary');
  const reportNarrative = result.reportNarrative || readMetadataString(result.metadata, 'reportNarrative');
  const parentResultId = result.parentResultId || readMetadataString(result.metadata, 'parentResultId');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const originalImageUrl = getOriginalResultImageUrl(result, result.imageUrl);
  const originalAssetId = getOriginalResultAssetId(result);
  const sourceImageUrl = readAssetImageUrl(sourceImage) || null;
  const cardResult: NormalizedGenerationResult = {
    originalImageUrl: sourceImageUrl,
    originalAssetId: sourceImage?.assetId || null,
    resultImageUrl: originalImageUrl || result.imageUrl || null,
    resultAssetId: originalAssetId || null,
    taskId: result.jobId || null,
    status: 'completed',
    progress: 100,
    progressLabel: '生成完成',
    errorMessage: null,
  };

  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    setDownloadMessage(null);
    setDownloadError(null);
    try {
      await downloadAsset({
        url: originalImageUrl,
        assetId: originalAssetId,
      }, buildResultImageFilename({
        projectName,
        featureLabel: '方案变体',
      }));
      setDownloadMessage('已开始下载');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setDownloadError(message === downloadFallbackMessage ? downloadFallbackMessage : '下载失败，请稍后重试');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <article className={`flex h-full flex-col overflow-hidden rounded-xl border bg-white shadow-sm ${active ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'}`}>
      <div className="block w-full text-left">
        <div className="relative bg-slate-100">
          <GenerationImageViewer
            sourceImageUrl={sourceImageUrl}
            sourceImageAssetId={sourceImage?.assetId}
            resultImageUrl={originalImageUrl || result.imageUrl}
            resultImageAssetId={originalAssetId}
            featureName="方案变体"
            step={GenerationStep.DesignVariants}
            frameClassName="rounded-none border-0 shadow-none"
            tabListClassName="m-2 mb-2"
            sourceMissingMessage="暂无原图，无法对比。"
            showTabs={false}
          />
          {result.isSelected ? <span className="absolute left-3 top-3 rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white">已设为主方案</span> : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col space-y-3 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <input value={label} onChange={event => onRename(event.currentTarget.value)} className="w-full rounded-md border border-transparent px-2 py-1 text-sm font-bold text-slate-900 outline-none hover:border-slate-200 focus:border-blue-300" />
            <p className="mt-0.5 px-2 text-xs text-slate-500">{designDirection}</p>
          </div>
          <button type="button" onClick={onFavorite} className={`rounded-full p-1.5 ${result.isFavorite ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'}`} title="收藏">
            <Heart className={`h-4 w-4 ${result.isFavorite ? 'fill-current' : ''}`} />
          </button>
        </div>
        {(changeScopeLabel || lockedItemsLabel || strategyNote) ? (
          <div className="space-y-1 rounded-md bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600">
            {changeScopeLabel ? <p><span className="font-bold text-slate-800">变化范围：</span>{changeScopeLabel}</p> : null}
            {lockedItemsLabel ? <p><span className="font-bold text-slate-800">锁定项：</span>{lockedItemsLabel}</p> : null}
            {strategyNote ? <p><span className="font-bold text-slate-800">备注：</span>{strategyNote}</p> : null}
          </div>
        ) : null}
        <p className="rounded-md border border-slate-100 bg-white px-3 py-2 text-xs leading-5 text-slate-600">
          <span className="font-bold text-slate-800">方案说明：</span>{designDescription}
        </p>
        {(changedVariables.length > 0 || lockedVariables.length > 0 || differenceSummary) ? (
          <div className="rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2 text-[11px] leading-5 text-slate-600">
            {changedVariables.length > 0 ? <p><span className="font-bold text-blue-800">改变变量：</span>{changedVariables.map(readDesignVariantVariableLabel).join('、')}</p> : null}
            {lockedVariables.length > 0 ? <p><span className="font-bold text-amber-700">锁定变量：</span>{lockedVariables.map(readDesignVariantVariableLabel).join('、')}</p> : null}
            {differenceSummary ? <p><span className="font-bold text-slate-800">与原图差异：</span>{differenceSummary}</p> : null}
            {parentResultId ? <p><span className="font-bold text-slate-800">版本关系：</span>源自结果 {parentResultId.slice(0, 8)}</p> : null}
          </div>
        ) : null}
        {reportNarrative ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-[11px] leading-5 text-emerald-800"><span className="font-black">汇报说明：</span>{reportNarrative}</p> : null}
        <div className="action-row mt-auto">
          <button type="button" onClick={onSelect} className="rounded-md bg-slate-900 px-2 py-2 text-xs font-bold text-white">{result.isSelected ? '已设为主方案' : '设为主方案'}</button>
          <button type="button" onClick={onFavorite} className="rounded-md bg-slate-100 px-2 py-2 text-xs font-bold text-slate-700">收藏</button>
          <button type="button" onClick={onDelete} className="inline-flex items-center justify-center gap-1 rounded-md bg-rose-50 px-2 py-2 text-xs font-bold text-rose-700"><Trash2 className="h-3.5 w-3.5" />删除</button>
        </div>
        <GenerationResultActions result={cardResult} featureName={`方案变体-${label}`} projectName={projectName} compact />
        {downloadMessage ? <p className="text-xs font-semibold text-emerald-700">{downloadMessage}</p> : null}
        {downloadError ? <p className="text-xs font-semibold text-amber-700">{downloadError}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onContinueEdit} className="inline-flex items-center gap-1 text-xs font-bold text-blue-700"><Star className="h-3.5 w-3.5" />继续编辑</button>
          {onRetry ? (
            <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 text-xs font-bold text-slate-700">
              <RefreshCcw className="h-3.5 w-3.5" />
              重试此方案
            </button>
          ) : null}
        </div>
        {onSend ? (
          <div className="rounded-md bg-slate-50 p-2">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">发送到其他功能</p>
            <ResultSendActions
              resultId={result.id}
              currentStep={GenerationStep.DesignVariants}
              onSend={(_, targetStep) => onSend(targetStep)}
              onSecondaryAction={() => onContinueEdit()}
              onUtilityAction={action => {
                if (action === 'pdf') onOpenReport();
                if (action === 'download') void handleDownload();
              }}
              compact
            />
          </div>
        ) : null}
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
      {payload.inputImage ? <AspectRatioImage src={payload.inputImage.dataUrl || payload.inputImage.url} alt="原图" className="mb-5" /> : null}
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
        {payload.inputImage ? <AspectRatioImage src={payload.inputImage.dataUrl || payload.inputImage.url} alt="现状图" /> : null}
        {primary ? <AspectRatioImage src={primary.imageUrl} alt="主推方案" /> : null}
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
  const changeScopeLabel = result.changeScopeLabel || readMetadataString(result.metadata, 'changeScopeLabel');
  const lockedItemsLabel = result.lockedItemsLabel || readMetadataString(result.metadata, 'lockedItemsLabel');
  const strategyNote = result.strategyNote || readMetadataString(result.metadata, 'strategyNote');
  const differenceSummary = result.differenceSummary || readMetadataString(result.metadata, 'differenceSummary');
  const reportNarrative = result.reportNarrative || readMetadataString(result.metadata, 'reportNarrative');
  return (
    <article className="break-inside-avoid overflow-hidden rounded-lg border border-slate-200">
      <AspectRatioImage src={result.imageUrl} alt={name} className="rounded-none border-0 shadow-none" />
      <div className="p-3">
        <p className="font-bold text-slate-950">{name}</p>
        <p className="text-xs text-slate-500">{readVariantStyleLabel(style)}</p>
        {changeScopeLabel ? <p className="mt-2 text-xs leading-5 text-slate-600">变化范围：{changeScopeLabel}</p> : null}
        {lockedItemsLabel ? <p className="text-xs leading-5 text-slate-600">锁定项：{lockedItemsLabel}</p> : null}
        {strategyNote ? <p className="text-xs leading-5 text-slate-600">备注：{strategyNote}</p> : null}
        {differenceSummary ? <p className="text-xs leading-5 text-slate-600">与原图差异：{differenceSummary}</p> : null}
        {showDescription ? <p className="mt-2 text-xs leading-5 text-slate-600">{reportNarrative || result.designDescription || readMetadataString(result.metadata, 'designDescription') || styleDescriptionByKey[style || 'custom'] || styleDescriptionByKey.custom}</p> : null}
      </div>
    </article>
  );
}

function buildVariantDesignDescription({
  index,
  name,
  styleLabel,
  changeScopeLabel,
  lockedItemsLabel,
  strategyNote,
}: {
  index: number;
  name: string;
  styleLabel: string;
  changeScopeLabel?: string;
  lockedItemsLabel?: string;
  strategyNote?: string;
}): string {
  const emphasis = [
    '强调空间秩序、材质层次和整体完成度。',
    '更关注软装氛围、色彩平衡和可落地的生活感。',
    '突出视觉焦点、灯光节奏和方案辨识度。',
    '在保留基础结构的前提下提升展示感和设计记忆点。',
    '通过细节收口、材质对比和局部陈设形成差异化表达。',
    '侧重动线清晰、功能舒适和画面整体协调。',
    '加强主次关系、明暗层次和空间品质感。',
    '以更完整的设计语言组织家具、材质和光影关系。',
  ][Math.max(0, index) % 8];
  const scopeText = changeScopeLabel ? `变化范围控制在“${changeScopeLabel}”内` : '变化范围保持为整体方案优化';
  const lockText = lockedItemsLabel ? `，同时保持${lockedItemsLabel}不被破坏` : '，同时保持关键结构和视角稳定';
  const noteText = strategyNote ? `；备注方向：${strategyNote}` : '';
  return `${name}采用${styleLabel}方向，${scopeText}${lockText}。${emphasis}${noteText}`;
}

function ControlGroup({ title, children }: { title: string; children: ReactNode }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-500">{title}</p><div className="mt-3 grid gap-2">{children}</div></div>;
}

function SegmentedButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-md px-3 py-2 text-sm font-bold ${active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{label}</button>;
}

function readBatchCount(value: GenerationConfig['batchCount']): DesignVariantBatchCount {
  return value === 2 || value === 4 || value === 8 ? value : 1;
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

function resolveVariantStrategyNotes(config: GenerationConfig, batchCount: DesignVariantBatchCount): string[] {
  const notes = Array.isArray(config.variantStrategyNotes) ? [...config.variantStrategyNotes] : [];
  return Array.from({ length: batchCount }, (_, index) => notes[index] || '');
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-[10px] font-bold text-slate-400">{label}</p><p className="mt-1 truncate font-black text-slate-800" title={value}>{value}</p></div>;
}

function readVariantChangeScope(value: GenerationConfig['variantChangeScope']): VariantChangeScope {
  return variantChangeScopeOptions.some(option => option.value === value) ? value : 'full-design';
}

function resolveVariantLocks(value: GenerationConfig['variantLocks']): VariantLock[] {
  const locks = Array.isArray(value) ? value : ['structure', 'camera', 'walls-openings'];
  return locks.filter((lock): lock is VariantLock => variantLockOptions.some(option => option.value === lock));
}

function readVariantLabel(index: number): string {
  return `方案 ${String.fromCharCode(65 + index)}`;
}

function readVariantStyleLabel(style: VariantStyleKey | string | undefined): string {
  return variantStyleOptions.find(option => option.key === style)?.label || '设计方向';
}
