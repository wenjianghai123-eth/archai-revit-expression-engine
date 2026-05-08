import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Download,
  FileJson,
  Heart,
  Image as ImageIcon,
  RefreshCw,
  Settings2,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { GenerationConfig, GenerationProvider, GenerationStep, MaterialAsset, MaterialTexture, StepState, UploadedImage } from '../types';
import { createUploadedImage, validateImageFile } from '../utils/file';
import { downloadDataUrl, downloadJson } from '../utils/download';
import { uploadImageAsset } from '../lib/api';
import { MaskEditor } from './MaskEditor';
import { MaterialLibrary } from './MaterialLibrary';

interface WorkspaceProps {
  step: GenerationStep;
  state: StepState;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
  onUpdateInputImage: (image: UploadedImage | null) => void;
  onUpdateMaterialImage: (image: UploadedImage | null) => void;
  onUpdateMaterialTextures: (textures: MaterialTexture[]) => void;
  onUpdateMaskImage: (maskDataUrl: string | null, useFullImage: boolean, feather?: number) => void;
  onGenerate: () => void;
  onCancelGeneration: () => void;
  onSelectGenerationResult: (resultId: string) => void;
  onToggleGenerationFavorite: (resultId: string) => void;
  onSetViewMode: (viewMode: StepState['viewMode']) => void;
  onNextStep: () => void;
  onReset: () => void;
  backendProvider: GenerationProvider | null;
  creditBalance: number | null;
  estimatedCreditCost: number;
  isCreditsInsufficient: boolean;
}

type UploadTarget = 'input' | 'material' | 'texture';

const acceptedImageTypes = 'image/png,image/jpeg,image/webp';
const maxMaterialTextures = 3;
const styleOptions = ['现代主义', '极简风格', '北欧风格', '日式侘寂', '工业风格', '新中式'];

