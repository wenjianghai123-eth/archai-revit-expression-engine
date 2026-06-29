import { AlertCircle, Upload, X } from 'lucide-react';
import { GenerationConfig, GenerationStep, UploadedImage } from '../../types';
import { UploadErrors, UploadTarget } from './workspaceTypes';
import { getUploadedImageSrc, isLocalInpaintingStep, modeLabel } from './workspaceUtils';
import { FurnitureReferencesPanel } from './ReferenceImagesPanel';
import { AspectRatioImage } from '../common/AspectRatioImage';

interface InputImagePanelProps {
  step: GenerationStep;
  inputImage: UploadedImage | null;
  materialImage: UploadedImage | null;
  config: GenerationConfig;
  uploadErrors: UploadErrors;
  showMaterialUpload: boolean;
  showFurnitureReferences: boolean;
  furnitureReferences: Parameters<typeof FurnitureReferencesPanel>[0]['references'];
  onUploadClick: (target: UploadTarget) => void;
  onUpdateInputImage: (image: UploadedImage | null) => void;
  onUpdateMaterialImage: (image: UploadedImage | null) => void;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
  onRemoveFurnitureReference: (id: string) => void;
  onFileDrop: (target: UploadTarget, files: FileList) => void;
}

export function InputImagePanel({
  step,
  inputImage,
  materialImage,
  config,
  uploadErrors,
  showMaterialUpload,
  showFurnitureReferences,
  furnitureReferences,
  onUploadClick,
  onUpdateInputImage,
  onUpdateMaterialImage,
  onUpdateConfig,
  onRemoveFurnitureReference,
  onFileDrop,
}: InputImagePanelProps) {
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <span className="workspace-section-title">素材上传</span>
        <span className="rounded bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-600">{modeLabel(step)}</span>
      </div>

      <div className="space-y-5">
        <UploadField
          target="input"
          image={inputImage}
          title={isLocalInpaintingStep(step) ? '原始图片' : '输入图片'}
          uploadErrors={uploadErrors}
          onUploadClick={onUploadClick}
          onClear={() => onUpdateInputImage(null)}
          onFileDrop={onFileDrop}
        />
        <EditTargetControls step={step} config={config} onUpdateConfig={onUpdateConfig} />
        {showFurnitureReferences ? (
          <FurnitureReferencesPanel
            references={furnitureReferences}
            uploadErrors={uploadErrors}
            onUploadFurniture={() => onUploadClick('furniture')}
            onRemoveFurnitureReference={onRemoveFurnitureReference}
          />
        ) : null}
        {showMaterialUpload ? (
          <UploadField
            target="material"
            image={materialImage}
            title="参考图 / 材质图"
            optional
            uploadErrors={uploadErrors}
            onUploadClick={onUploadClick}
            onClear={() => onUpdateMaterialImage(null)}
            onFileDrop={onFileDrop}
          />
        ) : null}
      </div>
    </>
  );
}

interface UploadFieldProps {
  target: UploadTarget;
  image: UploadedImage | null;
  title: string;
  optional?: boolean;
  uploadErrors: UploadErrors;
  onUploadClick: (target: UploadTarget) => void;
  onClear: () => void;
  onFileDrop: (target: UploadTarget, files: FileList) => void;
}

function UploadField({ target, image, title, optional = false, uploadErrors, onUploadClick, onClear, onFileDrop }: UploadFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{title}</label>
        {optional && <span className="text-[10px] font-bold text-slate-300">可选</span>}
      </div>
      <button
        type="button"
        onClick={() => onUploadClick(target)}
        onDragOver={event => event.preventDefault()}
        onDrop={event => {
          event.preventDefault();
          if (event.dataTransfer.files.length > 0) onFileDrop(target, event.dataTransfer.files);
        }}
        className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400 transition hover:border-blue-200 hover:bg-blue-50/40"
      >
        {image ? (
          <>
            <AspectRatioImage
              src={getUploadedImageSrc(image)}
              alt={image.name}
              className="h-full border-0 rounded-none shadow-none"
              enableLightbox={false}
            />
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                onClear();
              }}
              className="absolute right-2 top-2 rounded-full bg-white/90 p-1 text-slate-500 shadow hover:text-red-600"
            >
              <X className="h-4 w-4" />
            </span>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-xs font-bold">
            <Upload className="h-7 w-7" />
            <span>点击上传或拖拽图片到此处</span>
            <span className="text-[10px] font-semibold text-slate-400">PNG / JPG / WEBP</span>
          </div>
        )}
      </button>
      {uploadErrors[target] && (
        <p className="flex items-center gap-1 text-[11px] font-medium text-red-600">
          <AlertCircle className="h-3.5 w-3.5" />
          {uploadErrors[target]}
        </p>
      )}
    </div>
  );
}

interface EditTargetControlsProps {
  step: GenerationStep;
  config: GenerationConfig;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
}

function EditTargetControls({ step, config, onUpdateConfig }: EditTargetControlsProps) {
  if (!isLocalInpaintingStep(step)) return null;
  const options: Array<{ value: NonNullable<GenerationConfig['editTarget']>; label: string }> = [
    { value: 'general', label: '综合优化' },
    { value: 'material', label: '材质修改' },
    { value: 'furniture', label: '家具修改' },
  ];

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">修改类型</label>
      <div className="grid grid-cols-3 gap-2">
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            onClick={() => onUpdateConfig({ editTarget: option.value })}
            className={`rounded-lg border px-2 py-2 text-[10px] font-bold ${
              (config.editTarget || 'general') === option.value
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
