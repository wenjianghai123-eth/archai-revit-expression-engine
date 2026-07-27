import { GenerationConfig, GenerationStep, type MaterialCategory, type MaterialReplacementMode, type MaterialReplacementTargetScope, type ReplacementTarget } from '../types';
import {
  readReplacementTargetLabel,
  replacementTargets,
  resolveReplacementTargetFromConfig,
  toMaterialReplaceTargetObject,
} from '../utils/materialReplacementTarget';
import { PromptVoiceAssistant } from './PromptVoiceAssistant';
import { SmartPromptAssistant } from './workspace/SmartPromptAssistant';

interface MaterialReplaceConfigPanelProps {
  config: GenerationConfig;
  materialReferenceCount?: number;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
  onRequestMaskEditor?: (mode: 'smart', options?: { materialReplacementMode?: MaterialReplacementMode }) => void;
}

const targetObjectOptions: Array<[ReplacementTarget, string]> = replacementTargets.map(target => [
  target,
  readReplacementTargetLabel(target),
]);

const materialOptions = [
  ['light-wood', '浅木色'],
  ['dark-wood', '深木色'],
  ['walnut', '胡桃木'],
  ['microcement', '微水泥'],
  ['rock-slab', '岩板'],
  ['marble', '大理石'],
  ['terrazzo', '水磨石'],
  ['tile', '瓷砖'],
  ['leather', '皮革'],
  ['fabric', '布艺'],
  ['metal', '金属'],
  ['glass', '玻璃'],
  ['art-paint', '艺术涂料'],
  ['linear-light', '线性灯'],
  ['warm-light-strip', '暖光灯带'],
  ['plant', '绿植'],
  ['custom', '自定义'],
] as const;

const recommendedMaterials: Record<ReplacementTarget, string[]> = {
  floor: ['light-wood', 'dark-wood', 'walnut', 'microcement', 'marble', 'tile', 'terrazzo'],
  wall: ['microcement', 'art-paint', 'walnut', 'marble', 'rock-slab'],
  furniture: ['walnut', 'light-wood', 'dark-wood', 'leather', 'fabric', 'metal'],
  lighting: ['linear-light', 'warm-light-strip'],
  plant: ['plant'],
  artwork: ['art-paint', 'fabric', 'metal', 'custom'],
  decor: ['ceramic', 'metal', 'glass', 'custom'].filter(value => materialOptions.some(([key]) => key === value)),
};

const strengthOptions = [
  ['subtle', '轻微'],
  ['balanced', '平衡'],
  ['strong', '明显'],
] as const;

const patternScaleOptions = [
  ['small', '小'],
  ['medium', '中'],
  ['large', '大'],
] as const;

const materialDirectionOptions = [
  ['auto', '自动'],
  ['horizontal', '横向'],
  ['vertical', '竖向'],
  ['diagonal', '斜铺'],
  ['herringbone', '人字拼'],
] as const;

const materialFinishOptions = [
  ['matte', '哑光'],
  ['satin', '柔光'],
  ['glossy', '亮面'],
  ['rough', '粗糙'],
] as const;

const replaceScopeOptions = [
  ['material-only', '仅换材质'],
  ['material-and-soft-decor', '材质 + 软装微调'],
  ['creative', '创意优化'],
] as const;

const materialCategoryOptions: Array<[MaterialCategory, string, string]> = [
  ['wood', '木材', '木饰面、木梁、木柜、木桌、木椅'],
  ['stone', '石材', '大理石、岩板、水磨石、石材台面'],
  ['metal', '金属', '金属框、金属饰面、五金、灯具金属件'],
  ['glass', '玻璃', '玻璃隔断、窗、屏风、展示面'],
  ['fabric', '布艺', '窗帘、软包、坐垫、地毯织物'],
  ['leather', '皮革', '皮革沙发、座椅、软包表面'],
  ['tile', '瓷砖', '墙砖、地砖、马赛克、铺贴面'],
  ['paint', '涂料', '乳胶漆、艺术涂料、漆面墙'],
  ['concrete', '混凝土', '清水混凝土、微水泥、水泥质感面'],
  ['custom', '自定义', '按补充描述识别指定材质类别'],
];