export function MainWorkspace({
  step,
  state,
  onUpdateConfig,
  onUpdateInputImage,
  onUpdateMaterialImage,
  onUpdateMaterialTextures,
  onUpdateMaskImage,
  onGenerate,
  onCancelGeneration,
  onSelectGenerationResult,
  onToggleGenerationFavorite,
  onSetViewMode,
  onNextStep,
  onReset,
  backendProvider,
  creditBalance,
  estimatedCreditCost,
  isCreditsInsufficient,
}: WorkspaceProps) {
  const inputFileRef = useRef<HTMLInputElement>(null);
  const materialFileRef = useRef<HTMLInputElement>(null);
  const materialTextureFileRef = useRef<HTMLInputElement>(null);
  const [uploadErrors, setUploadErrors] = useState<Record<UploadTarget, string | null>>({ input: null, material: null, texture: null });
  const [isMaterialLibraryOpen, setIsMaterialLibraryOpen] = useState(false);

  const hasMask = step !== GenerationStep.LocalInpainting || Boolean(state.maskImage) || state.useFullImageMask;
  const isFloorplanStep = step === GenerationStep.FloorplanTo3D;
  const isStyleRenderStep = step === GenerationStep.StyleRender;
  const canGenerate = Boolean(state.inputImage) && hasMask && !state.isGenerating && !isCreditsInsufficient;
  const providerForStatus = backendProvider || state.generationProvider;
  const resultOptions = state.generationResults.length > 0
    ? state.generationResults
    : state.outputImage
      ? [{ id: state.generationResultId || 'legacy-result', imageUrl: state.outputImage, isSelected: true, isFavorite: false }]
      : [];
  const selectedResult = resultOptions.find(result => result.id === state.selectedGenerationResultId)
    || resultOptions.find(result => result.isSelected)
    || resultOptions[0]
    || null;
  const previewImage = selectedResult?.imageUrl || state.outputImage;

  const handleUploadClick = (target: UploadTarget) => {
    if (target === 'input') inputFileRef.current?.click();
    else if (target === 'material') materialFileRef.current?.click();
    else materialTextureFileRef.current?.click();
  };

  const handleFileSelected = async (target: UploadTarget, fileList: FileList | null) => {
    if (target === 'texture') {
      await handleTextureFiles(fileList);
      return;
    }

    const file = fileList?.[0];
    if (!file) return;

    const validationError = validateImageFile(file);
    if (validationError) {
      setUploadErrors(prev => ({ ...prev, [target]: validationError }));
      return;
    }

    try {
      const localImage = await createUploadedImage(file);
      let image = localImage;

      try {
        const asset = await uploadImageAsset(file, file.name);
        image = { ...localImage, assetId: asset.id, url: asset.url };
      } catch {
        // Keep dataUrl fallback when backend upload is unavailable.
      }

      if (target === 'input') onUpdateInputImage(image);
      else onUpdateMaterialImage(image);
      setUploadErrors(prev => ({ ...prev, [target]: null }));
    } catch (error) {
      setUploadErrors(prev => ({
        ...prev,
        [target]: error instanceof Error ? error.message : '图片读取失败，请重试。',
      }));
    }
  };

  const handleTextureFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    const availableSlots = maxMaterialTextures - state.materialTextures.length;
    if (availableSlots <= 0) {
      setUploadErrors(prev => ({ ...prev, texture: `最多只能选择 ${maxMaterialTextures} 张材质贴图。` }));
      return;
    }

    const acceptedFiles = files.slice(0, availableSlots);
    if (files.length > availableSlots) {
      setUploadErrors(prev => ({ ...prev, texture: `已添加前 ${availableSlots} 张，材质贴图最多 ${maxMaterialTextures} 张。` }));
    } else {
      setUploadErrors(prev => ({ ...prev, texture: null }));
    }

    const nextTextures: MaterialTexture[] = [];
    for (const file of acceptedFiles) {
      const validationError = validateImageFile(file);
      if (validationError) {
        setUploadErrors(prev => ({ ...prev, texture: validationError }));
        continue;
      }

      const localImage = await createUploadedImage(file);
      let assetId: string | undefined;
      let url = localImage.dataUrl;

      try {
        const asset = await uploadImageAsset(file, file.name);
        assetId = asset.id;
        url = asset.url;
      } catch {
        // Keep the local preview when backend upload is unavailable.
      }

      nextTextures.push({
        id: `${localImage.id}-texture`,
        name: localImage.name,
        url,
        dataUrl: localImage.dataUrl,
        assetId,
        source: 'upload',
      });
    }

    if (nextTextures.length > 0) {
      onUpdateMaterialTextures([...state.materialTextures, ...nextTextures].slice(0, maxMaterialTextures));
    }
  };

  const handleSelectLibraryMaterial = (material: MaterialAsset) => {
    if (state.materialTextures.length >= maxMaterialTextures) {
      setUploadErrors(prev => ({ ...prev, texture: `最多只能选择 ${maxMaterialTextures} 张材质贴图。` }));
      return;
    }

    const alreadySelected = state.materialTextures.some(texture => texture.id === `library-${material.id}`);
    if (alreadySelected) {
      setUploadErrors(prev => ({ ...prev, texture: '这张材质已经在参考列表中。' }));
      return;
    }

    onUpdateMaterialTextures([
      ...state.materialTextures,
      {
        id: `library-${material.id}`,
        name: material.name,
        url: material.thumbnail,
        source: 'library',
      },
    ]);
    setUploadErrors(prev => ({ ...prev, texture: null }));
    setIsMaterialLibraryOpen(false);
  };

  const handleRemoveMaterialTexture = (id: string) => {
    onUpdateMaterialTextures(state.materialTextures.filter(texture => texture.id !== id));
    setUploadErrors(prev => ({ ...prev, texture: null }));
  };

  const renderUpload = (target: UploadTarget, image: UploadedImage | null, title: string, optional = false) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{title}</label>
        {optional && <span className="text-[10px] font-bold text-slate-300">可选</span>}
      </div>
      <button
        type="button"
        onClick={() => handleUploadClick(target)}
        className="relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400 transition hover:border-blue-200 hover:bg-blue-50/40"
      >
        {image ? (
          <>
            <img src={getUploadedImageSrc(image)} alt={image.name} className="h-full w-full object-contain" referrerPolicy="no-referrer" />
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                if (target === 'input') onUpdateInputImage(null);
                else onUpdateMaterialImage(null);
              }}
              className="absolute right-2 top-2 rounded-full bg-white/90 p-1 text-slate-500 shadow hover:text-red-600"
            >
              <X className="h-4 w-4" />
            </span>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-xs font-bold">
            <Upload className="h-7 w-7" />
            点击上传 PNG / JPG / WEBP
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

  const renderMaterialTextures = () => {
    const isFull = state.materialTextures.length >= maxMaterialTextures;

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
              onClick={() => handleUploadClick('texture')}
              disabled={isFull}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Upload className="h-3.5 w-3.5" />
              上传材质贴图
            </button>
            <button
              type="button"
              onClick={() => {
                if (isFull) {
                  setUploadErrors(prev => ({ ...prev, texture: `最多只能选择 ${maxMaterialTextures} 张材质贴图。` }));
                  return;
                }
                setIsMaterialLibraryOpen(true);
              }}
              disabled={isFull}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              <BookOpen className="h-3.5 w-3.5" />
              打开材质库
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {state.materialTextures.map(texture => (
            <div key={texture.id} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              <img src={texture.url} alt={texture.name || '材质贴图'} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              <div className="absolute inset-x-0 bottom-0 bg-slate-900/70 px-2 py-1 text-[9px] font-bold text-white">
                <span className="block truncate">{texture.name || (texture.source === 'upload' ? '本地贴图' : '材质库')}</span>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveMaterialTexture(texture.id)}
                className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-slate-500 opacity-0 shadow transition hover:text-red-600 group-hover:opacity-100"
                title="删除材质贴图"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {Array.from({ length: maxMaterialTextures - state.materialTextures.length }).map((_, index) => (
            <button
              key={`empty-texture-${index}`}
              type="button"
              onClick={() => handleUploadClick('texture')}
              className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-slate-300 transition hover:border-blue-200 hover:bg-blue-50/40 hover:text-blue-500"
              title="上传材质贴图"
            >
              <Upload className="h-5 w-5" />
            </button>
          ))}
        </div>

        {uploadErrors.texture ? (
          <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-amber-600">
            <AlertCircle className="h-3.5 w-3.5" />
            {uploadErrors.texture}
          </p>
        ) : null}
      </section>
    );
  };

  const renderPreview = () => {
    if (!previewImage && !state.isGenerating) {
      return (
        <div className="flex h-full flex-col items-center justify-center bg-slate-50 text-center text-slate-400">
          <ImageIcon className="mb-4 h-10 w-10 opacity-40" />
          <h3 className="text-base font-bold text-slate-800">暂无生成结果</h3>
          <p className="mt-2 max-w-sm text-sm">上传图片并点击生成后，结果会显示在这里。</p>
        </div>
      );
    }

    if (state.isGenerating) {
      return (
        <div className="flex h-full flex-col items-center justify-center bg-white/80 text-blue-600">
          <RefreshCw className="mb-3 h-8 w-8 animate-spin" />
          <p className="text-sm font-bold">正在生成预览...</p>
          <p className="mt-2 text-xs text-slate-500">{state.generationProgress}%</p>
        </div>
      );
    }

    if (state.viewMode === 'original' && state.inputImage) {
      return <img src={getUploadedImageSrc(state.inputImage)} alt="原图" className="h-full w-full object-contain bg-white" referrerPolicy="no-referrer" />;
    }

    if (state.viewMode === 'compare' && state.inputImage && previewImage) {
      return (
        <div className="grid h-full w-full grid-cols-2 bg-white">
          <img src={getUploadedImageSrc(state.inputImage)} alt="原图" className="h-full w-full border-r border-slate-200 object-contain" referrerPolicy="no-referrer" />
          <img src={previewImage} alt="结果图" className="h-full w-full object-contain" referrerPolicy="no-referrer" />
        </div>
      );
    }

    return <img src={previewImage || ''} alt="生成结果" className="h-full w-full object-contain bg-white" referrerPolicy="no-referrer" />;
  };

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-slate-100">
      <input
        ref={inputFileRef}
        type="file"
        accept={acceptedImageTypes}
        className="hidden"
        onChange={event => {
          void handleFileSelected('input', event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />
      <input
        ref={materialFileRef}
        type="file"
        accept={acceptedImageTypes}
        className="hidden"
        onChange={event => {
          void handleFileSelected('material', event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />
      <input
        ref={materialTextureFileRef}
        type="file"
        accept={acceptedImageTypes}
        multiple
        className="hidden"
        onChange={event => {
          void handleTextureFiles(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />

      {step === GenerationStep.LocalInpainting ? (
        <>
          <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white p-4 custom-scrollbar">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">输入配置</span>
              <span className="rounded bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-600">{modeLabel(step)}</span>
            </div>

            <div className="space-y-5">
              {renderUpload('input', state.inputImage, '原始图片')}

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">方案数量</label>
                <div className="grid grid-cols-3 gap-2">
                  {([1, 2, 4] as const).map(count => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => onUpdateConfig({ batchCount: count })}
                      className={`rounded-lg border px-3 py-2 text-[10px] font-bold ${
                        (state.config.batchCount || 1) === count
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-white text-slate-500'
                      }`}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">提示词</label>
                <textarea
                  value={state.config.prompt}
                  onChange={event => onUpdateConfig({ prompt: event.target.value })}
                  className="h-36 w-full resize-none rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs leading-5 text-blue-950 outline-none focus:border-blue-300"
                  placeholder="描述希望生成或局部重绘的效果..."
                />
              </div>

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
                          (state.config.strength || state.config.inpaintingStrength) === value
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
                    checked={Boolean(state.config.preserveStructure ?? state.config.keepOriginalMaterial)}
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
                    <span>{state.config.feather ?? 0}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="30"
                    step="1"
                    value={state.config.feather ?? 0}
                    onChange={event => onUpdateConfig({ feather: Number(event.target.value) })}
                    className="w-full accent-blue-600"
                  />
                </div>
              </div>
            </div>
          </aside>

          <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white/70 px-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">局部 mask 编辑</span>
                <p className="text-xs font-medium text-slate-500">上传参考图后，在大画布上涂抹需要重绘的区域。</p>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{providerForStatus || 'provider 待连接'}</span>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 custom-scrollbar">
              <div className="flex min-h-[360px] flex-1 lg:min-h-[560px] lg:h-[60vh]">
                {state.inputImage ? (
                  <MaskEditor
                    imageDataUrl={state.inputImage.dataUrl}
                    imageName={state.inputImage.name}
                    maskImageDataUrl={state.maskImage?.dataUrl || null}
                    useFullImage={state.useFullImageMask}
                    onMaskChange={onUpdateMaskImage}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => handleUploadClick('input')}
                    className="flex min-h-[360px] w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-white text-slate-400 transition hover:border-blue-200 hover:bg-blue-50/40"
                  >
                    <Upload className="mb-3 h-9 w-9" />
                    <span className="text-sm font-bold text-slate-700">上传参考图开始局部修饰</span>
                    <span className="mt-1 text-xs font-medium">PNG / JPG / WEBP</span>
                  </button>
                )}
              </div>

              {renderMaterialTextures()}
            </div>
          </main>
        </>
      ) : (
        <>

      <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white p-4 custom-scrollbar">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">输入配置</span>
          <span className="rounded bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-600">{modeLabel(step)}</span>
        </div>

        <div className="space-y-5">
          {renderUpload('input', state.inputImage, isLocalInpaintingStep(step) ? '原始图片' : '输入图片')}
          {!isLocalInpaintingStep(step) && renderUpload('material', state.materialImage, '参考图 / 材质图', true)}
          {isFloorplanStep && renderMaterialTextures()}

          {isLocalInpaintingStep(step) && state.inputImage && (
            <MaskEditor
              imageDataUrl={state.inputImage.dataUrl}
              imageName={state.inputImage.name}
              maskImageDataUrl={state.maskImage?.dataUrl || null}
              useFullImage={state.useFullImageMask}
              onMaskChange={onUpdateMaskImage}
            />
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">方案数量</label>
            <div className="grid grid-cols-3 gap-2">
              {([1, 2, 4] as const).map(count => (
                <button
                  key={count}
                  type="button"
                  onClick={() => onUpdateConfig({ batchCount: count })}
                  className={`rounded-lg border px-3 py-2 text-[10px] font-bold ${
                    (state.config.batchCount || 1) === count
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-500'
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {isFloorplanStep ? '额外补充说明' : '提示词'}
            </label>
            {isFloorplanStep ? (
              <p className="text-[11px] leading-5 text-slate-400">系统已内置专业彩平生成提示词，你只需要补充特殊要求。</p>
            ) : null}
            <textarea
              value={state.config.prompt}
              onChange={event => onUpdateConfig({ prompt: event.target.value })}
              className="h-28 w-full resize-none rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs leading-5 text-blue-950 outline-none focus:border-blue-300"
              placeholder={isFloorplanStep
                ? '可选：补充色彩、材质、表达风格、重点区域等要求。例如：强化景观铺装层次，住宅区域使用暖色系。'
                : '描述希望生成或局部重绘的效果...'}
            />
          </div>

          {isStyleRenderStep && (
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">风格</label>
              <div className="grid grid-cols-2 gap-2">
                {styleOptions.map(style => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => onUpdateConfig({ style })}
                    className={`min-h-11 rounded-lg border px-2 text-left text-[10px] font-bold ${
                      state.config.style === style ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500'
                    }`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isLocalInpaintingStep(step) && (
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
                        (state.config.strength || state.config.inpaintingStrength) === value
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
                  checked={Boolean(state.config.preserveStructure ?? state.config.keepOriginalMaterial)}
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
                  <span>{state.config.feather ?? 0}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="30"
                  step="1"
                  value={state.config.feather ?? 0}
                  onChange={event => onUpdateConfig({ feather: Number(event.target.value) })}
                  className="w-full accent-blue-600"
                />
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 items-center justify-between border-b border-slate-200 bg-white/70 px-4">
          <div className="flex overflow-hidden rounded-lg bg-slate-200 p-0.5">
            {(['after', 'original', 'compare'] as const).map(viewMode => (
              <button
                key={viewMode}
                type="button"
                onClick={() => onSetViewMode(viewMode)}
                disabled={viewMode === 'compare' && (!state.outputImage || !state.inputImage)}
                className={`rounded-md px-4 py-1.5 text-[10px] font-bold uppercase disabled:opacity-40 ${
                  state.viewMode === viewMode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                {viewMode === 'after' ? '结果图' : viewMode === 'original' ? '原图' : '对比'}
              </button>
            ))}
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{providerForStatus || 'provider 待连接'}</span>
        </div>

        <div className="min-h-0 flex-1 p-5">
          <div className="h-full overflow-hidden rounded border border-slate-200 bg-white shadow-2xl">
            {renderPreview()}
          </div>
        </div>
      </main>
        </>
      )}

      <aside className="flex w-96 shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white p-4 custom-scrollbar">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">输出 / 状态</span>
            <p className="mt-1 text-xs text-slate-500">{state.generationJobStatus || state.generationStatus}</p>
          </div>
          <Settings2 className="h-4 w-4 text-slate-300" />
        </div>

        <div className="space-y-4">
          <div className={`rounded-xl border p-3 ${isCreditsInsufficient ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-slate-50'}`}>
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <span>Credits</span>
              <span>{creditBalance === null ? '读取中' : `${creditBalance} credits`}</span>
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-700">本次预计消耗 {estimatedCreditCost} credits</p>
            {isCreditsInsufficient ? (
              <div className="mt-3 rounded-lg bg-white/80 p-3 text-xs leading-5 text-amber-800">
                剩余额度不足，暂不能创建生成任务。商业化版本会在这里接入升级套餐和充值入口。
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between text-[10px] font-bold text-slate-500">
              <span>{state.generationJobId || 'legacy fallback'}</span>
              <span>{state.generationProgress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${Math.min(100, Math.max(0, state.generationProgress))}%` }} />
            </div>
            {state.isGenerating && state.generationJobId && (
              <button type="button" onClick={onCancelGeneration} className="mt-3 w-full rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
                取消任务
              </button>
            )}
          </div>

          {previewImage ? (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <img src={previewImage} alt="当前结果" className="h-32 w-full object-contain" referrerPolicy="no-referrer" />
              </div>
              {resultOptions.length > 1 && (
                <div className="grid grid-cols-2 gap-2">
                  {resultOptions.map((result, index) => (
                    <button
                      key={result.id}
                      type="button"
                      onClick={() => onSelectGenerationResult(result.id)}
                      className={`relative overflow-hidden rounded-lg border bg-white ${result.id === selectedResult?.id ? 'border-blue-600 ring-2 ring-blue-100' : 'border-slate-200'}`}
                    >
                      <img src={result.imageUrl} alt={`方案 ${index + 1}`} className="h-20 w-full object-cover" referrerPolicy="no-referrer" />
                      <span className="absolute left-1 top-1 rounded bg-white/90 px-1.5 py-0.5 text-[9px] font-bold text-slate-700">方案 {index + 1}</span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={event => {
                          event.stopPropagation();
                          onToggleGenerationFavorite(result.id);
                        }}
                        onKeyDown={event => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            onToggleGenerationFavorite(result.id);
                          }
                        }}
                        className={`absolute bottom-1 right-1 rounded-full bg-white/90 p-1 ${result.isFavorite ? 'text-rose-600' : 'text-slate-400'}`}
                        title={result.isFavorite ? '取消收藏' : '收藏方案'}
                      >
                        <Heart className={`h-3.5 w-3.5 ${result.isFavorite ? 'fill-current' : ''}`} />
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => downloadDataUrl(previewImage, `archai-result-${Date.now()}.${getDataUrlExtension(previewImage)}`)}
                  className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm ring-1 ring-slate-100 hover:text-blue-700"
                >
                  <Download className="mr-1 inline h-3.5 w-3.5" />
                  下载图片
                </button>
                <button
                  type="button"
                  onClick={() => downloadJson({
                    exportedAt: new Date().toISOString(),
                    step,
                    provider: state.generationProvider,
                    prompt: state.config.prompt,
                    config: state.config,
                    result: {
                      id: state.generationResultId,
                      imageDataUrl: previewImage,
                      warnings: state.generationWarnings,
                    },
                  }, `archai-project-${Date.now()}.json`)}
                  className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm ring-1 ring-slate-100 hover:text-blue-700"
                >
                  <FileJson className="mr-1 inline h-3.5 w-3.5" />
                  导出 JSON
                </button>
              </div>
            </div>
          ) : (
            <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center text-slate-400">
              <ImageIcon className="mb-2 h-7 w-7 opacity-40" />
              <p className="text-xs font-medium">生成结果会显示在这里</p>
            </div>
          )}

          {state.generationWarnings.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-amber-700">Provider 能力提示</p>
              {state.generationWarnings.map(warning => (
                <p key={warning} className="text-xs leading-5 text-amber-800">{warning}</p>
              ))}
            </div>
          )}

          {state.generationError && (
            <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-xs leading-5 text-red-700">
              {state.generationError}
              <button type="button" onClick={onGenerate} className="mt-2 block rounded bg-white px-2 py-1 text-[10px] font-bold text-red-600">
                重试
              </button>
            </div>
          )}

          {state.generationLogs.length > 0 && (
            <div className="max-h-28 overflow-y-auto rounded-xl bg-slate-50 p-3 font-mono text-[10px] text-slate-500 custom-scrollbar">
              {state.generationLogs.map((log, index) => <div key={`${log}-${index}`}>{log}</div>)}
            </div>
          )}
        </div>

        <div className="mt-auto grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={onReset} disabled={state.isGenerating} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-500 disabled:opacity-40">
            重置
          </button>
          <button
            type="button"
            onClick={previewImage ? onNextStep : onGenerate}
            disabled={!canGenerate && !previewImage}
            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {state.isGenerating ? <RefreshCw className="mx-auto h-4 w-4 animate-spin" /> : previewImage ? '完成并导出' : <><Zap className="mr-1 inline h-4 w-4 text-blue-300" />生成预览</>}
          </button>
        </div>
      </aside>
      <MaterialLibrary
        isOpen={isMaterialLibraryOpen}
        onClose={() => setIsMaterialLibraryOpen(false)}
        onSelect={handleSelectLibraryMaterial}
        selectedId={state.materialTextures.find(texture => texture.source === 'library')?.id.replace(/^library-/u, '')}
      />
    </div>
  );
}

function modeLabel(step: GenerationStep): string {
  if (step === GenerationStep.FloorplanTo3D) return '平面生成';
  if (step === GenerationStep.StyleRender) return '风格渲染';
  return '局部重绘';
}

function isLocalInpaintingStep(step: GenerationStep): boolean {
  return step === GenerationStep.LocalInpainting;
}

function getUploadedImageSrc(image: UploadedImage): string {
  return image.url || image.dataUrl;
}

function getDataUrlExtension(dataUrl: string): string {
  const mimeType = /^data:([^;,]+)/u.exec(dataUrl)?.[1];
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/svg+xml') return 'svg';
  return 'png';
}
