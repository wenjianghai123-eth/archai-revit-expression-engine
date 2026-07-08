import { ArrowRight, ImagePlus, Map, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  findPlanColorizeStyle,
  maxPlanColorizeBatchCount,
  planColorizeStyleOptions,
  resolvePlanColorizeStyles,
  type PlanColorizeStyleOption,
} from '../constants/planColorizeStyles';
import { GenerationConfig, GenerationStep, PlanDrawingType, PlanExpressionTemplate, StepState, UploadedImage } from '../types';
import { PromptVoiceAssistant } from './PromptVoiceAssistant';
import { SmartPromptAssistant } from './workspace/SmartPromptAssistant';
import { AspectRatioImage } from './common/AspectRatioImage';

interface PlanColorizePanelProps {
  state: StepState;
  previewImage: string | null | undefined;
  uploadError: string | null;
  onUploadInput: () => void;
  onUpdateInputImage: (image: UploadedImage | null) => void;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
  onGenerate: () => void;
}

const drawingTypes: Array<{ value: PlanDrawingType; label: string }> = [
  { value: 'residential', label: '住宅平面' },
  { value: 'commercial', label: '商业平面' },
  { value: 'office', label: '办公平面' },
  { value: 'hotel', label: '酒店/民宿' },
  { value: 'landscape', label: '景观平面' },
  { value: 'site-plan', label: '总图/场地' },
  { value: 'custom', label: '自定义' },
];

const templates: Array<{ value: PlanExpressionTemplate; label: string }> = [
  { value: 'zoning-color', label: '功能分区上色' },
  { value: 'colored-plan', label: '彩色平面图' },
  { value: 'landscape-plan', label: '景观彩平' },
  { value: 'furniture-enhance', label: '家具增强' },
  { value: 'annotation-plan', label: '标注说明图' },
  { value: 'circulation-analysis', label: '动线分析图' },
];

const enhancementOptions: Array<{ key: keyof GenerationConfig; label: string }> = [
  { key: 'enableZoningColor', label: '功能分区上色' },
  { key: 'enableRoomLabels', label: '房间名称标注' },
  { key: 'enableFurnitureEnhance', label: '家具识别与增强' },
  { key: 'enableCirculationArrows', label: '动线箭头' },
  { key: 'enableScaleEnhance', label: '尺度感增强' },
  { key: 'enableLandscapeFill', label: '景观/铺装/绿化填充' },
  { key: 'preserveLinework', label: '保留原始线稿' },
];

