import { ArrowRight, ImagePlus, Map, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { GenerationConfig, PlanDrawingType, PlanExpressionTemplate, StepState, UploadedImage } from '../types';
import { SmartPromptAssistant } from './workspace/SmartPromptAssistant';

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
  const sourceImage = state.inputImage?.dataUrl || state.inputImage?.url;

  return (
    <section className="min-w-0 flex-1 overflow-y-auto bg-slate-100 p-4 custom-scrollbar">
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
                <img src={sourceImage} alt="原始图纸" className="h-44 w-full object-cover" />
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
                className="mt-4 flex h-44 w-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm font-bold text-slate-500 hover:border-blue-300 hover:bg-blue-50"
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
            生成图纸表达
          </button>
        </aside>

        <main className="min-h-[560px] space-y-6">
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

function PreviewCard({ title, image, empty }: { title: string; image?: string | null; empty: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-bold text-slate-900">{title}</p>
        <ArrowRight className="h-4 w-4 text-slate-300" />
      </div>
      <div className="flex min-h-[520px] items-center justify-center bg-slate-50 p-4">
        {image ? <img src={image} alt={title} className="max-h-[760px] w-full max-w-full object-contain" /> : <p className="px-6 text-center text-sm font-bold text-slate-400">{empty}</p>}
      </div>
    </div>
  );
}
