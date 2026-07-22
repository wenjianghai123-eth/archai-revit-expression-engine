import { BookOpen } from 'lucide-react';
import { FloorplanRoomLabel, FloorplanRoomType, GenerationConfig, GenerationStep } from '../../types';
import {
  floorplanColorTemplates,
  floorplanLayoutTemplates,
  floorplanStyleTemplates,
  resolveFloorplanBatchCount,
  resolveFloorplanVariantPlans,
  type FloorplanMultiPlanBatchCount,
  type FloorplanVariantFocus,
  type FloorplanVariantType,
} from '../../constants/floorplanVariants';
import { type SmartPromptMode } from '../../promptTemplates/intelligentPromptTemplates';
import { SmartPromptAssistant } from './SmartPromptAssistant';
import { isLocalInpaintingStep } from './workspaceUtils';
import { PromptVoiceAssistant } from '../PromptVoiceAssistant';
import type { DrawingTool } from '../drawing-expression/drawingExpressionState';

interface PromptConfigPanelProps {
  step: GenerationStep;
  config: GenerationConfig;
  isFloorplanStep: boolean;
  compactInpaint?: boolean;
  activeDrawingTool?: DrawingTool;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
  onOpenPromptTemplatePanel: () => void;
}

export function PromptConfigPanel({
  step,
  config,
  isFloorplanStep,
  compactInpaint = false,
  activeDrawingTool,
  onUpdateConfig,
  onOpenPromptTemplatePanel,
}: PromptConfigPanelProps) {
  return (
    <>
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          额外补充要求
        </label>
        <SmartPromptAssistant mode={stepToPromptMode(step)} config={config} compact onUpdateConfig={onUpdateConfig} />
        <button type="button" onClick={onOpenPromptTemplatePanel} className="inline-flex w-fit items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 hover:border-blue-200 hover:text-blue-700">
          <BookOpen className="h-3.5 w-3.5" />
          提示词模板
        </button>
        <PromptVoiceAssistant
          generationStep={step}
          currentPrompt={config.prompt}
          context={config as unknown as Record<string, unknown>}
          onApplyPrompt={prompt => onUpdateConfig({ prompt })}
        />
        <textarea
          value={config.prompt}
          onChange={event => onUpdateConfig({ prompt: event.target.value })}
          className={`${compactInpaint ? 'h-36' : 'h-28'} w-full resize-none rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs leading-5 text-blue-950 outline-none focus:border-blue-300`}
          placeholder={isFloorplanStep
            ? '可选：补充色彩、材质、表达风格、重点区域等要求。例如：强化景观铺装层次，住宅区域使用暖色系。'
            : isLocalInpaintingStep(step)
              ? '可选：补充希望修改的内容，例如：将地板替换为上传的材质贴图、优化灯光、替换墙面材质……'
              : '可选：补充特殊效果、重点区域或限制要求。不填写也会根据上方参数生成。'}
        />
        {isLocalInpaintingStep(step) ? (
          <p className="text-[11px] leading-5 text-slate-400">不涂抹也可以直接根据提示词进行全局或智能局部修改；涂抹后可更精确地限制修改区域。</p>
        ) : null}
      </div>

      <QualityModeControls config={config} onUpdateConfig={onUpdateConfig} />

      {step === GenerationStep.FloorplanTo3D ? (
        <FloorplanMultiPlanControls config={config} activeDrawingTool={activeDrawingTool} onUpdateConfig={onUpdateConfig} />
      ) : null}

      {step === GenerationStep.LocalInpainting ? (
        <InpaintConfigControls config={config} onUpdateConfig={onUpdateConfig} />
      ) : null}
    </>
  );
}

interface FloorplanMultiPlanControlsProps {
  config: GenerationConfig;
  activeDrawingTool?: DrawingTool;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
}

const floorplanRoomTypeOptions: Array<{ value: FloorplanRoomType; label: string }> = [
  { value: 'living-room', label: '客厅' },
  { value: 'dining-room', label: '餐厅' },
  { value: 'bedroom', label: '卧室' },
  { value: 'kitchen', label: '厨房' },
  { value: 'bathroom', label: '卫生间' },
  { value: 'balcony', label: '阳台' },
  { value: 'entry', label: '玄关' },
  { value: 'study', label: '书房' },
  { value: 'office', label: '办公区' },
  { value: 'commercial', label: '商业区' },
  { value: 'custom', label: '自定义' },
];