export function PlanColorizePanel({
  state,
  previewImage,
  uploadError,
  onUploadInput,
  onUpdateInputImage,
  onUpdateConfig,
  onGenerate,
}: PlanColorizePanelProps) {
  const sourceImage = state.inputImage?.previewUrl || state.inputImage?.publicUrl || state.inputImage?.url || state.inputImage?.thumbnailUrl || state.inputImage?.dataUrl;
  const batchEnabled = state.config.planColorizeBatchEnabled === true;
  const selectedStyleIds = readPlanColorizeStyleIds(state.config);
  const activeStyles = batchEnabled
    ? resolvePlanColorizeStyles(selectedStyleIds, state.config.selectedStyleId)
    : resolvePlanColorizeStyles(state.config.selectedStyleId || selectedStyleIds[0]);
  const outputCount = batchEnabled ? Math.min(Math.max(selectedStyleIds.length || 1, 1), maxPlanColorizeBatchCount) : 1;
  const generateButtonLabel = outputCount > 1 ? `批量生成 ${outputCount} 张彩平` : '生成彩平';

  const applySingleStyle = (style: PlanColorizeStyleOption) => {
    onUpdateConfig({
      planColorizeBatchEnabled: false,
      planColorizeStyleIds: [style.id],
      planColorizeStyleNames: [style.name],
      planColorizeStylePromptHints: [style.promptHint],
      selectedStyleId: style.id,
      selectedStyleName: style.name,
      selectedStylePromptHint: style.promptHint,
      batchCount: 1,
    });
  };

  const toggleBatchStyle = (style: PlanColorizeStyleOption) => {
    const exists = selectedStyleIds.includes(style.id);
    const nextIds = exists
      ? selectedStyleIds.filter(id => id !== style.id)
      : [...selectedStyleIds, style.id].slice(0, maxPlanColorizeBatchCount);
    const nextStyles = nextIds
      .map(id => findPlanColorizeStyle(id))
      .filter((item): item is PlanColorizeStyleOption => Boolean(item));
    const primaryStyle = nextStyles[0] || activeStyles[0] || planColorizeStyleOptions[0];

    onUpdateConfig({
      planColorizeBatchEnabled: true,
      planColorizeStyleIds: nextIds,
      planColorizeStyleNames: nextStyles.map(item => item.name),
      planColorizeStylePromptHints: nextStyles.map(item => item.promptHint),
      selectedStyleId: primaryStyle.id,
      selectedStyleName: primaryStyle.name,
      selectedStylePromptHint: primaryStyle.promptHint,
      batchCount: Math.min(Math.max(nextIds.length || 1, 1), maxPlanColorizeBatchCount) as GenerationConfig['batchCount'],
    });
  };

  const switchBatchMode = (enabled: boolean) => {
    const firstStyle = activeStyles[0] || planColorizeStyleOptions[0];
    if (!enabled) {
      applySingleStyle(firstStyle);
      return;
    }
    const nextStyles = selectedStyleIds.length > 0 ? activeStyles : [firstStyle];
    onUpdateConfig({
      planColorizeBatchEnabled: true,
      planColorizeStyleIds: nextStyles.map(style => style.id),
      planColorizeStyleNames: nextStyles.map(style => style.name),
      planColorizeStylePromptHints: nextStyles.map(style => style.promptHint),
      selectedStyleId: firstStyle.id,
      selectedStyleName: firstStyle.name,
      selectedStylePromptHint: firstStyle.promptHint,
      batchCount: Math.min(Math.max(nextStyles.length || 1, 1), maxPlanColorizeBatchCount) as GenerationConfig['batchCount'],
    });
  };

  return (
    <section className="workspace-surface min-w-0 flex-1 overflow-y-auto p-4 custom-scrollbar">
      <div className="mx-auto grid max-w-7xl gap-4 xl:grid-cols-[340px_1fr]">
        <aside className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
                <Map className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">图纸智能表达</h2>
                <p className="text-xs text-slate-500">上传 CAD 导出的黑白平面图，生成彩色分区、标注和表达图</p>
              </div>
            </div>

            {state.inputImage ? (
              <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                <AspectRatioImage src={sourceImage} alt="原始图纸" className="rounded-none border-0 shadow-none" />
                <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-slate-500">
                  <span className="truncate font-semibold">{state.inputImage.name}</span>
                  <button type="button" onClick={() => onUpdateInputImage(null)} className="font-bold text-slate-700">
                    移除
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={onUploadInput}
                className="mt-4 flex aspect-video w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm font-bold text-slate-500 hover:border-blue-300 hover:bg-blue-50"
              >
                <ImagePlus className="mb-2 h-7 w-7" />
                上传平面图
              </button>
            )}
            {uploadError ? <p className="mt-2 text-xs font-semibold text-red-600">{uploadError}</p> : null}
          </div>

          <OptionGroup title="图纸类型">
            <select
              value={state.config.drawingType || 'residential'}
              onChange={event => onUpdateConfig({ drawingType: event.currentTarget.value as PlanDrawingType })}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-blue-300"
            >
              {drawingTypes.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </OptionGroup>

          <OptionGroup title="表达模板">
            <div className="grid gap-2">
              {templates.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onUpdateConfig({ template: option.value })}
                  className={`rounded-lg px-3 py-2 text-left text-sm font-bold ${
                    state.config.template === option.value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </OptionGroup>

          <OptionGroup title="彩平风格">
            <div className="mb-3 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-xs font-bold text-slate-600">
              <button
                type="button"
                onClick={() => switchBatchMode(false)}
                className={`rounded-md px-3 py-2 ${!batchEnabled ? 'bg-white text-slate-950 shadow-sm' : 'hover:text-slate-900'}`}
              >
                单选模式
              </button>
              <button
                type="button"
                onClick={() => switchBatchMode(true)}
                className={`rounded-md px-3 py-2 ${batchEnabled ? 'bg-white text-slate-950 shadow-sm' : 'hover:text-slate-900'}`}
              >
                多选模式
              </button>
            </div>

            <div className="grid gap-2">
              {planColorizeStyleOptions.map(style => {
                const checked = batchEnabled
                  ? selectedStyleIds.includes(style.id)
                  : activeStyles[0]?.id === style.id;
                const disabled = batchEnabled && !checked && selectedStyleIds.length >= maxPlanColorizeBatchCount;
                return (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => (batchEnabled ? toggleBatchStyle(style) : applySingleStyle(style))}
                    disabled={disabled}
                    className={`rounded-lg border px-3 py-2 text-left transition ${
                      checked
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold">{style.name}</span>
                      {batchEnabled ? (
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-white bg-white text-slate-900' : 'border-slate-300 bg-white'}`}>
                          {checked ? <span className="h-2 w-2 rounded-sm bg-slate-900" /> : null}
                        </span>
                      ) : null}
                    </div>
                    <p className={`mt-1 text-xs leading-5 ${checked ? 'text-slate-200' : 'text-slate-500'}`}>{style.description}</p>
                  </button>
                );
              })}
            </div>

          </OptionGroup>

          <SmartPromptAssistant mode="plan-colorize" config={state.config} compact onUpdateConfig={onUpdateConfig} />

          <OptionGroup title="增强项">
            <div className="space-y-2">
              {enhancementOptions.map(option => (
                <label key={option.key} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                  <span>{option.label}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(state.config[option.key])}
                    onChange={event => onUpdateConfig({ [option.key]: event.currentTarget.checked })}
                    className="h-4 w-4 accent-slate-900"
                  />
                </label>
              ))}
            </div>
          </OptionGroup>

          <label className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <span className="text-xs font-bold text-slate-500">额外补充要求</span>
            <div className="mt-3">
              <PromptVoiceAssistant
                generationStep={GenerationStep.PlanColorize}
                currentPrompt={state.config.customPrompt || ''}
                context={state.config as unknown as Record<string, unknown>}
                onApplyPrompt={prompt => onUpdateConfig({ customPrompt: prompt })}
              />
            </div>
            <textarea
              value={state.config.customPrompt || ''}
              onChange={event => onUpdateConfig({ customPrompt: event.currentTarget.value })}
              placeholder="可补充房间名称、功能分区、动线或表达偏好；不填写也可以生成。"
              className="mt-3 h-24 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-300"
            />
          </label>

          <button
            type="button"
            onClick={onGenerate}
            disabled={!state.inputImage || state.isGenerating}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {generateButtonLabel}
          </button>
        </aside>

        <main className="grid min-w-0 content-start gap-4 2xl:grid-cols-2">
          <PreviewCard title="原始图纸" image={sourceImage} empty="请先上传或选择一张平面图" />
          <PreviewCard title="表达结果" image={previewImage || undefined} empty="生成后在这里查看彩色表达图" />
        </main>
      </div>
    </section>
  );
}

function OptionGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-3 text-xs font-bold text-slate-500">{title}</p>
      {children}
    </div>
  );
}

function readPlanColorizeStyleIds(config: GenerationConfig): string[] {
  if (Array.isArray(config.planColorizeStyleIds)) {
    return config.planColorizeStyleIds.filter(id => typeof id === 'string' && id.trim().length > 0);
  }
  return typeof config.selectedStyleId === 'string' && config.selectedStyleId.trim().length > 0
    ? [config.selectedStyleId]
    : [];
}

function PreviewCard({ title, image, empty }: { title: string; image?: string | null; empty: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-bold text-slate-900">{title}</p>
        <ArrowRight className="h-4 w-4 text-slate-300" />
      </div>
      <div className="p-3">
        <AspectRatioImage src={image} alt={title} placeholder={empty} />
      </div>
    </div>
  );
}
