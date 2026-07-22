import type { FloorPlanExpressionMode, FloorPlanTextLanguage, GenerationConfig } from '../../types';
import {
  buildFloorPlanExpressionModePatch,
  floorPlanExpressionModes,
  floorPlanTextLanguageOptions,
  resolveFloorPlanExpressionMode,
} from '../../utils/floorPlanExpression';

interface Props {
  config: GenerationConfig;
  onUpdateConfig: (patch: Partial<GenerationConfig>) => void;
  compact?: boolean;
}

export function FloorPlanExpressionModeSelector({ config, onUpdateConfig, compact = false }: Props) {
  const activeMode = resolveFloorPlanExpressionMode(config);
  const textLanguage: FloorPlanTextLanguage = config.floorPlanTextLanguage || 'zh-CN';

  const selectMode = (mode: FloorPlanExpressionMode) => {
    onUpdateConfig(buildFloorPlanExpressionModePatch(mode, config));
  };

  const selectTextLanguage = (language: FloorPlanTextLanguage) => {
    onUpdateConfig(language === 'none'
      ? { floorPlanTextLanguage: language, enableLegend: false, enableAreaText: false, enableMaterialLegend: false, enableRoomLabels: false }
      : { floorPlanTextLanguage: language });
  };

  return (
    <div className="space-y-3">
      <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-4'}`}>
        {floorPlanExpressionModes.map(mode => (
          <button key={mode.value} type="button" onClick={() => selectMode(mode.value)} className={`min-w-0 rounded-xl border p-3 text-left transition ${activeMode === mode.value ? 'border-blue-500 bg-blue-50 text-blue-900 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200'}`}>
            <span className="block text-xs font-black">{mode.label}</span>
            {!compact ? <span className="mt-1 block text-[11px] leading-5 opacity-75">{mode.description}</span> : null}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-500">文字语言</span>
        {floorPlanTextLanguageOptions.map(option => (
          <button key={option.value} type="button" onClick={() => selectTextLanguage(option.value)} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${textLanguage === option.value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
