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
    <section data-testid="material-textures-panel" className="shrink-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
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

      {textures.length === 0 ? (
        <p data-testid="material-textures-empty-state" className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-semibold leading-5 text-slate-500">
          暂无材质贴图，可上传本地图片或从项目素材中选择。
        </p>
      ) : null}

      <div data-testid="material-texture-grid" className="material-texture-grid grid grid-cols-2 gap-2 pb-1.5 sm:grid-cols-3">
        {textures.map((texture, index) => {
          const textureName = texture.name || (texture.source === 'upload' ? '本地贴图' : '材质库');
          return (
            <article
              key={texture.id}
              className="group min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white/80 p-1.5 shadow-sm transition hover:border-blue-200 hover:shadow-md"
            >
              <AspectRatioImage
                src={texture.previewUrl || texture.thumbnailUrl || texture.publicUrl || texture.url || texture.dataUrl}
                alt={`${textureName} 预览`}
                ratio="4:3"
                fit="contain"
                className="rounded-md border-slate-100 bg-slate-100 shadow-none"
                imageClassName="p-0.5"
                placeholder="材质贴图预览"
              />
              {texture.uploadStatus === 'uploading' ? <p className="mt-1 text-[9px] font-bold text-blue-600">上传中 {texture.uploadProgress ?? 0}%</p> : null}
              {texture.uploadStatus === 'failed' ? <p className="mt-1 text-[9px] font-bold text-amber-600">上传失败，可重试</p> : null}
              <div className="mt-1.5 flex items-center justify-between gap-1.5">
                <div className="min-w-0">
                  <p className="text-[9px] font-black leading-3 text-blue-600">材质 {index + 1}</p>
                  <p className="truncate text-[10px] font-bold leading-4 text-slate-800" title={textureName}>{textureName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveMaterialTexture(texture.id)}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  title="删除材质贴图"
                  aria-label={`删除${textureName}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </article>
          );
        })}
        {Array.from({ length: maxMaterialTextures - textures.length }).map((_, index) => (
          <button
            key={`empty-texture-${index}`}
            type="button"
            onClick={onUploadTexture}
            className="flex min-h-24 min-w-0 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-2 py-2.5 text-center text-slate-400 transition hover:border-blue-200 hover:bg-blue-50/50 hover:text-blue-600"
            title="上传材质贴图"
          >
            <Upload className="h-4 w-4" />
            <span className="mt-1 text-[10px] font-black leading-4 text-slate-700">上传贴图</span>
            <span className="mt-0.5 text-[9px] font-semibold leading-3 text-slate-400">PNG/JPG/WEBP</span>
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
            <AspectRatioImage src={reference.previewUrl || reference.thumbnailUrl || reference.publicUrl || reference.url || reference.dataUrl} alt={reference.name || '家具参考图'} className="h-full rounded-none border-0 shadow-none" />
            {reference.uploadStatus === 'uploading' ? (
              <span className="absolute bottom-1 left-1 rounded bg-slate-950/70 px-1.5 py-0.5 text-[9px] font-bold text-white">{reference.uploadProgress ?? 0}%</span>
            ) : null}
            {reference.uploadStatus === 'failed' ? (
              <span className="absolute bottom-1 left-1 rounded bg-amber-600 px-1.5 py-0.5 text-[9px] font-bold text-white">失败</span>
            ) : null}
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