const materialReplaceModeOptions: Array<[MaterialReplacementMode, string, string]> = [
  ['object-category', '指定对象替换', '选择墙面、地面、桌椅等对象，仅替换该对象范围。'],
  ['material-category', '同类材质替换', '选择木材、石材等材质类别，系统自动识别同类材质区域。'],
  ['smart-select', '智能选区替换', '轻刷或点击后确认选区，只替换高亮区域。'],
];

const materialTargetScopeOptions: Array<[MaterialReplacementTargetScope, string, string]> = [
  ['all-scene', '全场景同类材质', '替换整张图中所有同类材质区域。'],
  ['selected-region', '指定区域内同类材质', '只替换用户确认选区内的同类材质。'],
  ['current-object', '当前对象', '只替换当前对象上的目标材质或对象表面。'],
];

const textureAlignmentOptions = [
  ['auto', '自动对齐'],
  ['surface', '顺表面对齐'],
  ['center', '中心起铺'],
  ['edge', '边缘起铺'],
  ['custom-origin', '自定义起点'],
] as const;

export function MaterialReplaceConfigPanel({
  config,
  materialReferenceCount = 0,
  onUpdateConfig,
  onRequestMaskEditor,
}: MaterialReplaceConfigPanelProps) {
  const editMode = config.editMode === 'mask' ? 'mask' : 'smart-type';
  const configuredSelectionMode = config.selectionMode === 'semantic-auto' || config.selectionMode === 'smart-select'
    ? config.selectionMode
    : null;
  const baseSelectionMode = configuredSelectionMode
    || (editMode !== 'mask'
      ? 'semantic-auto'
      : 'smart-select');
  const activeReplacementTarget = resolveReplacementTargetFromConfig(config);
  const activeObject = activeReplacementTarget;
  const activeStrength = config.strength === 'subtle' || config.strength === 'strong' ? config.strength : 'balanced';
  const activePatternScale = config.materialPatternScale || 'medium';
  const activeDirection = config.materialDirection || 'auto';
  const activeFinish = config.materialFinish || 'matte';
  const activeReplaceScope = config.materialReplaceScope || 'material-only';
  const explicitReplaceMode = normalizeMaterialReplacementMode(config.materialReplacementMode || config.materialReplaceMode);
  const activeReplaceMode: MaterialReplacementMode = explicitReplaceMode
    || (baseSelectionMode === 'semantic-auto' ? 'object-category' : 'smart-select');
  const activeMaterialCategory: MaterialCategory = config.materialCategory || 'wood';
  const activeTargetScope: MaterialReplacementTargetScope = normalizeReplacementScope(config.replacementScope)
    || (activeReplaceMode === 'material-category'
      ? 'all-scene'
      : activeReplaceMode === 'object-category'
        ? 'current-object'
        : 'selected-region');
  const selectionMode = activeReplaceMode === 'smart-select' || activeTargetScope === 'selected-region'
    ? 'smart-select'
    : 'semantic-auto';
  const activeMaterialCategoryLabel = materialCategoryOptions.find(([value]) => value === activeMaterialCategory)?.[1] || '自定义';
  const recommendations = activeReplacementTarget ? recommendedMaterials[activeReplacementTarget] || [] : [];
  const selectedObjectLabel = readReplacementTargetLabel(activeReplacementTarget);
  const selectedReplacementTargetLabel = readReplacementTargetLabel(activeReplacementTarget);
  const semanticSelectionCount = config.semanticObjectSelections?.length || 0;
  const candidateCount = config.materialCandidateCount || 1;
  const showObjectTargetPicker = activeReplaceMode === 'object-category';
  const showMaterialCategoryPicker = activeReplaceMode === 'material-category';

  const applyReplaceMode = (mode: MaterialReplacementMode) => {
    if (mode === 'object-category') {
      const nextTarget = activeReplacementTarget;
      const nextTargetObject = nextTarget ? toMaterialReplaceTargetObject(nextTarget) : undefined;
      onUpdateConfig({
        editTarget: 'material',
        editMode: 'smart-type',
        materialReplacementMode: 'object-category',
        materialReplaceMode: 'object-category',
        replacementScope: 'current-object',
        selectionMode: 'semantic-auto',
        maskSelectionMode: undefined,
        maskWorkflowMode: 'none',
        maskWorkflowActive: false,
        smartSelectionStatus: 'idle',
        smartSelectionConfirmed: false,
        smartMaskStage: undefined,
        smartMaskConfirmed: undefined,
        smartMaskIsRefining: false,
        smartMaskDetectedObject: undefined,
        smartMaskConfidence: undefined,
        smartMaskRefinementMethod: undefined,
        semanticAssistFromSelection: false,
        editingScope: 'semantic-auto',
        replacementStrategy: 'replace-existing',
        preserveUnmaskedArea: true,
        targetObjectCategory: nextTargetObject,
        targetObjectType: nextTargetObject,
        replacementTarget: nextTarget || undefined,
        confirmedSelectionMask: undefined,
      });
      return;
    }

    if (mode === 'material-category') {
      onUpdateConfig({
        editTarget: 'material',
        editMode: 'smart-type',
        materialReplacementMode: 'material-category',
        materialReplaceMode: 'material-category',
        materialCategory: activeMaterialCategory,
        replacementScope: 'all-scene',
        selectionMode: 'semantic-auto',
        maskSelectionMode: undefined,
        maskWorkflowMode: 'none',
        maskWorkflowActive: false,
        smartSelectionStatus: 'idle',
        smartSelectionConfirmed: false,
        smartMaskStage: undefined,
        smartMaskConfirmed: undefined,
        smartMaskIsRefining: false,
        smartMaskDetectedObject: undefined,
        smartMaskConfidence: undefined,
        smartMaskRefinementMethod: undefined,
        semanticAssistFromSelection: false,
        editingScope: 'semantic-auto',
        replacementStrategy: 'replace-existing',
        preserveUnmaskedArea: true,
        targetObjectCategory: undefined,
        targetObjectType: undefined,
        replacementTarget: undefined,
        confirmedSelectionMask: undefined,
      });
      return;
    }

    const smartPatch: Partial<GenerationConfig> = {
      editTarget: 'material',
      editMode: 'mask',
      materialReplacementMode: 'smart-select',
      materialReplaceMode: 'smart-select',
      replacementScope: 'selected-region',
      selectionMode: 'smart-select',
      maskSelectionMode: 'smart',
      maskWorkflowMode: 'smart',
      maskWorkflowActive: true,
      targetObjectCategory: undefined,
      targetObjectType: undefined,
      replacementTarget: undefined,
      confirmedSelectionMask: false,
      smartSelectionStatus: 'idle',
      smartSelectionConfirmed: false,
      smartMaskStage: undefined,
      smartMaskConfirmed: false,
      smartMaskIsRefining: false,
      smartMaskDetectedObject: undefined,
      smartMaskConfidence: undefined,
      smartMaskRefinementMethod: undefined,
      semanticAssistFromSelection: config.semanticAssistFromSelection !== false,
      editingScope: 'masked',
      replacementStrategy: 'replace-masked',
      preserveUnmaskedArea: true,
    };
    if (onRequestMaskEditor) {
      onUpdateConfig(smartPatch);
      onRequestMaskEditor('smart', { materialReplacementMode: 'smart-select' });
    } else {
      onUpdateConfig(smartPatch);
    }
  };

  const applyTargetScope = (scope: MaterialReplacementTargetScope) => {
    if (scope === 'selected-region') {
      onUpdateConfig({
        editTarget: 'material',
        editMode: 'mask',
        replacementScope: scope,
        selectionMode: 'smart-select',
        maskSelectionMode: 'smart',
        maskWorkflowMode: 'smart',
        maskWorkflowActive: true,
        smartSelectionStatus: 'idle',
        smartSelectionConfirmed: false,
        smartMaskStage: undefined,
        smartMaskConfirmed: false,
        smartMaskIsRefining: false,
        semanticAssistFromSelection: config.semanticAssistFromSelection !== false,
        editingScope: 'masked',
        replacementStrategy: 'replace-masked',
        preserveUnmaskedArea: true,
        confirmedSelectionMask: false,
        targetObjectCategory: activeReplaceMode === 'material-category' ? undefined : config.targetObjectCategory,
        targetObjectType: activeReplaceMode === 'material-category' ? undefined : config.targetObjectType,
        replacementTarget: activeReplaceMode === 'material-category' ? undefined : config.replacementTarget,
      });
      return;
    }

    const nextTarget = activeReplacementTarget;
    const nextTargetObject = nextTarget ? toMaterialReplaceTargetObject(nextTarget) : undefined;
    onUpdateConfig({
      editTarget: 'material',
      editMode: 'smart-type',
      replacementScope: scope,
      selectionMode: 'semantic-auto',
      maskSelectionMode: undefined,
      maskWorkflowMode: 'none',
      maskWorkflowActive: false,
      smartSelectionStatus: 'idle',
      smartSelectionConfirmed: false,
      smartMaskStage: undefined,
      smartMaskConfirmed: undefined,
      smartMaskIsRefining: false,
      semanticAssistFromSelection: false,
      editingScope: 'semantic-auto',
      replacementStrategy: 'replace-existing',
      preserveUnmaskedArea: true,
      confirmedSelectionMask: undefined,
      targetObjectCategory: activeReplaceMode === 'object-category' ? nextTargetObject : undefined,
      targetObjectType: activeReplaceMode === 'object-category' ? nextTargetObject : undefined,
      replacementTarget: activeReplaceMode === 'object-category' ? nextTarget : undefined,
    });
  };

  return (
    <div className="space-y-5 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3">
      <div>
        <h3 className="text-sm font-bold text-slate-900">智能材质替换</h3>
        <p className="mt-1 text-[11px] leading-5 text-slate-500">支持按指定对象、同类材质类别或智能选区替换；系统会根据选择自动生成识别和保护约束。</p>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">目标选择逻辑</label>
        <div className="grid grid-cols-1 gap-2">
          {materialReplaceModeOptions.map(([value, label, description]) => (
            <button
              key={value}
              type="button"
              data-testid={value === 'smart-select' ? 'open-smart-mask-editor' : undefined}
              onClick={() => applyReplaceMode(value)}
              className={`rounded-xl border p-3 text-left ${activeReplaceMode === value ? 'border-emerald-600 bg-white text-emerald-800 shadow-sm' : 'border-slate-200 bg-white/80 text-slate-600'}`}
            >
              <span className="block text-xs font-black">{label}</span>
              <span className="mt-1 block text-[10px] leading-4">{description}</span>
            </button>
          ))}
        </div>
      </div>

      {selectionMode === 'smart-select' ? (
        <div className="space-y-3 rounded-xl border border-emerald-100 bg-white/80 p-3" data-testid="semantic-assist-from-selection">
          <div>
            <p className="text-xs font-black text-slate-800">智能选区说明</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">在需要替换的对象或局部材质区域上轻微涂抹，系统会根据涂抹点识别所在物体或连续区域，确认后仅替换高亮选区。</p>
          </div>
          <label className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
            <input
              type="checkbox"
              checked={config.semanticAssistFromSelection !== false}
              onChange={event => onUpdateConfig({ semanticAssistFromSelection: event.target.checked })}
              className="mt-0.5 h-4 w-4 accent-emerald-600"
            />
            <span>
              <span className="block font-black">根据涂抹点识别所在物体 / 区域</span>
              <span className="mt-1 block text-[11px] leading-5 text-emerald-700">开启后优先结合涂抹点、提示词和参考图理解局部目标；不需要选择“目标区域”。</span>
            </span>
          </label>
        </div>
      ) : null}

      <div className="rounded-xl border border-dashed border-emerald-200 bg-white/70 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold text-slate-800">
              当前目标：{activeReplaceMode === 'material-category'
                ? `${activeMaterialCategoryLabel}材质`
                : activeReplaceMode === 'object-category'
                  ? selectedObjectLabel
                  : '智能确认选区'}
            </p>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">
              {activeReplaceMode === 'material-category'
                ? `系统将自动识别${activeMaterialCategoryLabel}类材质区域，并按「${readTargetScopeLabel(activeTargetScope)}」执行。`
                : selectionMode === 'semantic-auto'
                  ? '系统按指定对象识别目标，不需要手写替换范围描述。'
                  : '轻刷触发识别，确认高亮选区后仅替换选区覆盖区域。'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => applyReplaceMode(activeReplaceMode === 'smart-select' ? 'material-category' : 'smart-select')}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-emerald-200"
          >
            {activeReplaceMode === 'smart-select' ? '切换同类材质' : '打开智能选区'}
          </button>
        </div>
      </div>

      <SmartPromptAssistant
        mode="material-replace"
        config={config}
        compact
        fields={['buildingType', 'spaceType', 'renderStyle', 'lighting']}
        onUpdateConfig={onUpdateConfig}
      />

      {showMaterialCategoryPicker ? (
        <div className="space-y-2" data-testid="material-category-target">
          <div className="flex items-center justify-between gap-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">材质类别</label>
            <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-emerald-700">当前：{activeMaterialCategoryLabel}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {materialCategoryOptions.map(([value, label, description]) => (
              <button
                key={value}
                type="button"
                onClick={() => onUpdateConfig({
                  editTarget: 'material',
                  materialReplacementMode: 'material-category',
                  materialReplaceMode: 'material-category',
                  materialCategory: value,
                  preserveUnmaskedArea: true,
                })}
                className={`rounded-lg border px-2.5 py-2 text-left text-xs font-bold ${
                  activeMaterialCategory === value
                    ? 'border-emerald-600 bg-white text-emerald-700 shadow-sm'
                    : 'border-slate-200 bg-white/80 text-slate-600 hover:border-emerald-200'
                }`}
              >
                <span className="block">{label}</span>
                <span className="mt-1 block text-[10px] font-semibold leading-4 text-slate-500">{description}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-2" data-testid="material-replacement-target-scope">
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">替换范围</label>
        <div className="grid grid-cols-1 gap-2">
          {materialTargetScopeOptions.map(([value, label, description]) => {
            const disabled = activeReplaceMode === 'smart-select' && value !== 'selected-region';
            const isSelected = activeTargetScope === value || (activeReplaceMode === 'smart-select' && value === 'selected-region');
            return (
              <button
                key={value}
                type="button"
                disabled={disabled}
                onClick={() => applyTargetScope(value)}
                className={`rounded-lg border px-3 py-2 text-left text-xs font-bold disabled:cursor-not-allowed disabled:opacity-45 ${
                  isSelected
                    ? 'border-emerald-600 bg-white text-emerald-700 shadow-sm'
                    : 'border-slate-200 bg-white/80 text-slate-600 hover:border-emerald-200'
                }`}
              >
                <span className="block">{label}</span>
                <span className="mt-1 block text-[10px] font-semibold leading-4 text-slate-500">{description}</span>
              </button>
            );
          })}
        </div>
        {activeReplaceMode === 'material-category' && activeTargetScope === 'selected-region' ? (
          <button
            type="button"
            onClick={() => {
              if (onRequestMaskEditor) {
                onRequestMaskEditor('smart', { materialReplacementMode: 'material-category' });
              } else {
                onUpdateConfig({
                  editTarget: 'material',
                  editMode: 'mask',
                  materialReplacementMode: 'material-category',
                  materialReplaceMode: 'material-category',
                  replacementScope: 'selected-region',
                  selectionMode: 'smart-select',
                  maskSelectionMode: 'smart',
                  maskWorkflowMode: 'smart',
                  maskWorkflowActive: true,
                  semanticAssistFromSelection: config.semanticAssistFromSelection !== false,
                  editingScope: 'masked',
                  replacementStrategy: 'replace-masked',
                  preserveUnmaskedArea: true,
                });
              }
            }}
            className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-700 hover:border-emerald-400"
          >
            打开智能选区，限定区域内同类材质
          </button>
        ) : null}
      </div>

      {showObjectTargetPicker ? (
      <div className="space-y-2" data-testid="semantic-auto-target-region">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">目标对象</label>
          <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-emerald-700">当前：{selectedObjectLabel} · {selectedReplacementTargetLabel}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {targetObjectOptions.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                onUpdateConfig({
                  editTarget: 'material',
                  targetObjectType: toMaterialReplaceTargetObject(value),
                  replacementTarget: value,
                  materialReplacementMode: activeReplaceMode,
                  materialReplaceMode: activeReplaceMode,
                  targetObjectCategory: toMaterialReplaceTargetObject(value),
                  replacementScope: activeReplaceMode === 'object-category' ? 'current-object' : activeTargetScope,
                  preserveUnmaskedArea: true,
                });
              }}
              className={`rounded-lg border px-2.5 py-2 text-xs font-bold ${
                activeReplacementTarget === value
                  ? 'border-emerald-600 bg-white text-emerald-700 shadow-sm'
                  : 'border-slate-200 bg-white/80 text-slate-600 hover:border-emerald-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {editMode === 'smart-type' ? <p className="rounded-lg bg-white px-2.5 py-2 text-[11px] font-semibold text-slate-500">已在图中标记 {semanticSelectionCount} 个对象，可继续切换类型并点击添加。</p> : null}
      </div>
      ) : null}

      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">目标材质</label>
        {recommendations.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {recommendations.map(value => {
              const label = materialOptions.find(([key]) => key === value)?.[1] || value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onUpdateConfig({ targetMaterial: value as GenerationConfig['targetMaterial'] })}
                  className="rounded-full border border-emerald-100 bg-white px-2.5 py-1 text-[10px] font-bold text-emerald-700 hover:border-emerald-300"
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          {materialOptions.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onUpdateConfig({ targetMaterial: value })}
              className={`rounded-lg border px-2.5 py-2 text-xs font-bold ${
                config.targetMaterial === value
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">纹理尺度</label>
        <div className="grid grid-cols-3 gap-2">
          {patternScaleOptions.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onUpdateConfig({ materialPatternScale: value })}
              className={`rounded-lg border px-3 py-2 text-[10px] font-bold ${
                activePatternScale === value
                  ? 'border-emerald-600 bg-white text-emerald-700'
                  : 'border-slate-200 bg-white/80 text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {config.editTarget === 'material' ? (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={config.enablePhysicalMaterialLayout === true}
              onChange={event => onUpdateConfig({ enablePhysicalMaterialLayout: event.target.checked })}
              className="mt-0.5 accent-emerald-600"
            />
            <span>
              <span className="block text-xs font-black text-slate-800">启用真实尺寸与拼缝控制</span>
              <span className="mt-1 block text-[10px] leading-4 text-slate-500">适用于瓷砖、石材和木地板。关闭时由系统按画面自动匹配纹理尺度，不主动指定拼缝。</span>
            </span>
          </label>
          {config.enablePhysicalMaterialLayout ? (
            <div className="grid grid-cols-2 gap-2" data-testid="physical-material-layout-fields">
              <label className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-[10px] font-bold text-slate-500">材质真实尺寸（mm）
                <input type="number" min="20" max="5000" step="10" value={config.materialRealSizeMm ?? ''} onChange={event => onUpdateConfig({ materialRealSizeMm: readOptionalNumber(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800" />
              </label>
              <label className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-[10px] font-bold text-slate-500">拼缝宽度（mm）
                <input type="number" min="0" max="50" step="0.5" value={config.materialJointWidthMm ?? ''} onChange={event => onUpdateConfig({ materialJointWidthMm: readOptionalNumber(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800" />
              </label>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">纹理对齐与起点</label>
        <select value={config.materialTextureAlignment || 'auto'} onChange={event => onUpdateConfig({ materialTextureAlignment: event.target.value as GenerationConfig['materialTextureAlignment'] })} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
          {textureAlignmentOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {config.materialTextureAlignment === 'custom-origin' ? <div className="grid grid-cols-2 gap-2">
          {(['x', 'y'] as const).map(axis => <label key={axis} className="text-[10px] font-bold text-slate-500">起点 {axis.toUpperCase()} {Math.round((config.materialTextureOrigin?.[axis] ?? 0.5) * 100)}%<input type="range" min="0" max="1" step="0.01" value={config.materialTextureOrigin?.[axis] ?? 0.5} onChange={event => onUpdateConfig({ materialTextureOrigin: { x: config.materialTextureOrigin?.x ?? 0.5, y: config.materialTextureOrigin?.y ?? 0.5, [axis]: Number(event.target.value) } })} className="block w-full accent-emerald-600" /></label>)}
        </div> : null}
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">铺贴候选</label>
        <div className="grid grid-cols-4 gap-2">
          {([1, 2, 3, 4] as const).map(count => <button key={count} type="button" onClick={() => onUpdateConfig({ materialCandidateCount: count, batchCount: count })} className={`rounded-lg border px-3 py-2 text-xs font-black ${candidateCount === count ? 'border-emerald-600 bg-white text-emerald-700' : 'border-slate-200 bg-white/80 text-slate-500'}`}>{count} 张</button>)}
        </div>
        <p className="text-[10px] font-semibold text-slate-500">按候选结果数扣除算力点，失败候选沿用任务退款机制。</p>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">铺贴方向</label>
        <div className="grid grid-cols-2 gap-2">
          {materialDirectionOptions.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onUpdateConfig({ materialDirection: value })}
              className={`rounded-lg border px-3 py-2 text-[10px] font-bold ${
                activeDirection === value
                  ? 'border-emerald-600 bg-white text-emerald-700'
                  : 'border-slate-200 bg-white/80 text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">表面光泽</label>
        <div className="grid grid-cols-4 gap-2">
          {materialFinishOptions.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onUpdateConfig({ materialFinish: value })}
              className={`rounded-lg border px-2.5 py-2 text-[10px] font-bold ${
                activeFinish === value
                  ? 'border-emerald-600 bg-white text-emerald-700'
                  : 'border-slate-200 bg-white/80 text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">变化内容</label>
        <div className="grid grid-cols-1 gap-2">
          {replaceScopeOptions.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onUpdateConfig({ materialReplaceScope: value })}
              className={`rounded-lg border px-3 py-2 text-xs font-bold ${
                activeReplaceScope === value
                  ? 'border-emerald-600 bg-white text-emerald-700'
                  : 'border-slate-200 bg-white/80 text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-emerald-200 bg-white/70 p-3">
        <p className="text-xs font-bold text-slate-800">上传对应贴图</p>
        <p className="mt-1 text-[11px] leading-5 text-slate-500">
          {activeReplaceMode === 'material-category'
            ? `当前贴图会绑定到「${activeMaterialCategoryLabel}」材质类别，范围为「${readTargetScopeLabel(activeTargetScope)}」。已选择 ${materialReferenceCount} 张。`
            : selectionMode === 'semantic-auto'
              ? `当前贴图会绑定到「${selectedObjectLabel}」。已选择 ${materialReferenceCount} 张。`
              : `参考图用于说明确认选区要替换成什么。已选择 ${materialReferenceCount} 张。`}
        </p>
      </div>

      <div className="rounded-xl border border-emerald-100 bg-white/80 p-3 text-[11px] font-semibold leading-5 text-slate-600" data-testid="material-replacement-summary">
        <p className="text-xs font-black text-slate-800">任务摘要</p>
        <p className="mt-1">模式：{readReplaceModeLabel(activeReplaceMode)}</p>
        <p>目标：{activeReplaceMode === 'material-category' ? `${activeMaterialCategoryLabel}材质` : activeReplaceMode === 'object-category' ? selectedObjectLabel : '确认选区'}</p>
        <p>范围：{readTargetScopeLabel(activeTargetScope)}</p>
        <p>保护：建筑结构、空间关系、轮廓、位置、尺寸、相机与非目标材质保持不变</p>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">额外补充要求</label>
        <PromptVoiceAssistant
          generationStep={GenerationStep.MaterialReplace}
          currentPrompt={config.customMaterialPrompt || ''}
          context={config as unknown as Record<string, unknown>}
          onApplyPrompt={prompt => onUpdateConfig({ customMaterialPrompt: prompt })}
        />
        <textarea
          value={config.customMaterialPrompt || ''}
          onChange={event => onUpdateConfig({ customMaterialPrompt: event.target.value })}
          className="h-24 w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-800 outline-none focus:border-emerald-300"
          placeholder="例如“可补充材质颜色、纹理方向、光感要求等；不填写也可以生成。”"
        />
        <p className="rounded-lg bg-white/80 px-3 py-2 text-[11px] font-semibold leading-5 text-slate-500" data-testid="built-in-control-constraints-note">
          系统已默认内置建筑结构不变、空间结构不变、构图不变和非目标区域保持不变等约束。此处只需补充说明您希望替换成什么。
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">变化强度</label>
        <div className="grid grid-cols-3 gap-2">
          {strengthOptions.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onUpdateConfig({ strength: value })}
              className={`rounded-lg border px-3 py-2 text-[10px] font-bold ${
                activeStrength === value
                  ? 'border-emerald-600 bg-white text-emerald-700'
                  : 'border-slate-200 bg-white/80 text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white/80 p-3 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={config.preserveLighting !== false}
            onChange={event => onUpdateConfig({ preserveLighting: event.target.checked })}
            className="mt-0.5 h-4 w-4 accent-emerald-600"
          />
          <span>
            <span className="block font-bold text-slate-800">保持原有光照方向</span>
            <span className="mt-1 block leading-5">尽量延续原图阴影和反射关系。</span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white/80 p-3 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={config.preserveGeometry !== false}
            onChange={event => onUpdateConfig({ preserveGeometry: event.target.checked, preserveStructure: event.target.checked })}
            className="mt-0.5 h-4 w-4 accent-emerald-600"
          />
          <span>
            <span className="block font-bold text-slate-800">保持几何与边界</span>
            <span className="mt-1 block leading-5">只替换材质或软装表现，不改变房间结构。</span>
          </span>
        </label>
      </div>
    </div>
  );
}

function normalizeMaterialReplacementMode(mode: unknown): MaterialReplacementMode | null {
  if (mode === 'object-category' || mode === 'material-category' || mode === 'smart-select') return mode;
  if (mode === 'object-target') return 'object-category';
  if (mode === 'smart-selection') return 'smart-select';
  return null;
}

function normalizeReplacementScope(scope: unknown): MaterialReplacementTargetScope | null {
  if (scope === 'all-scene' || scope === 'selected-region' || scope === 'current-object') return scope;
  if (scope === 'all_scene') return 'all-scene';
  if (scope === 'selected_region') return 'selected-region';
  if (scope === 'current_object') return 'current-object';
  return null;
}

function readOptionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function readReplaceModeLabel(mode: MaterialReplacementMode): string {
  if (mode === 'object-category') return '指定对象替换';
  if (mode === 'material-category') return '同类材质替换';
  return '智能选区替换';
}

function readTargetScopeLabel(scope: MaterialReplacementTargetScope): string {
  if (scope === 'all-scene') return '全场景同类材质';
  if (scope === 'selected-region') return '指定区域内同类材质';
  return '当前对象';
}
