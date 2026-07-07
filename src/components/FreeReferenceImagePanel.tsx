import { Download, ExternalLink, ImagePlus, Loader2, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { FreeReferenceReference, FreeReferenceRole, FreeReferenceStrength, GenerationConfig, GenerationRunStateOverride, GenerationStep, ResultSendTargetStep, StepState, UploadedImage } from '../types';
import { uploadImageAsset } from '../lib/api';
import { createUploadedImage, validateImageFile } from '../utils/file';
import { buildResultImageFilename, downloadAsset, downloadFallbackMessage } from '../utils/downloadAsset';
import { formatResultDimensions, getOriginalResultAssetId, getOriginalResultImageUrl } from '../utils/resultImage';
import { resolveAssetUrl } from '../utils/assetUrl';
import { ResultSendActions } from './workspace/SecondaryEditActions';
import { AspectRatioImage } from './common/AspectRatioImage';
import { GenerationImageViewer } from './common/GenerationImageViewer';
import { IMAGE_UPLOAD_ACCEPT } from '../utils/imageValidation';

type UploadKind = 'source' | 'reference';

interface FreeReferenceImagePanelProps {
  state: StepState;
  projectName?: string | null;
  onUpdateInputImage: (image: UploadedImage | null) => void;
  onUpdateMaterialImage: (image: UploadedImage | null) => void;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
  onGenerate: (stateOverride?: GenerationRunStateOverride) => void;
  onSendResultToStep?: (resultId: string, targetStep: ResultSendTargetStep) => void;
}

const resolutionOptions = [1024, 1536, 2048] as const;
const aspectRatioOptions = ['16:9'] as const;
const maxReferenceImages = 6;
const referenceRoleOptions: Array<{ value: FreeReferenceRole; label: string }> = [
  { value: 'style', label: '风格参考' },
  { value: 'material', label: '材质参考' },
  { value: 'furniture', label: '家具参考' },
  { value: 'lighting', label: '灯光参考' },
  { value: 'composition', label: '构图参考' },
  { value: 'color', label: '色彩参考' },
  { value: 'detail', label: '细节参考' },
];
const referenceStrengthOptions: Array<{ value: FreeReferenceStrength; label: string }> = [
  { value: 'low', label: '弱' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '强' },
];

interface FreeReferenceDraftSetting {
  role: FreeReferenceRole;
  strength: FreeReferenceStrength;
}

export function FreeReferenceImagePanel({
  state,
  projectName,
  onUpdateInputImage,
  onUpdateMaterialImage,
  onUpdateConfig,
  onGenerate,
  onSendResultToStep,
}: FreeReferenceImagePanelProps) {
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const [referenceImages, setReferenceImages] = useState<UploadedImage[]>(() => state.materialImage ? [state.materialImage] : []);
  const [referenceSettings, setReferenceSettings] = useState<FreeReferenceDraftSetting[]>(() => buildInitialReferenceSettings(
    state.materialImage ? [state.materialImage] : [],
    state.config.freeReferenceReferences,
  ));
  const [uploadErrors, setUploadErrors] = useState<Record<UploadKind, string | null>>({ source: null, reference: null });
  const [isPreparing, setIsPreparing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [generationMessage, setGenerationMessage] = useState<string | null>(null);

  const sourceImage = state.inputImage;
  const prompt = state.config.prompt || '';
  const resolution = state.config.freeReferenceResolution || 1024;
  const aspectRatio = '16:9' as const;
  const selectedResult = state.generationResults.find(result => result.isSelected) || state.generationResults[0];
  const originalResultImage = getOriginalResultImageUrl(selectedResult, state.outputImage);
  const originalResultAssetId = getOriginalResultAssetId(selectedResult);
  const resultDimensionsText = formatResultDimensions(selectedResult);
  const disabledReason = readGenerateDisabledReason({
    sourceImage,
    prompt,
    isGenerating: state.isGenerating,
    isPreparing,
  });

  const handleUpload = async (kind: UploadKind, files: FileList | null) => {
    const selectedFiles = Array.from(files || []);
    if (selectedFiles.length === 0) return;

    if (kind === 'source') {
      const file = selectedFiles[0];
      const validation = validateImageFile(file, 'free-reference:source');
      if (validation) {
        setUploadErrors(prev => ({ ...prev, source: validation }));
        return;
      }
      const image = await createUploadedImage(file);
      setUploadErrors(prev => ({ ...prev, source: null }));
      setGenerationMessage(null);
      onUpdateInputImage(image);
      return;
    }

    const remainingSlots = maxReferenceImages - referenceImages.length;
    if (remainingSlots <= 0) {
      setUploadErrors(prev => ({ ...prev, reference: `参考图最多上传 ${maxReferenceImages} 张。` }));
      return;
    }

    const acceptedFiles = selectedFiles.slice(0, remainingSlots);
    const invalidMessage = acceptedFiles.map(file => validateImageFile(file, 'free-reference:reference')).find(Boolean);
    if (invalidMessage) {
      setUploadErrors(prev => ({ ...prev, reference: invalidMessage }));
      return;
    }

    const images = await Promise.all(acceptedFiles.map(file => createUploadedImage(file)));
    const nextImages = [...referenceImages, ...images].slice(0, maxReferenceImages);
    const nextSettings = [
      ...referenceSettings,
      ...images.map(() => createDefaultReferenceSetting()),
    ].slice(0, maxReferenceImages);
    const referenceImageAssetIds = nextImages
      .map(image => image.assetId)
      .filter((assetId): assetId is string => Boolean(assetId));
    setReferenceImages(nextImages);
    setReferenceSettings(nextSettings);
    onUpdateMaterialImage(nextImages[0] || null);
    onUpdateConfig({
      referenceImageAssetIds: referenceImageAssetIds,
      referenceImageAssetId: referenceImageAssetIds[0],
      freeReferenceReferences: buildFreeReferenceReferences(nextImages, nextSettings),
    });
    setGenerationMessage(null);
    setUploadErrors(prev => ({
      ...prev,
      reference: selectedFiles.length > remainingSlots ? `已添加前 ${remainingSlots} 张，参考图最多 ${maxReferenceImages} 张。` : null,
    }));
  };

  const removeReferenceImage = (index: number) => {
    const nextImages = referenceImages.filter((_, itemIndex) => itemIndex !== index);
    const nextSettings = referenceSettings.filter((_, itemIndex) => itemIndex !== index);
    const referenceImageAssetIds = nextImages
      .map(image => image.assetId)
      .filter((assetId): assetId is string => Boolean(assetId));
    setReferenceImages(nextImages);
    setReferenceSettings(nextSettings);
    onUpdateMaterialImage(nextImages[0] || null);
    onUpdateConfig({
      referenceImageAssetIds: referenceImageAssetIds,
      referenceImageAssetId: referenceImageAssetIds[0],
      freeReferenceReferences: buildFreeReferenceReferences(nextImages, nextSettings),
    });
  };

  const updateReferenceSetting = (index: number, patch: Partial<FreeReferenceDraftSetting>) => {
    const nextSettings = referenceImages.map((_, itemIndex) => ({
      ...(referenceSettings[itemIndex] || createDefaultReferenceSetting()),
      ...(itemIndex === index ? patch : {}),
    }));
    setReferenceSettings(nextSettings);
    onUpdateConfig({
      freeReferenceReferences: buildFreeReferenceReferences(referenceImages, nextSettings),
    });
  };

  const handleGenerate = async () => {
    setGenerationMessage('正在创建生成任务...');
    if (state.isGenerating || isPreparing) {
      setGenerationMessage(state.isGenerating ? '正在生成中' : '图片正在上传中');
      return;
    }
    if (!sourceImage) {
      setGenerationMessage('请上传原图');
      setUploadErrors(prev => ({ ...prev, source: '请先上传原图。' }));
      return;
    }
    if (!prompt.trim()) {
      setGenerationMessage('请输入提示词');
      onUpdateConfig({ prompt: '' });
      return;
    }

    setIsPreparing(true);
    try {
      const [sourceWithAsset, referenceImagesWithAsset] = await Promise.all([
        ensureUploadedImageAsset(sourceImage, 'free-reference-source'),
        Promise.all(referenceImages.map((image, index) => ensureUploadedImageAsset(image, `free-reference-reference-${index + 1}`))),
      ]);
      const referenceImageAssetIds = referenceImagesWithAsset
        .map(image => image.assetId)
        .filter((assetId): assetId is string => Boolean(assetId))
        .slice(0, maxReferenceImages);
      const freeReferenceReferences = buildFreeReferenceReferences(referenceImagesWithAsset, referenceSettings);
      const target = buildTargetSize(resolution, aspectRatio);
      const configPatch: GenerationConfig = {
        ...state.config,
        prompt: prompt.trim(),
        step: 'free_reference_image',
        sourceImageAssetId: sourceWithAsset.assetId,
        referenceImageAssetIds,
        referenceImageAssetId: referenceImageAssetIds[0],
        freeReferenceReferences,
        freeReferenceResolution: resolution,
        freeReferenceAspectRatio: aspectRatio,
        targetWidth: target.width,
        targetHeight: target.height,
        targetAspectRatio: aspectRatio,
        qualityMode: 'balanced',
        batchCount: 1,
      };

      setReferenceImages(referenceImagesWithAsset);
      setReferenceSettings(referenceImagesWithAsset.map((_, index) => referenceSettings[index] || createDefaultReferenceSetting()));
      onUpdateInputImage(sourceWithAsset);
      onUpdateMaterialImage(referenceImagesWithAsset[0] || null);
      onUpdateConfig(configPatch);
      if (import.meta.env.DEV) {
        console.debug('[FreeReferenceImagePanel] create generation job', {
          sourceImageAssetId: sourceWithAsset.assetId,
          referenceImageAssetIds,
          freeReferenceReferences,
          prompt: prompt.trim(),
          resolution,
          aspectRatio,
          willCreateGenerationJob: true,
        });
      }
      onGenerate({
        inputImage: sourceWithAsset,
        materialImage: referenceImagesWithAsset[0] || null,
        config: configPatch,
      });
      setGenerationMessage('正在生成...');
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建生成任务失败，请稍后重试';
      setGenerationMessage(message);
    } finally {
      setIsPreparing(false);
    }
  };

  const handleDownload = async () => {
    if (!originalResultImage || isDownloading) return;
    setIsDownloading(true);
    setDownloadMessage(null);
    setDownloadError(null);
    try {
      await downloadAsset({
        url: originalResultImage,
        assetId: originalResultAssetId,
      }, buildResultImageFilename({
        projectName,
        featureLabel: '自由参考生图',
      }));
      setDownloadMessage('已开始下载');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setDownloadError(message === downloadFallbackMessage ? downloadFallbackMessage : '下载失败，请稍后重试');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <section className="workspace-surface flex min-h-0 flex-1 overflow-hidden p-4">
      <input ref={sourceInputRef} type="file" accept={IMAGE_UPLOAD_ACCEPT} className="hidden" onChange={event => { void handleUpload('source', event.currentTarget.files); event.currentTarget.value = ''; }} />
      <input ref={referenceInputRef} type="file" accept={IMAGE_UPLOAD_ACCEPT} multiple className="hidden" onChange={event => { void handleUpload('reference', event.currentTarget.files); event.currentTarget.value = ''; }} />

      <div className="mx-auto grid w-full max-w-[1440px] min-h-0 gap-4 lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
        <aside className="glass-panel space-y-3 overflow-y-auto rounded-3xl border border-white/60 p-4 custom-scrollbar">
          <div>
            <h2 className="text-lg font-black text-slate-950">自由参考生图</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">原图是主要基础图；参考图可选，上传后用于风格、材质、构图、氛围和细节参考。</p>
          </div>

          <UploadBox title="原图" image={sourceImage} error={uploadErrors.source} onUpload={() => sourceInputRef.current?.click()} onRemove={() => onUpdateInputImage(null)} />
          <ReferenceUploadBox
            images={referenceImages}
            settings={referenceSettings}
            error={uploadErrors.reference}
            onUpload={() => referenceInputRef.current?.click()}
            onRemove={removeReferenceImage}
            onSettingChange={updateReferenceSetting}
          />

          <label className="block">
            <span className="text-xs font-bold text-slate-700">提示词</span>
            <textarea
              value={prompt}
              onChange={event => onUpdateConfig({ prompt: event.currentTarget.value })}
              placeholder="输入你想生成的效果，例如：综合参考图的材质、氛围和细节，优化原图空间表现。"
              className="mt-2 min-h-28 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-bold text-slate-700">分辨率</span>
              <select value={resolution} onChange={event => onUpdateConfig({ freeReferenceResolution: Number(event.currentTarget.value) as 1024 | 1536 | 2048 })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800">
                {resolutionOptions.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-700">图片比例</span>
              <select value={aspectRatio} onChange={event => onUpdateConfig({ freeReferenceAspectRatio: event.currentTarget.value as GenerationConfig['freeReferenceAspectRatio'] })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800">
                {aspectRatioOptions.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>

          <div className="space-y-2">
            <button type="button" onClick={() => void handleGenerate()} disabled={Boolean(disabledReason)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">
            {state.isGenerating || isPreparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {state.isGenerating || isPreparing ? '正在生成...' : '生成'}
            </button>
            {disabledReason ? <p className="text-xs font-semibold text-amber-700">{disabledReason}</p> : null}
            {generationMessage ? <p className="text-xs font-semibold text-blue-700">{generationMessage}</p> : null}
            {state.generationError ? <p className="text-xs font-semibold text-rose-600">{state.generationError}</p> : null}
          </div>
        </aside>

        <main className="workspace-canvas min-h-0 overflow-hidden rounded-3xl border border-white/60">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900">结果图</p>
              <p className="mt-1 text-xs text-slate-500">{readStatusText(state)}</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {resultDimensionsText ? <span className="text-xs font-bold text-slate-500">{resultDimensionsText}</span> : null}
              {originalResultImage ? (
                <>
                  <button type="button" onClick={() => window.open(originalResultImage, '_blank', 'noopener,noreferrer')} className="inline-flex h-8 items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 text-xs font-bold text-slate-700 transition hover:bg-white hover:text-cyan-800">
                    <ExternalLink className="h-3.5 w-3.5" />
                    查看原图
                  </button>
                  <button type="button" onClick={() => void handleDownload()} disabled={isDownloading} className="inline-flex h-8 items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 text-xs font-bold text-slate-700 transition hover:bg-white hover:text-cyan-800 disabled:cursor-not-allowed disabled:opacity-60">
                    <Download className={`h-3.5 w-3.5 ${isDownloading ? 'animate-pulse' : ''}`} />
                    {isDownloading ? '正在下载...' : '保存到本地'}
                  </button>
                </>
              ) : null}
            </div>
          </div>
          {downloadMessage || downloadError ? (
            <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold">
              {downloadMessage ? <span className="text-emerald-700">{downloadMessage}</span> : null}
              {downloadError ? <span className="text-amber-700">{downloadError}</span> : null}
            </div>
          ) : null}
          {originalResultImage && selectedResult && onSendResultToStep ? (
            <div className="border-b border-slate-100 bg-white/45 px-4 py-3">
              <ResultSendActions resultId={selectedResult.id} currentStep={GenerationStep.FreeReferenceImage} onSend={onSendResultToStep} disabled={state.isGenerating} />
            </div>
          ) : null}
          <div className="flex min-h-0 items-start justify-center bg-slate-50 p-4">
            {state.isGenerating ? (
              <div className="text-center text-blue-600">
                <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin" />
                <p className="text-sm font-bold">正在生成...</p>
              </div>
            ) : originalResultImage ? (
              <GenerationImageViewer
                sourceImageUrl={sourceImage ? readImageSrc(sourceImage) : null}
                sourceImageAssetId={sourceImage?.assetId}
                resultImageUrl={originalResultImage}
                resultImageAssetId={originalResultAssetId}
                featureName="自由参考生图"
                step={GenerationStep.FreeReferenceImage}
                className="w-full max-w-5xl"
                sourceMissingMessage="暂无原图，无法对比。"
              />
            ) : (
              <div className="text-center text-sm font-bold text-slate-400">生成完成后将在这里显示结果图</div>
            )}
          </div>
        </main>
      </div>
    </section>
  );
}

function UploadBox({ title, image, error, onUpload, onRemove }: {
  title: string;
  image: UploadedImage | null;
  error: string | null;
  onUpload: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold text-slate-900">{title}</p>
        {image ? <button type="button" onClick={onRemove} className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-rose-600"><X className="h-4 w-4" /></button> : null}
      </div>
      <button type="button" onClick={onUpload} className="w-full rounded-xl border border-dashed border-slate-200 bg-white p-2 text-left hover:border-blue-200">
        {image ? <AspectRatioImage src={readImageSrc(image)} alt={title} enableLightbox={false} /> : (
          <div className="flex aspect-video items-center justify-center rounded-xl bg-slate-50"><Upload className="h-6 w-6 text-slate-300" /></div>
        )}
        <div className="mt-2 min-w-0 px-1">
          <p className="truncate text-sm font-bold text-slate-800">{image?.name || '点击上传'}</p>
          <p className="mt-1 text-xs text-slate-500">{image ? `${image.width || '-'} x ${image.height || '-'} px` : 'PNG / JPG / WEBP'}</p>
        </div>
      </button>
      {error ? <p className="mt-2 text-xs font-semibold text-rose-600">{error}</p> : null}
    </div>
  );
}

function ReferenceUploadBox({ images, settings, error, onUpload, onRemove, onSettingChange }: {
  images: UploadedImage[];
  settings: FreeReferenceDraftSetting[];
  error: string | null;
  onUpload: () => void;
  onRemove: (index: number) => void;
  onSettingChange: (index: number, patch: Partial<FreeReferenceDraftSetting>) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-slate-900">参考图（可选）</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">已上传参考图 {images.length} / {maxReferenceImages}</p>
        </div>
        <button type="button" onClick={onUpload} disabled={images.length >= maxReferenceImages} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-black text-slate-700 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
          添加
        </button>
      </div>
      {images.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {images.map((image, index) => (
            <div key={image.id} className="group overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="relative">
                <AspectRatioImage src={readImageSrc(image)} alt={`参考图 ${index + 1}`} className="rounded-none border-0 shadow-none" />
                <span className="absolute left-1 top-1 rounded bg-slate-950/70 px-1.5 py-0.5 text-[10px] font-black text-white">{index + 1}</span>
                <button type="button" onClick={() => onRemove(index)} className="absolute right-1 top-1 rounded bg-white/90 p-1 text-slate-500 opacity-0 shadow-sm transition group-hover:opacity-100 hover:text-rose-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-1.5 p-1.5">
                <select
                  value={(settings[index] || createDefaultReferenceSetting()).role}
                  onChange={event => onSettingChange(index, { role: event.currentTarget.value as FreeReferenceRole })}
                  className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-700"
                  aria-label={`参考图 ${index + 1} 角色`}
                >
                  {referenceRoleOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <select
                  value={(settings[index] || createDefaultReferenceSetting()).strength}
                  onChange={event => onSettingChange(index, { strength: event.currentTarget.value as FreeReferenceStrength })}
                  className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-700"
                  aria-label={`参考图 ${index + 1} 强度`}
                >
                  {referenceStrengthOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <button type="button" onClick={onUpload} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white px-3 py-8 text-sm font-bold text-slate-500 hover:border-blue-200 hover:text-blue-700">
          <Upload className="h-5 w-5" />
          可上传多张参考图增强效果
        </button>
      )}
      {error ? <p className="mt-2 text-xs font-semibold text-rose-600">{error}</p> : null}
    </div>
  );
}

function createDefaultReferenceSetting(): FreeReferenceDraftSetting {
  return { role: 'style', strength: 'medium' };
}

function buildInitialReferenceSettings(
  images: UploadedImage[],
  references: FreeReferenceReference[] | undefined,
): FreeReferenceDraftSetting[] {
  return images.map(image => {
    const matched = image.assetId ? references?.find(item => item.assetId === image.assetId) : undefined;
    return {
      role: matched?.role || 'style',
      strength: matched?.strength || 'medium',
    };
  });
}

function buildFreeReferenceReferences(
  images: UploadedImage[],
  settings: FreeReferenceDraftSetting[],
): FreeReferenceReference[] {
  return images
    .map((image, index) => {
      if (!image.assetId) return null;
      const setting = settings[index] || createDefaultReferenceSetting();
      return {
        assetId: image.assetId,
        role: setting.role,
        strength: setting.strength,
      };
    })
    .filter((item): item is FreeReferenceReference => Boolean(item));
}

async function ensureUploadedImageAsset(image: UploadedImage, basename: string): Promise<UploadedImage> {
  if (image.assetId) return image;
  const file = dataUrlToFile(image.dataUrl, `${basename}.png`);
  const asset = await uploadImageAsset(file, file.name);
  return {
    ...image,
    url: asset.url,
    assetId: asset.id,
  };
}

function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, encoded] = dataUrl.split(',');
  const mimeType = /^data:([^;,]+)/u.exec(header || '')?.[1] || 'image/png';
  const binary = window.atob(encoded || '');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], filename, { type: mimeType });
}

function buildTargetSize(resolution: 1024 | 1536 | 2048, aspectRatio: NonNullable<GenerationConfig['freeReferenceAspectRatio']>): { width: number; height: number } {
  const [w, h] = aspectRatio.split(':').map(Number);
  if (!w || !h) return { width: resolution, height: resolution };
  if (w >= h) return { width: resolution, height: Math.round(resolution * h / w) };
  return { width: Math.round(resolution * w / h), height: resolution };
}

function readStatusText(state: StepState): string {
  if (state.isGenerating) return '正在生成...';
  if (state.generationStatus === 'success') return '生成成功';
  if (state.generationStatus === 'error') return '生成失败';
  return '等待生成';
}

function readGenerateDisabledReason({
  sourceImage,
  prompt,
  isGenerating,
  isPreparing,
}: {
  sourceImage: UploadedImage | null;
  prompt: string;
  isGenerating: boolean;
  isPreparing: boolean;
}): string | null {
  if (!sourceImage) return '请上传原图';
  if (!prompt.trim()) return '请输入提示词';
  if (isPreparing) return '图片正在上传中';
  if (isGenerating) return '正在生成中';
  return null;
}

function readImageSrc(image: UploadedImage): string {
  return resolveAssetUrl(image.url || image.dataUrl);
}