function FloorplanMultiPlanControls({ config, activeDrawingTool, onUpdateConfig }: FloorplanMultiPlanControlsProps) {
  const outputMode = config.floorplanOutputMode || 'single';
  const variantType = config.floorplanVariantType || 'material_style';
  const variantFocus = config.floorplanVariantFocus || (variantType === 'mixed' ? 'both' : variantType);
  const lineworkPreservation = config.lineworkPreservation || 'high';
  const floorplanTemplateId = config.floorplanTemplateId || 'residential-warm-wood';
  const roomLabels = Array.isArray(config.floorplanRoomLabels) ? config.floorplanRoomLabels : [];
  const batchCount = resolveFloorplanBatchCount(config.batchCount);

  const updateMultiPlan = (patch: Partial<GenerationConfig>) => {
    const nextConfig = {
      ...config,
      ...patch,
    };
    const nextMode = nextConfig.floorplanOutputMode || 'single';
    const nextBatchCount = nextMode === 'multi' ? resolveFloorplanBatchCount(nextConfig.batchCount) : 1;
    const plans = resolveFloorplanVariantPlans(nextConfig, nextBatchCount);
    onUpdateConfig({
      ...patch,
      batchCount: nextBatchCount,
      floorplanStyleTemplateIds: plans.map(plan => plan.selectedStyleId).filter((id): id is string => Boolean(id)),
      floorplanStyleTemplateNames: plans.map(plan => plan.selectedStyleName).filter((name): name is string => Boolean(name)),
      floorplanLayoutVariantIds: plans.map(plan => plan.layoutVariantId).filter((id): id is string => Boolean(id)),
      floorplanLayoutVariantNames: plans.map(plan => plan.layoutVariantName).filter((name): name is string => Boolean(name)),
      variantNames: plans.map(plan => plan.variantName),
    });
  };

  const updateRoomLabel = (id: string, patch: Partial<FloorplanRoomLabel>) => {
    onUpdateConfig({ floorplanRoomLabels: roomLabels.map(label => label.id === id ? { ...label, ...patch } : label) });
  };

  const addRoomLabel = () => {
    const nextIndex = roomLabels.length + 1;
    onUpdateConfig({
      floorplanRoomLabels: [
        ...roomLabels,
        {
          id: `room-${Date.now()}-${nextIndex}`,
          name: `区域 ${nextIndex}`,
          roomType: 'living-room',
          positionDescription: '',
        },
      ],
    });
  };

  const removeRoomLabel = (id: string) => {
    onUpdateConfig({ floorplanRoomLabels: roomLabels.filter(label => label.id !== id) });
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black text-slate-900">{readDrawingToolSettingsLabel(activeDrawingTool)}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">这里只调整当前功能参数；功能切换请使用页面顶部工具栏。</p>
        </div>
      </div>

      <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">结构一致性：必须保留墙体、门窗、家具、文字、尺寸、轴线、构图和画幅；仅增强表达，不重构空间。</p>

      <div className="grid grid-cols-2 gap-2">
        <MiniOption active={outputMode !== 'multi'} label="单张输出" onClick={() => updateMultiPlan({ floorplanOutputMode: 'single', batchCount: 1 })} />
        <MiniOption active={outputMode === 'multi'} label="多方案输出" onClick={() => updateMultiPlan({ floorplanOutputMode: 'multi', batchCount: resolveFloorplanBatchCount(config.batchCount) })} />
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">线稿保持</p>
        <div className="grid grid-cols-3 gap-2">
          <MiniOption active={lineworkPreservation === 'strict'} label="严格保留" onClick={() => updateMultiPlan({ lineworkPreservation: 'strict' })} />
          <MiniOption active={lineworkPreservation === 'high'} label="高度保留" onClick={() => updateMultiPlan({ lineworkPreservation: 'high' })} />
          <MiniOption active={lineworkPreservation === 'medium'} label="适度美化" onClick={() => updateMultiPlan({ lineworkPreservation: 'medium' })} />
        </div>
      </div>

      <div className="grid gap-2">
        <FloorplanCheckbox checked={Boolean(config.enableLegend)} label="添加图例" onChange={checked => updateMultiPlan({ enableLegend: checked })} />
        <FloorplanCheckbox checked={Boolean(config.enableAreaText)} label="添加面积/功能文字" onChange={checked => updateMultiPlan({ enableAreaText: checked })} />
        <FloorplanCheckbox checked={Boolean(config.enableMaterialLegend)} label="添加材质图例" onChange={checked => updateMultiPlan({ enableMaterialLegend: checked })} />
      </div>

      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">彩平模板</span>
        <select
          value={floorplanTemplateId}
          onChange={event => updateMultiPlan({ floorplanTemplateId: event.currentTarget.value as GenerationConfig['floorplanTemplateId'] })}
          className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-300"
        >
          {floorplanColorTemplates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
        </select>
      </label>

      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-black text-slate-900">房间类型标注</p>
            <p className="mt-0.5 text-[11px] text-slate-500">添加区域名称、房间类型和位置描述。</p>
          </div>
          <button type="button" onClick={addRoomLabel} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white">添加</button>
        </div>
        {roomLabels.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-3 text-xs font-semibold text-slate-400">未添加房间标签，系统会自动识别功能区。</p>
        ) : (
          <div className="space-y-2">
            {roomLabels.map(label => (
              <div key={label.id} className="space-y-2 rounded-lg border border-slate-200 bg-white p-2">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={label.name}
                    onChange={event => updateRoomLabel(label.id, { name: event.currentTarget.value })}
                    placeholder="区域名称"
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-300"
                  />
                  <select
                    value={label.roomType}
                    onChange={event => updateRoomLabel(label.id, { roomType: event.currentTarget.value as FloorplanRoomType })}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-300"
                  >
                    {floorplanRoomTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                {label.roomType === 'custom' ? (
                  <input
                    value={label.customTypeLabel || ''}
                    onChange={event => updateRoomLabel(label.id, { customTypeLabel: event.currentTarget.value })}
                    placeholder="自定义房间类型"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-300"
                  />
                ) : null}
                <div className="flex gap-2">
                  <input
                    value={label.positionDescription}
                    onChange={event => updateRoomLabel(label.id, { positionDescription: event.currentTarget.value })}
                    placeholder="位置描述，例如：左上角、入口右侧、南侧大开间"
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-300"
                  />
                  <button type="button" onClick={() => removeRoomLabel(label.id)} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">删除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {outputMode === 'multi' ? (
        <>
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">方案类型</p>
            <div className="grid grid-cols-1 gap-2">
              <MiniOption active={variantType === 'material_style'} label="材质/风格方案" onClick={() => updateMultiPlan({ floorplanVariantType: 'material_style', floorplanVariantFocus: 'material_style' })} />
              <MiniOption active={variantType === 'furniture_layout'} label="家具摆放方案" onClick={() => updateMultiPlan({ floorplanVariantType: 'furniture_layout', floorplanVariantFocus: 'furniture_layout' })} />
              <MiniOption active={variantType === 'mixed'} label="混合方案" onClick={() => updateMultiPlan({ floorplanVariantType: 'mixed', floorplanVariantFocus: 'both' })} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {([1, 2, 4, 6] as FloorplanMultiPlanBatchCount[]).map(value => (
              <MiniOption key={value} active={batchCount === value} label={`${value} 张`} onClick={() => updateMultiPlan({ batchCount: value })} />
            ))}
          </div>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">方案差异重点</span>
            <select
              value={variantFocus}
              onChange={event => updateMultiPlan({ floorplanVariantFocus: event.currentTarget.value as FloorplanVariantFocus })}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-300"
            >
              <option value="material_style">以材质风格为主</option>
              <option value="furniture_layout">以家具摆放为主</option>
              <option value="both">材质与摆放同时变化</option>
            </select>
          </label>

          <p className="text-[11px] leading-5 text-slate-500">
            默认模板包含 {floorplanStyleTemplates.length} 个材质风格和 {floorplanLayoutTemplates.length} 个家具布局方向。家具摆放方案会改变同类型家具组合、朝向和软装关系，但保持原始平面图墙体、门窗、功能分区和比例不变。
          </p>
        </>
      ) : null}
    </div>
  );
}

function readDrawingToolSettingsLabel(tool?: DrawingTool): string {
  if (tool === 'color-plan-2d') return '二维彩平参数';
  if (tool === 'color-plan-3d') return '三维彩平参数';
  if (tool === 'functional-zoning') return '功能分区参数';
  if (tool === 'circulation-analysis') return '动线分析参数';
  if (tool === 'material-mapping') return '区域材质配置';
  if (tool === 'region-recognition') return '区域识别与校正';
  return '图纸表达参数';
}

function MiniOption({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-xs font-bold ${
        active
          ? 'border-blue-600 bg-blue-50 text-blue-700'
          : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-200'
      }`}
    >
      {label}
    </button>
  );
}

function FloorplanCheckbox({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.currentTarget.checked)}
        className="h-4 w-4 rounded border-slate-300 text-blue-600"
      />
    </label>
  );
}

function stepToPromptMode(step: GenerationStep): SmartPromptMode {
  if (step === GenerationStep.FloorplanTo3D) return 'floorplan';
  if (step === GenerationStep.StyleRender) return 'style-render';
  if (step === GenerationStep.MaterialReplace) return 'material-replace';
  return 'inpaint';
}

interface QualityModeControlsProps {
  config: GenerationConfig;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
}

function QualityModeControls({ config, onUpdateConfig }: QualityModeControlsProps) {
  const value = config.qualityMode || 'fast';
  const options = [
    { value: 'draft', label: '草稿' },
    { value: 'fast', label: '快速' },
    { value: 'balanced', label: '均衡' },
    { value: 'high', label: '高质' },
  ] as const;

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">质量模式</label>
      <div className="grid grid-cols-4 gap-2">
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
      <p className="text-[11px] leading-5 text-slate-400">参考图越多生成越慢。</p>
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
