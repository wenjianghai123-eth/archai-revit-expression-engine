import { BookOpen } from 'lucide-react';
import { GenerationConfig, GenerationStep } from '../../types';
import { isLocalInpaintingStep } from './workspaceUtils';

interface PromptConfigPanelProps {
  step: GenerationStep;
  config: GenerationConfig;
  isFloorplanStep: boolean;
  compactInpaint?: boolean;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
  onOpenPromptTemplatePanel: () => void;
}

export function PromptConfigPanel({
  step,
  config,
  isFloorplanStep,
  compactInpaint = false,
  onUpdateConfig,
  onOpenPromptTemplatePanel,
}: PromptConfigPanelProps) {
  return (
    <>
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          {isFloorplanStep ? '额外补充说明' : isLocalInpaintingStep(step) ? '修改说明' : '提示词'}
        </label>
        {isFloorplanStep ? (
          <p className="text-[11px] leading-5 text-slate-400">系统已内置专业彩平生成提示词，你只需要补充特殊要求。</p>
        ) : null}
        <button type="button" onClick={onOpenPromptTemplatePanel} className="inline-flex w-fit items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 hover:border-blue-200 hover:text-blue-700">
          <BookOpen className="h-3.5 w-3.5" />
          提示词模板
        </button>
        <textarea
          value={config.prompt}
          onChange={event => onUpdateConfig({ prompt: event.target.value })}
          className={`${compactInpaint ? 'h-36' : 'h-28'} w-full resize-none rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs leading-5 text-blue-950 outline-none focus:border-blue-300`}
          placeholder={isFloorplanStep
            ? '可选：补充色彩、材质、表达风格、重点区域等要求。例如：强化景观铺装层次，住宅区域使用暖色系。'
            : isLocalInpaintingStep(step)
              ? '描述希望修改的内容，例如：将地板替换为上传的材质贴图、优化灯光、替换墙面材质……'
              : '描述希望生成或局部重绘的效果...'}
        />
        {isLocalInpaintingStep(step) ? (
          <p className="text-[11px] leading-5 text-slate-400">不涂抹也可以直接根据提示词进行全局或智能局部修改；涂抹后可更精确地限制修改区域。</p>
        ) : null}
      </div>

      <QualityModeControls config={config} onUpdateConfig={onUpdateConfig} />

      {step === GenerationStep.LocalInpainting ? (
        <InpaintConfigControls config={config} onUpdateConfig={onUpdateConfig} />
      ) : null}
    </>
  );
}

interface QualityModeControlsProps {
  config: GenerationConfig;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
}

function QualityModeControls({ config, onUpdateConfig }: QualityModeControlsProps) {
  const value = config.qualityMode || 'balanced';
  const options = [
    { value: 'fast', label: '快速' },
    { value: 'balanced', label: '均衡' },
    { value: 'high', label: '高质' },
  ] as const;

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">质量模式</label>
      <div className="grid grid-cols-3 gap-2">
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            onClick={() => onUpdateConfig({ qualityMode: option.value })}
            className={`rounded-lg border px-3 py-2 text-[10px] font-bold ${
              value === option.value
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface InpaintConfigControlsProps {
  config: GenerationConfig;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
}

function InpaintConfigControls({ config, onUpdateConfig }: InpaintConfigControlsProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">重绘强度</label>
        <div className="grid grid-cols-3 gap-2">
          {(['weak', 'medium', 'strong'] as const).map(value => (
            <button
              key={value}
              type="button"
              onClick={() => onUpdateConfig({ inpaintingStrength: value, strength: value })}
              className={`rounded-lg border px-3 py-2 text-[10px] font-bold ${
                (config.strength || config.inpaintingStrength) === value
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-500'
              }`}
            >
              {value === 'weak' ? '弱' : value === 'medium' ? '中' : '强'}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={Boolean(config.preserveStructure ?? config.keepOriginalMaterial)}
          onChange={event => onUpdateConfig({ preserveStructure: event.target.checked, keepOriginalMaterial: event.target.checked })}
          className="mt-0.5 h-4 w-4 accent-blue-600"
        />
        <span>
          <span className="block font-bold text-slate-800">保持结构</span>
          <span className="mt-1 block leading-5">尽量保持未选区域、透视和空间结构不变。</span>
        </span>
      </label>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400">
          <span>羽化</span>
          <span>{config.feather ?? 0}px</span>
        </div>
        <input
          type="range"
          min="0"
          max="30"
          step="1"
          value={config.feather ?? 0}
          onChange={event => onUpdateConfig({ feather: Number(event.target.value) })}
          className="w-full accent-blue-600"
        />
      </div>
    </div>
  );
}
