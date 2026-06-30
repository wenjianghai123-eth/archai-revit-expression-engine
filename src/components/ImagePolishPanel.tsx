import { Download, ExternalLink, ImageUp, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { uploadImageAsset } from '../lib/api';
import { GenerationConfig, GenerationRunStateOverride, GenerationStep, ResultSendTargetStep, StepState, UploadedImage } from '../types';
import { buildResultImageFilename, downloadAsset, downloadFallbackMessage } from '../utils/downloadAsset';
import { createUploadedImage, validateImageFile } from '../utils/file';
import { IMAGE_UPLOAD_ACCEPT, readImageTypeUploadError } from '../utils/imageValidation';
import { formatResultDimensions, getOriginalResultAssetId, getOriginalResultImageUrl } from '../utils/resultImage';
import { AspectRatioImage } from './common/AspectRatioImage';
import { GenerationImageViewer } from './common/GenerationImageViewer';
import { ResultSendActions } from './workspace/SecondaryEditActions';

interface ImagePolishPanelProps {
  state: StepState;
  projectName?: string | null;
  onUpdateInputImage: (image: UploadedImage | null) => void;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
  onGenerate: (stateOverride?: GenerationRunStateOverride) => void;
  onSendResultToStep?: (resultId: string, targetStep: ResultSendTargetStep) => void;
}

type PreviewMode = 'result' | 'original' | 'compare';

export function ImagePolishPanel({
  state,
  projectName,
  onUpdateInputImage,
  onUpdateConfig,
  onGenerate,
  onSendResultToStep,
}: ImagePolishPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const sourceImage = state.inputImage;
  const sourceImageUrl = sourceImage ? readImageSrc(sourceImage) : null;
  const selectedResult = state.generationResults.find(result => result.id === state.selectedGenerationResultId)
    || state.generationResults.find(result => result.isSelected)
    || state.generationResults[0]
    || null;
  const resultImageUrl = getOriginalResultImageUrl(selectedResult, state.outputImage);
  const resultAssetId = getOriginalResultAssetId(selectedResult);
  const dimensionsText = formatResultDimensions(selectedResult);
  const isBusy = state.isGenerating || isPreparing;
  const enhanceMaterials = state.config.enhanceMaterials === true;

  const handleUpload = async (files: FileList | null) => {
    const selectedFiles = Array.from(files || []);
    if (selectedFiles.length === 0) return;
    if (selectedFiles.length > 1) {
      setUploadError('质感提升功能仅支持上传 1 张原图。');
      return;
    }

    const file = selectedFiles[0];
    const validation = validateImageFile(file, 'image-polish:source');
    if (validation) {
      setUploadError(validation);
      return;
    }

    try {
      const localImage = await createUploadedImage(file);
      let image = localImage;
      try {
        const asset = await uploadImageAsset(file, file.name);
        image = { ...localImage, assetId: asset.id, url: asset.url };
      } catch (error) {
        const uploadTypeError = readImageTypeUploadError(error);
        if (uploadTypeError) {
          setUploadError(uploadTypeError);
          return;
        }
      }
      onUpdateInputImage(image);
      onUpdateConfig(createImagePolishConfigPatch(image.assetId, enhanceMaterials));
      setUploadError(null);
      setMessage(null);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : '图片读取失败，请重试。');
    }
  };

  const handleGenerate = async () => {
    if (isBusy) {
      setMessage('正在提升质感...');
      return;
    }
    if (!sourceImage) {
      setUploadError('请先上传原图。');
      setMessage('请先上传原图。');
      return;
    }

    setIsPreparing(true);
    setMessage('正在创建质感提升任务...');
    try {
      const imageWithAsset = await ensureUploadedImageAsset(sourceImage, 'image-polish-source');
      const nextEnhanceMaterials = state.config.enhanceMaterials === true;
      const config: GenerationConfig = {
        ...state.config,
        ...createImagePolishConfigPatch(imageWithAsset.assetId, nextEnhanceMaterials),
      };
      onUpdateInputImage(imageWithAsset);
      onUpdateConfig(config);
      if (import.meta.env.DEV) {
        console.debug({
          event: 'image_polish_submit',
          sourceImageAssetId: imageWithAsset.assetId,
          enhanceMaterials: nextEnhanceMaterials,
          promptMode: nextEnhanceMaterials ? 'material_enhance' : 'default_polish',
          provider: config.aiProvider,
        });
      }
      onGenerate({
        inputImage: imageWithAsset,
        materialImage: null,
        maskImage: null,
        useFullImageMask: false,
        config,
      });
      setMessage('正在提升质感...');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '质感提升失败，请稍后重试或更换图片。');
    } finally {
      setIsPreparing(false);
    }
  };

  const handleDownload = async () => {
    if (!resultImageUrl || isDownloading) return;
    setIsDownloading(true);
    setDownloadError(null);
    try {
      await downloadAsset({ url: resultImageUrl, assetId: resultAssetId }, buildResultImageFilename({
        projectName,
        featureLabel: '质感提升',
      }));
    } catch (error) {
      const messageText = error instanceof Error ? error.message : '';
      setDownloadError(messageText === downloadFallbackMessage ? downloadFallbackMessage : '保存失败，请稍后重试。');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <section className="workspace-surface flex min-h-0 flex-1 overflow-hidden p-4">
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_UPLOAD_ACCEPT}
        className="hidden"
        onChange={event => {
          void handleUpload(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />

      <div className="mx-auto grid w-full max-w-[1440px] min-h-0 gap-4 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
        <aside className="glass-panel space-y-4 overflow-y-auto rounded-3xl border border-white/60 p-4 custom-scrollbar">
          <div>
            <h2 className="text-lg font-black text-slate-950">质感提升</h2>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              只上传原图，一键提升真实感、清晰度与照片质感，尽量保持原色、原材质倾向和原设计不变。
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/55 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-black text-slate-900">上传原图</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">支持 PNG / JPG / JPEG / WEBP，仅支持一张原图</p>
              </div>
              {sourceImage ? (
                <button type="button" onClick={() => onUpdateInputImage(null)} className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-rose-600" aria-label="移除原图">
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <button type="button" onClick={() => inputRef.current?.click()} className="w-full rounded-2xl border border-dashed border-slate-200 bg-white/70 p-2 text-left transition hover:border-cyan-200 hover:bg-white">
              {sourceImageUrl ? (
                <AspectRatioImage src={sourceImageUrl} alt="原图预览" enableLightbox={false} />
              ) : (
                <div className="flex aspect-video flex-col items-center justify-center rounded-xl bg-slate-50 text-slate-400">
                  <Upload className="h-7 w-7" />
                  <span className="mt-2 text-xs font-bold">点击上传原图</span>
                </div>
              )}
              <div className="mt-2 px-1">
                <p className="truncate text-sm font-bold text-slate-800">{sourceImage?.name || '未选择图片'}</p>
                <p className="mt-1 text-xs text-slate-500">{sourceImage ? `${sourceImage.width || '-'} x ${sourceImage.height || '-'} px` : 'PNG / JPG / JPEG / WEBP'}</p>
              </div>
            </button>
            {uploadError ? <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{uploadError}</p> : null}
          </div>

          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/50 p-3 text-left">
            <input
              type="checkbox"
              checked={enhanceMaterials}
              onChange={event => onUpdateConfig(createImagePolishConfigPatch(sourceImage?.assetId, event.currentTarget.checked))}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-cyan-700 focus:ring-cyan-600"
            />
            <span className="min-w-0">
              <span className="block text-sm font-black text-slate-900">提升材质</span>
              <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">
                勾选后，将在保持原有空间结构、镜头视角、构图和主要元素不变的前提下，增强真实材质、光影和空间氛围，使画面更接近专业室内 / 建筑效果图。
              </span>
            </span>
          </label>

          <button type="button" onClick={() => void handleGenerate()} disabled={isBusy} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 text-sm font-black text-white shadow-sm transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:bg-slate-300">
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isBusy ? '正在提升质感...' : '立即提升'}
          </button>
          {message ? <p className="text-xs font-semibold text-cyan-800">{message}</p> : null}
          {state.generationError ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{state.generationError || '质感提升失败，请稍后重试或更换图片。'}</p> : null}
        </aside>

        <main className="workspace-canvas min-h-0 overflow-hidden rounded-3xl border border-white/60">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900">质感提升结果</p>
              <p className="mt-1 text-xs text-slate-500">{readStatusText(state)}</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {dimensionsText ? <span className="text-xs font-bold text-slate-500">{dimensionsText}</span> : null}
              {sourceImageUrl ? (
                <button type="button" onClick={() => window.open(sourceImageUrl, '_blank', 'noopener,noreferrer')} className="inline-flex h-8 items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 text-xs font-bold text-slate-700 transition hover:bg-white hover:text-cyan-800">
                  <ExternalLink className="h-3.5 w-3.5" />
                  查看原图
                </button>
              ) : null}
              {resultImageUrl ? (
                <>
                  <button type="button" onClick={() => window.open(resultImageUrl, '_blank', 'noopener,noreferrer')} className="inline-flex h-8 items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 text-xs font-bold text-slate-700 transition hover:bg-white hover:text-cyan-800">
                    <ImageUp className="h-3.5 w-3.5" />
                    查看结果
                  </button>
                  <button type="button" onClick={() => void handleDownload()} disabled={isDownloading} className="inline-flex h-8 items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 text-xs font-bold text-slate-700 transition hover:bg-white hover:text-cyan-800 disabled:cursor-not-allowed disabled:opacity-60">
                    <Download className={`h-3.5 w-3.5 ${isDownloading ? 'animate-pulse' : ''}`} />
                    {isDownloading ? '正在保存...' : '保存到本地'}
                  </button>
                </>
              ) : null}
            </div>
          </div>
          {downloadError ? <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold text-amber-700">{downloadError}</div> : null}
          {resultImageUrl && selectedResult && onSendResultToStep ? (
            <div className="border-b border-slate-100 bg-white/45 px-4 py-3">
              <ResultSendActions resultId={selectedResult.id} currentStep={GenerationStep.ImagePolish} onSend={onSendResultToStep} disabled={state.isGenerating} />
            </div>
          ) : null}
          <div className="min-h-0 bg-slate-50 p-4">
            {state.isGenerating ? (
              <div className="flex aspect-video w-full items-center justify-center rounded-2xl bg-white text-center text-cyan-700">
                <div>
                  <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin" />
                  <p className="text-sm font-bold">正在提升质感...</p>
                </div>
              </div>
            ) : resultImageUrl ? (
              <GenerationImageViewer
                sourceImageUrl={sourceImageUrl}
                sourceImageAssetId={sourceImage?.assetId}
                resultImageUrl={resultImageUrl}
                resultImageAssetId={resultAssetId}
                featureName="质感提升"
                step={GenerationStep.ImagePolish}
                sourceMissingMessage="暂无原图，无法对比。"
              />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/70 text-center text-sm font-bold text-slate-400">
                质感提升完成后将在这里显示结果图
              </div>
            )}
          </div>
        </main>
      </div>
    </section>
  );
}

function PreviewSwitch({ value, hasResult, hasOriginal, onChange }: {
  value: PreviewMode;
  hasResult: boolean;
  hasOriginal: boolean;
  onChange: (value: PreviewMode) => void;
}) {
  const options: Array<{ value: PreviewMode; label: string; disabled: boolean }> = [
    { value: 'result', label: '结果图', disabled: !hasResult },
    { value: 'original', label: '原图', disabled: !hasOriginal },
    { value: 'compare', label: '对比', disabled: !hasResult || !hasOriginal },
  ];
  return (
    <div className="inline-flex rounded-full border border-white/60 bg-white/45 p-0.5 shadow-sm backdrop-blur">
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
          className={`h-7 rounded-full px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:text-slate-300 ${value === option.value ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-950'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ImageBlock({ title, src }: { title: string; src: string }) {
  return (
    <div>
      <div className="mb-2 text-xs font-bold text-slate-500">{title}</div>
      <AspectRatioImage src={src} alt={title} className="w-full" />
    </div>
  );
}

function createImagePolishConfigPatch(sourceImageAssetId?: string, enhanceMaterials = false): Partial<GenerationConfig> {
  return {
    prompt: '',
    negativePrompt: '',
    step: 'image_polish',
    generationStep: 'image_polish',
    featureKey: 'image_polish',
    featureName: '质感提升',
    enhanceMaterials,
    promptMode: enhanceMaterials ? 'material_enhance' : 'default_polish',
    sourceImageAssetId,
    qualityMode: 'balanced',
    batchCount: 1,
    targetCount: 1,
    strength: enhanceMaterials ? 'balanced' : 'weak',
    changeStrength: enhanceMaterials ? 'medium' : 'weak',
    styleStrength: enhanceMaterials ? 'medium' : 'low',
    preserveStructure: true,
    preserveCamera: true,
    preserveColor: enhanceMaterials ? undefined : true,
    preserveMaterialAppearance: enhanceMaterials ? undefined : true,
    preserveGeometry: true,
    keepOriginalAspectRatio: true,
    aspectRatio: 'source',
    customPrompt: '',
    materialReferenceAssetIds: [],
    materialTextureAssetIds: [],
    furnitureReferenceAssetIds: [],
  };
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

function readImageSrc(image: UploadedImage): string {
  return image.url || image.dataUrl;
}

function readStatusText(state: StepState): string {
  if (state.isGenerating) return '正在提升质感...';
  if (state.generationStatus === 'success') return '质感提升完成';
  if (state.generationStatus === 'error') return '质感提升失败，请稍后重试或更换图片。';
  return '等待上传原图';
}
