import { AlertCircle, BookOpen, Trash2, Upload } from 'lucide-react';
import { GenerationConfig, MaterialTexture, ReferenceImage } from '../../types';
import { UploadErrors } from './workspaceTypes';
import { AspectRatioImage } from '../common/AspectRatioImage';
import { maxFurnitureReferences, maxMaterialTextures, styleOptions } from './workspaceUtils';

interface MaterialTexturesPanelProps {
  textures: MaterialTexture[];
  uploadError: string | null;
  onUploadTexture: () => void;
  onOpenMaterialLibrary: () => void;
  onRemoveMaterialTexture: (id: string) => void;
  onTextureLimit: () => void;
}

export function MaterialTexturesPanel({
  textures,
  uploadError,
  onUploadTexture,
  onOpenMaterialLibrary,
  onRemoveMaterialTexture,
  onTextureLimit,
}: MaterialTexturesPanelProps) {
  const isFull = textures.length >= maxMaterialTextures;

  return (
    <section className="shrink-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold text-slate-800">材质贴图</h3>
          <p className="mt-0.5 text-[10px] font-medium text-slate-400">材质参考，最多 {maxMaterialTextures} 张</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onUploadTexture}
            disabled={isFull}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Upload className="h-3.5 w-3.5" />
            上传材质贴图
          </button>
          <button
            type="button"
            onClick={isFull ? onTextureLimit : onOpenMaterialLibrary}
            disabled={isFull}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            <BookOpen className="h-3.5 w-3.5" />
            打开材质库
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {textures.map(texture => (
          <div key={texture.id} className="group relative aspect-video overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            <AspectRatioImage src={texture.url} alt={texture.name || '材质贴图'} className="h-full rounded-none border-0 shadow-none" />
            <div className="absolute inset-x-0 bottom-0 bg-slate-900/70 px-2 py-1 text-[9px] font-bold text-white">
              <span className="block truncate">{texture.name || (texture.source === 'upload' ? '本地贴图' : '材质库')}</span>
            </div>
            <button
              type="button"
              onClick={() => onRemoveMaterialTexture(texture.id)}
              className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-slate-500 opacity-0 shadow transition hover:text-red-600 group-hover:opacity-100"
              title="删除材质贴图"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {Array.from({ length: maxMaterialTextures - textures.length }).map((_, index) => (
          <button
            key={`empty-texture-${index}`}
            type="button"
            onClick={onUploadTexture}
            className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-slate-300 transition hover:border-blue-200 hover:bg-blue-50/40 hover:text-blue-500"
            title="上传材质贴图"
          >
            <Upload className="h-5 w-5" />
          </button>
        ))}
      </div>

      {uploadError ? (
        <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-amber-600">
          <AlertCircle className="h-3.5 w-3.5" />
          {uploadError}
        </p>
      ) : null}
    </section>
  );
}

interface FurnitureReferencesPanelProps {
  references: ReferenceImage[];
  uploadErrors: UploadErrors;
  onUploadFurniture: () => void;
  onRemoveFurnitureReference: (id: string) => void;
}

export function FurnitureReferencesPanel({
  references,
  uploadErrors,
  onUploadFurniture,
  onRemoveFurnitureReference,
}: FurnitureReferencesPanelProps) {
  const isFull = references.length >= maxFurnitureReferences;

  return (
    <section className="shrink-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold text-slate-800">家具参考图</h3>
          <p className="mt-0.5 text-[10px] font-medium text-slate-400">参考家具类型、造型、比例与风格，最多 {maxFurnitureReferences} 张</p>
        </div>
        <button
          type="button"
          onClick={onUploadFurniture}
          disabled={isFull}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Upload className="h-3.5 w-3.5" />
          上传家具参考图
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {references.map(reference => (
          <div key={reference.id} className="group relative aspect-video overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            <AspectRatioImage src={reference.url} alt={reference.name || '家具参考图'} className="h-full rounded-none border-0 shadow-none" />
            <button
              type="button"
              onClick={() => onRemoveFurnitureReference(reference.id)}
              className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-slate-500 opacity-0 shadow transition hover:text-red-600 group-hover:opacity-100"
              title="删除家具参考图"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {uploadErrors.furniture ? (
        <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-amber-600">
          <AlertCircle className="h-3.5 w-3.5" />
          {uploadErrors.furniture}
        </p>
      ) : null}
    </section>
  );
}

interface StyleSelectorPanelProps {
  config: GenerationConfig;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
}

export function StyleSelectorPanel({ config, onUpdateConfig }: StyleSelectorPanelProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3">
        <h3 className="text-xs font-bold text-slate-800">风格选择</h3>
        <p className="mt-0.5 text-[10px] font-medium text-slate-400">选择当前渲染任务的空间表达方向。</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {styleOptions.map(style => (
          <button
            key={style}
            type="button"
            onClick={() => onUpdateConfig({ style })}
            className={`min-h-11 rounded-lg border px-2 text-left text-[10px] font-bold ${
              config.style === style ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            {style}
          </button>
        ))}
      </div>
    </section>
  );
}
