import { SlidersHorizontal } from 'lucide-react';
import { SMART_PROMPT_OPTIONS, readSmartPromptChangeStrength, type SmartPromptChangeStrength, type SmartPromptMode } from '../../promptTemplates/intelligentPromptTemplates';
import { GenerationConfig } from '../../types';

type SmartPromptField = 'buildingType' | 'spaceType' | 'renderStyle' | 'smartMaterial' | 'lighting' | 'changeStrength';

interface SmartPromptAssistantProps {
  mode: SmartPromptMode;
  config: GenerationConfig;
  fields?: SmartPromptField[];
  compact?: boolean;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
}

const defaultFields: SmartPromptField[] = ['buildingType', 'spaceType', 'renderStyle', 'smartMaterial', 'lighting', 'changeStrength'];

export function SmartPromptAssistant({
  mode,
  config,
  fields = defaultFields,
  compact = false,
  onUpdateConfig,
}: SmartPromptAssistantProps) {
  const selectedStrength = readSmartPromptChangeStrength(config, mode);
  const visibleFields = fields.filter(field => field !== 'changeStrength');

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">智能提示词助手</p>
          <p className="mt-0.5 text-[11px] leading-5 text-slate-500">选择参数即可生成内部提示词，输入框只作为额外补充。</p>
        </div>
      </div>

      {visibleFields.length > 0 ? (
        <div className={`grid gap-2 ${compact ? 'grid-cols-1' : 'sm:grid-cols-2'}`}>
          {fields.includes('buildingType') ? (
            <SelectField
              label="建筑类型"
              value={config.buildingType || '自动判断'}
              options={SMART_PROMPT_OPTIONS.buildingTypes}
              onChange={value => onUpdateConfig({ buildingType: value })}
            />
          ) : null}
          {fields.includes('spaceType') ? (
            <SelectField
              label="空间类型"
              value={config.spaceType || '自动判断'}
              options={SMART_PROMPT_OPTIONS.spaceTypes}
              onChange={value => onUpdateConfig({ spaceType: value })}
            />
          ) : null}
          {fields.includes('renderStyle') ? (
            <SelectField
              label="风格"
              value={config.renderStyle || config.style || '自动判断'}
              options={SMART_PROMPT_OPTIONS.styles}
              onChange={value => onUpdateConfig({ renderStyle: value, style: value })}
            />
          ) : null}
          {fields.includes('smartMaterial') ? (
            <SelectField
              label="材质"
              value={config.smartMaterial || '自动判断'}
              options={SMART_PROMPT_OPTIONS.materials}
              onChange={value => onUpdateConfig({ smartMaterial: value })}
            />
          ) : null}
          {fields.includes('lighting') ? (
            <SelectField
              label="灯光"
              value={config.atmosphere || config.lighting || '自动匹配'}
              options={SMART_PROMPT_OPTIONS.lighting}
              onChange={value => onUpdateConfig({ lighting: value, atmosphere: value })}
            />
          ) : null}
        </div>
      ) : null}

      {fields.includes('changeStrength') ? (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">改动强度</p>
          <div className="grid grid-cols-3 gap-2">
            {SMART_PROMPT_OPTIONS.changeStrengths.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => onUpdateConfig(buildStrengthPatch(mode, option.value))}
                className={`rounded-lg border px-2 py-2 text-left transition-colors ${
                  selectedStrength === option.value
                    ? 'border-blue-500 bg-blue-50 text-blue-800'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span className="block text-xs font-bold">{option.label}</span>
                <span className="mt-1 block text-[10px] leading-4">{option.desc}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
      <select
        value={value}
        onChange={event => onChange(event.currentTarget.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-300"
      >
        {options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function buildStrengthPatch(mode: SmartPromptMode, value: SmartPromptChangeStrength): Partial<GenerationConfig> {
  const base: Partial<GenerationConfig> = { changeStrength: value };
  if (mode === 'panorama-roam-render') return { ...base, panoramaChangeStrength: value };
  if (mode === 'inpaint') return { ...base, inpaintingStrength: value, strength: value };
  if (mode === 'material-replace') {
    return {
      ...base,
      strength: value === 'weak' ? 'subtle' : value === 'strong' ? 'strong' : 'balanced',
    };
  }
  return { ...base, strength: value === 'weak' ? 'subtle' : value === 'strong' ? 'strong' : 'balanced' };
}
