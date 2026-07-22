import { GenerationConfig, GenerationStep, type ReplacementTarget } from '../types';
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
  onRequestMaskEditor?: (mode: 'smart' | 'precise') => void;
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
  const maskSelectionMode = config.maskSelectionMode === 'smart'
    ? 'smart'
    : config.maskSelectionMode === 'precise'
      ? 'precise'
      : 'precise';
  const activeReplacementTarget = resolveReplacementTargetFromConfig(config);
  const activeObject = activeReplacementTarget;
  const activeStrength = config.strength === 'subtle' || config.strength === 'strong' ? config.strength : 'balanced';
  const activePatternScale = config.materialPatternScale || 'medium';
  const activeDirection = config.materialDirection || 'auto';
  const activeFinish = config.materialFinish || 'matte';
  const activeReplaceScope = config.materialReplaceScope || 'material-only';
  const recommendations = activeReplacementTarget ? recommendedMaterials[activeReplacementTarget] || [] : [];
  const selectedObjectLabel = readReplacementTargetLabel(activeReplacementTarget);
  const selectedReplacementTargetLabel = readReplacementTargetLabel(activeReplacementTarget);
  const semanticSelectionCount = config.semanticObjectSelections?.length || 0;
  const candidateCount = config.materialCandidateCount || 1;

  return (
    <div className="space-y-5 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3">
      <div>
        <h3 className="text-sm font-bold text-slate-900">智能材质替换</h3>
        <p className="mt-1 text-[11px] leading-5 text-slate-500">智能涂抹会先识别并补全目标对象边界；精致涂抹保留原有手动精确控制。</p>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">区域选择模式</label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            data-testid="open-smart-mask-editor"
            onClick={() => onRequestMaskEditor ? onRequestMaskEditor('smart') : onUpdateConfig({
              editTarget: 'material',
              editMode: 'mask',
              maskSelectionMode: 'smart',
              maskWorkflowMode: 'smart',
              maskWorkflowActive: true,
              smartMaskStage: 'rough-marking',
              smartMaskConfirmed: false,
              smartMaskIsRefining: false,
              smartMaskDetectedObject: undefined,
              smartMaskConfidence: undefined,
              smartMaskRefinementMethod: undefined,
            })}
            className={`rounded-xl border p-3 text-left ${editMode === 'mask' && maskSelectionMode === 'smart' ? 'border-emerald-600 bg-white text-emerald-800 shadow-sm' : 'border-slate-200 bg-white/80 text-slate-600'}`}
          >
            <span className="block text-xs font-black">智能涂抹（默认）</span>
            <span className="mt-1 block text-[10px] leading-4">粗略标记目标区域，AI 自动识别完整对象</span>
          </button>
          <button
            type="button"
            data-testid="open-precise-mask-editor"
            onClick={() => onRequestMaskEditor ? onRequestMaskEditor('precise') : onUpdateConfig({
              editTarget: 'material',
              editMode: 'mask',
              maskSelectionMode: 'precise',
              maskWorkflowMode: 'manual',
              maskWorkflowActive: true,
              smartMaskStage: undefined,
              smartMaskConfirmed: undefined,
              smartMaskIsRefining: false,
              smartMaskDetectedObject: undefined,
              smartMaskConfidence: undefined,
              smartMaskRefinementMethod: undefined,
            })}
            className={`rounded-xl border p-3 text-left ${editMode === 'mask' && maskSelectionMode === 'precise' ? 'border-emerald-600 bg-white text-emerald-800 shadow-sm' : 'border-slate-200 bg-white/80 text-slate-600'}`}
          >
            <span className="block text-xs font-black">精致涂抹</span>
            <span className="mt-1 block text-[10px] leading-4">手动精确控制修改范围</span>
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-emerald-200 bg-white/70 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold text-slate-800">语义对象点击（高级）</p>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">保留原有对象类型与多锚点选择方式。</p>
          </div>
          <button
            type="button"
            onClick={() => onUpdateConfig({ editMode: 'smart-type', maskWorkflowMode: 'none', maskWorkflowActive: false, smartMaskStage: 'idle', smartMaskIsRefining: false })}
            className={`rounded-lg border px-3 py-2 text-xs font-bold ${editMode === 'smart-type' ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}
          >
            {editMode === 'smart-type' ? '正在使用' : '切换使用'}
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

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">目标区域</label>
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
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">替换范围</label>
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
          当前贴图会绑定到「{selectedObjectLabel}」。已选择 {materialReferenceCount} 张。
        </p>
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

function readOptionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
