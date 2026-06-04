import { GenerationConfig, GenerationStep } from '../types';
import { PromptVoiceAssistant } from './PromptVoiceAssistant';
import { SmartPromptAssistant } from './workspace/SmartPromptAssistant';

interface MaterialReplaceConfigPanelProps {
  config: GenerationConfig;
  materialReferenceCount?: number;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
}

const targetObjectOptions = [
  ['floor', '地面'],
  ['wall', '墙面'],
  ['ceiling', '天花'],
  ['cabinet', '柜体'],
  ['sofa', '沙发'],
  ['table-chair', '桌椅'],
  ['lighting', '灯具'],
  ['plant', '绿植'],
  ['door-window', '门窗'],
  ['feature-wall', '背景墙'],
  ['other', '其他'],
] as const;

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

const recommendedMaterials: Record<string, string[]> = {
  floor: ['light-wood', 'dark-wood', 'walnut', 'microcement', 'marble', 'tile', 'terrazzo'],
  wall: ['microcement', 'art-paint', 'walnut', 'marble', 'rock-slab'],
  ceiling: ['art-paint', 'linear-light', 'warm-light-strip', 'microcement'],
  cabinet: ['walnut', 'light-wood', 'dark-wood', 'glass', 'metal'],
  sofa: ['leather', 'fabric'],
  lighting: ['linear-light', 'warm-light-strip'],
  'feature-wall': ['rock-slab', 'marble', 'art-paint', 'walnut'],
};

const strengthOptions = [
  ['subtle', '轻微'],
  ['balanced', '平衡'],
  ['strong', '明显'],
] as const;

export function MaterialReplaceConfigPanel({
  config,
  materialReferenceCount = 0,
  onUpdateConfig,
}: MaterialReplaceConfigPanelProps) {
  const editMode = config.editMode === 'mask' ? 'mask' : 'smart-type';
  const activeObject = config.targetObjectType;
  const activeStrength = config.strength === 'subtle' || config.strength === 'strong' ? config.strength : 'balanced';
  const recommendations = activeObject ? recommendedMaterials[activeObject] || [] : [];
  const selectedObjectLabel = targetObjectOptions.find(([value]) => value === activeObject)?.[1] || '未选择';

  return (
    <div className="space-y-5 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3">
      <div>
        <h3 className="text-sm font-bold text-slate-900">智能材质替换</h3>
        <p className="mt-1 text-[11px] leading-5 text-slate-500">点击区域类型，直接替换对应部分。</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onUpdateConfig({ editMode: 'smart-type' })}
          className={`rounded-lg border px-3 py-2 text-xs font-bold ${editMode === 'smart-type' ? 'border-emerald-600 bg-white text-emerald-700' : 'border-slate-200 bg-white/80 text-slate-600'}`}
        >
          智能替换
        </button>
        <button
          type="button"
          onClick={() => onUpdateConfig({ editMode: 'mask' })}
          className={`rounded-lg border px-3 py-2 text-xs font-bold ${editMode === 'mask' ? 'border-emerald-600 bg-white text-emerald-700' : 'border-slate-200 bg-white/80 text-slate-600'}`}
        >
          精细涂抹
        </button>
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
          <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-emerald-700">当前：{selectedObjectLabel}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {targetObjectOptions.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onUpdateConfig({ targetObjectType: value })}
              className={`rounded-lg border px-2.5 py-2 text-xs font-bold ${
                activeObject === value
                  ? 'border-emerald-600 bg-white text-emerald-700 shadow-sm'
                  : 'border-slate-200 bg-white/80 text-slate-600 hover:border-emerald-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
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
