import { Loader2, Sparkles, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { uploadImageAsset } from '../lib/api';
import {
  DEFAULT_IMAGE_POLISH_CONTROLS,
  IMAGE_POLISH_ELEMENT_LEVEL_OPTIONS,
  IMAGE_POLISH_CONTROL_LEVEL_OPTIONS,
  IMAGE_POLISH_CONTROL_OPTIONS,
  IMAGE_POLISH_MODE_OPTIONS,
  IMAGE_POLISH_PRESERVE_STRICTNESS_OPTIONS,
  type ImagePolishOptions,
  isImagePolishMaterializationMode,
  resolveImagePolishControls,
  resolveImagePolishMode,
  resolveImagePolishOptions,
} from '../constants/imagePolishPrompt';
import { GenerationConfig, GenerationRunStateOverride, GenerationStep, ImagePolishControls, ImagePolishElementLevel, ImagePolishMode, ImagePolishPreserveStrictness, ResultSendTargetStep, SecondaryEditAction, StepState, UploadedImage } from '../types';
import { buildResultImageFilename, downloadAsset, downloadFallbackMessage } from '../utils/downloadAsset';
import { createUploadedImage, validateImageFile } from '../utils/file';
import { IMAGE_UPLOAD_ACCEPT, readImageTypeUploadError } from '../utils/imageValidation';
import { resolveAssetUrl } from '../utils/assetUrl';
import { formatResultDimensions, getOriginalResultAssetId, getOriginalResultImageUrl } from '../utils/resultImage';
import { AspectRatioImage } from './common/AspectRatioImage';
import { GenerationImageViewer } from './common/GenerationImageViewer';
import { ContinuousEditAction, ResultSendActions } from './workspace/SecondaryEditActions';
import { normalizeStepGenerationResult } from '../utils/normalizeGenerationResult';
import { GenerationResultActions } from './common/GenerationResultActions';
import { NormalizedGenerationProgress } from './common/GenerationProgress';

interface ImagePolishPanelProps {
  state: StepState;
  projectName?: string | null;
  onUpdateInputImage: (image: UploadedImage | null) => void;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
  onGenerate: (stateOverride?: GenerationRunStateOverride) => void;
  onSendResultToStep?: (resultId: string, targetStep: ResultSendTargetStep) => void;
  onSecondaryEditResult?: (resultId: string, action: SecondaryEditAction) => void;
}

type PreviewMode = 'result' | 'original' | 'compare';

export function ImagePolishPanel({
  state,
  projectName,
  onUpdateInputImage,
  onUpdateConfig,
  onGenerate,
  onSendResultToStep,
  onSecondaryEditResult,
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
  const normalizedResult = normalizeStepGenerationResult(state, {
    originalImageUrl: sourceImageUrl,
    originalAssetId: sourceImage?.assetId,
    resultImageUrl,
    resultAssetId,
  });
  const dimensionsText = formatResultDimensions(selectedResult);
  const isBusy = state.isGenerating || isPreparing;
  const imagePolishMode = resolveImagePolishMode(state.config.imagePolishMode, state.config.enhanceMaterials === true);
  const imagePolishControls = resolveImagePolishControls(state.config.imagePolishControls, imagePolishMode);
  const imagePolishOptions = resolveImagePolishOptions(state.config);
  const taskSummary = buildImagePolishTaskSummary(imagePolishMode, imagePolishOptions);

  const updateImagePolishOptions = (patch: Partial<ImagePolishOptions>) => {
    const nextOptions = resolveImagePolishOptions({ ...imagePolishOptions, ...patch });
    onUpdateConfig(createImagePolishConfigPatch(sourceImage?.assetId, imagePolishMode, imagePolishControls, nextOptions));
  };

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
      onUpdateConfig(createImagePolishConfigPatch(image.assetId, imagePolishMode, imagePolishControls, imagePolishOptions));
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
      const nextMode = resolveImagePolishMode(state.config.imagePolishMode, state.config.enhanceMaterials === true);
      const nextControls = resolveImagePolishControls(state.config.imagePolishControls, nextMode);
      const nextOptions = resolveImagePolishOptions(state.config);
      const config: GenerationConfig = {
        ...state.config,
        ...createImagePolishConfigPatch(imageWithAsset.assetId, nextMode, nextControls, nextOptions),
      };
      onUpdateInputImage(imageWithAsset);
      onUpdateConfig(config);
      if (import.meta.env.DEV) {
        console.debug('[Quality enhancement submit]', {
          addPeople: nextOptions.addPeople,
          peopleLevel: nextOptions.peopleLevel,
          addPlants: nextOptions.addPlants,
          plantLevel: nextOptions.plantLevel,
          preserveStrictness: nextOptions.preserveStrictness,
        });
        console.debug({
          event: 'image_polish_submit',
          sourceImageAssetId: imageWithAsset.assetId,
          imagePolishMode: nextMode,
          imagePolishControls: nextControls,
          imagePolishOptions: nextOptions,
          promptMode: isImagePolishMaterializationMode(nextMode) ? 'materialization' : nextMode === 'standard' ? 'standard_polish' : 'conservative_polish',
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

  const handleUtilityAction = async (action: 'download' | 'share' | 'pdf') => {
    if (action === 'download') {
      await handleDownload();
      return;
    }
    if (action === 'pdf') {
      window.print();
      return;
    }
    if (!resultImageUrl) return;
    setDownloadError(null);
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${projectName || '烛照AI'} · 质感提升`,
          text: '烛照AI 质感提升结果',
          ...(resultImageUrl.startsWith('http') ? { url: resultImageUrl } : {}),
        });
      } else if (navigator.clipboard && resultImageUrl.startsWith('http')) {
        await navigator.clipboard.writeText(resultImageUrl);
        setMessage('结果链接已复制。');
      } else {
        throw new Error('SHARE_NOT_SUPPORTED');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setDownloadError('当前浏览器无法直接分享，请先保存结果图。');
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
        <aside className="glass-panel space-y-4 overflow-y-auto rounded-3xl border border-white/60 p-4 pb-8 custom-scrollbar" data-testid="image-polish-left-panel">
          <div>
            <h2 className="text-lg font-black text-slate-950">质感提升</h2>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              选择保守提质或白模材质化，再精确控制清晰度、光影、材质、色彩与结构保持强度。
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

          <section className="rounded-2xl border border-slate-200 bg-white/55 p-3">
            <div className="mb-3">
              <p className="text-sm font-black text-slate-900">处理模式</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">先确定允许改变的边界，再细调各项强度。</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
              {IMAGE_POLISH_MODE_OPTIONS.map(option => {
                const selected = imagePolishMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onUpdateConfig(createImagePolishConfigPatch(
                      sourceImage?.assetId,
                      option.value,
                      DEFAULT_IMAGE_POLISH_CONTROLS[option.value],
                      imagePolishOptions,
                    ))}
                    className={`rounded-xl border p-3 text-left transition ${selected ? 'border-cyan-500 bg-cyan-50 ring-1 ring-cyan-200' : 'border-slate-200 bg-white hover:border-cyan-200'}`}
                  >
                    <span className={`block text-sm font-black ${selected ? 'text-cyan-900' : 'text-slate-900'}`}>{option.label}</span>
                    <span className="mt-1 block text-[11px] font-semibold leading-5 text-slate-500">{option.description}</span>
                  </button>
                );
              })}
            </div>
            <div className={`mt-3 rounded-xl px-3 py-2 text-xs font-semibold leading-5 ${imagePolishMode === 'conservative' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
              {readModeBoundaryText(imagePolishMode, imagePolishOptions)}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white/55 p-3" data-testid="image-polish-optional-elements">
            <div className="mb-3">
              <p className="text-sm font-black text-slate-900">可选元素</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">默认不增加人物和绿植；开启后才会进入生成要求。</p>
            </div>
            <div className="space-y-3">
              <OptionalElementControl
                title="增加人物"
                enabled={imagePolishOptions.addPeople}
                level={imagePolishOptions.peopleLevel}
                onEnabledChange={enabled => updateImagePolishOptions({
                  addPeople: enabled,
                  peopleLevel: enabled ? normalizePanelElementLevel(imagePolishOptions.peopleLevel) : 'none',
                })}
                onLevelChange={peopleLevel => updateImagePolishOptions({ addPeople: true, peopleLevel })}
              />
              <OptionalElementControl
                title="增加绿植"
                enabled={imagePolishOptions.addPlants}
                level={imagePolishOptions.plantLevel}
                onEnabledChange={enabled => updateImagePolishOptions({
                  addPlants: enabled,
                  plantLevel: enabled ? normalizePanelElementLevel(imagePolishOptions.plantLevel) : 'none',
                })}
                onLevelChange={plantLevel => updateImagePolishOptions({ addPlants: true, plantLevel })}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white/55 p-3" data-testid="image-polish-protection">
            <div className="mb-3">
              <p className="text-sm font-black text-slate-900">原图保护</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">控制原图结构、构图、相机、材质身份和颜色关系的保持强度。</p>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <p className="text-xs font-black text-slate-800">原图保持强度</p>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">
                  {readPreserveStrictnessLabel(imagePolishOptions.preserveStrictness)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
                {IMAGE_POLISH_PRESERVE_STRICTNESS_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateImagePolishOptions({ preserveStrictness: option.value })}
                    className={`rounded-lg px-2 py-1.5 text-xs font-black transition ${imagePolishOptions.preserveStrictness === option.value ? 'bg-white text-cyan-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    title={option.description}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white/55 p-3">
            <div className="mb-3">
              <p className="text-sm font-black text-slate-900">精细控制</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">九项设置都会进入服务端最终提示词和结果记录。</p>
            </div>
            <div className="space-y-3">
              {IMAGE_POLISH_CONTROL_OPTIONS.map(option => {
                const levels = option.key === 'structurePreservation' || (imagePolishMode === 'conservative' && option.key === 'colorPreservation')
                  ? IMAGE_POLISH_CONTROL_LEVEL_OPTIONS.filter(level => level.value !== 'off')
                  : IMAGE_POLISH_CONTROL_LEVEL_OPTIONS;
                return <div key={option.key}>
                  <div className="mb-1.5 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black text-slate-800">{option.label}</p>
                      <p className="mt-0.5 text-[10px] font-semibold leading-4 text-slate-400">{option.description}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">
                      {IMAGE_POLISH_CONTROL_LEVEL_OPTIONS.find(level => level.value === imagePolishControls[option.key])?.label}
                    </span>
                  </div>
                  <div className={`grid gap-1 rounded-xl bg-slate-100 p-1 ${levels.length === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
                    {levels.map(level => (
                      <button
                        key={level.value}
                        type="button"
                        onClick={() => onUpdateConfig(createImagePolishConfigPatch(
                          sourceImage?.assetId,
                          imagePolishMode,
                          { ...imagePolishControls, [option.key]: level.value },
                          imagePolishOptions,
                        ))}
                        className={`rounded-lg px-1 py-1.5 text-[10px] font-black transition ${imagePolishControls[option.key] === level.value ? 'bg-white text-cyan-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                      >
                        {level.label}
                      </button>
                    ))}
                  </div>
                </div>;
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-3 text-xs font-semibold leading-5 text-cyan-950" data-testid="image-polish-task-summary">
            <p className="text-sm font-black text-cyan-950">任务摘要</p>
            <div className="mt-2 space-y-1">
              {taskSummary.map(item => (
                <p key={item.label}>{item.label}：{item.value}</p>
              ))}
            </div>
          </section>

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
              <GenerationResultActions result={normalizedResult} featureName="质感提升" projectName={projectName} compact />
            </div>
          </div>
          <div className="border-b border-slate-100 px-4 py-3"><NormalizedGenerationProgress result={normalizedResult} compact /></div>
          {downloadError ? <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold text-amber-700">{downloadError}</div> : null}
          {resultImageUrl && selectedResult && onSendResultToStep ? (
            <div className="border-b border-slate-100 bg-white/45 px-4 py-3">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <ResultSendActions
                    resultId={selectedResult.id}
                    currentStep={GenerationStep.ImagePolish}
                    onSend={onSendResultToStep}
                    onUtilityAction={action => { void handleUtilityAction(action); }}
                    disabled={state.isGenerating}
                  />
                </div>
                {onSecondaryEditResult ? (
                  <ContinuousEditAction
                    resultId={selectedResult.id}
                    onAction={onSecondaryEditResult}
                    disabled={state.isGenerating}
                  />
                ) : null}
              </div>
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

function OptionalElementControl({
  title,
  enabled,
  level,
  onEnabledChange,
  onLevelChange,
}: {
  title: string;
  enabled: boolean;
  level: ImagePolishElementLevel;
  onEnabledChange: (enabled: boolean) => void;
  onLevelChange: (level: Exclude<ImagePolishElementLevel, 'none'>) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/70 p-3">
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span className="text-xs font-black text-slate-800">{title}</span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={event => onEnabledChange(event.currentTarget.checked)}
          className="h-4 w-4 rounded border-slate-300 text-cyan-700 focus:ring-cyan-500"
        />
      </label>
      {enabled ? (
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
          {IMAGE_POLISH_ELEMENT_LEVEL_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => onLevelChange(option.value)}
              className={`rounded-lg px-2 py-1.5 text-xs font-black transition ${normalizePanelElementLevel(level) === option.value ? 'bg-white text-cyan-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
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

function createImagePolishConfigPatch(
  sourceImageAssetId: string | undefined,
  imagePolishMode: ImagePolishMode,
  imagePolishControls: ImagePolishControls,
  imagePolishOptions?: Partial<ImagePolishOptions>,
): Partial<GenerationConfig> {
  const isWhiteModelMaterialization = isImagePolishMaterializationMode(imagePolishMode);
  const resolvedOptions = resolveImagePolishOptions(imagePolishOptions);
  return {
    prompt: '',
    negativePrompt: '',
    step: 'image_polish',
    generationStep: 'image_polish',
    featureKey: 'image_polish',
    featureName: '质感提升',
    imagePolishMode,
    imagePolishControls,
    addPeople: resolvedOptions.addPeople,
    peopleLevel: resolvedOptions.peopleLevel,
    addPlants: resolvedOptions.addPlants,
    plantLevel: resolvedOptions.plantLevel,
    preserveStrictness: resolvedOptions.preserveStrictness,
    enhanceMaterials: isWhiteModelMaterialization,
    promptMode: isWhiteModelMaterialization ? 'materialization' : imagePolishMode === 'standard' ? 'standard_polish' : 'conservative_polish',
    sourceImageAssetId,
    qualityMode: 'balanced',
    batchCount: 1,
    targetCount: 1,
    strength: isWhiteModelMaterialization ? 'balanced' : 'weak',
    changeStrength: isWhiteModelMaterialization ? 'medium' : 'weak',
    styleStrength: isWhiteModelMaterialization ? 'medium' : 'low',
    preserveStructure: true,
    preserveCamera: true,
    preserveColor: imagePolishControls.colorPreservation !== 'off',
    preserveMaterialAppearance: !isWhiteModelMaterialization,
    preserveGeometry: true,
    keepOriginalAspectRatio: true,
    aspectRatio: 'source',
    customPrompt: '',
    materialReferenceAssetIds: [],
    materialTextureAssetIds: [],
    furnitureReferenceAssetIds: [],
  };
}

function normalizePanelElementLevel(value: ImagePolishElementLevel): Exclude<ImagePolishElementLevel, 'none'> {
  return value === 'none' ? 'medium' : value;
}

function readImagePolishElementSummary(enabled: boolean, value: ImagePolishElementLevel): string {
  if (!enabled) return '不增加';
  if (value === 'low') return '少量';
  if (value === 'high') return '较多';
  return '适量';
}

function readPreserveStrictnessLabel(value: ImagePolishPreserveStrictness): string {
  if (value === 'loose') return '宽松';
  if (value === 'standard') return '标准';
  return '严格';
}

function buildImagePolishTaskSummary(mode: ImagePolishMode, options: ImagePolishOptions): Array<{ label: string; value: string }> {
  return [
    { label: '模式', value: readImagePolishModeLabel(mode) },
    { label: '人物', value: readImagePolishElementSummary(options.addPeople, options.peopleLevel) },
    { label: '绿植', value: readImagePolishElementSummary(options.addPlants, options.plantLevel) },
    { label: '原图保持强度', value: readPreserveStrictnessLabel(options.preserveStrictness) },
    { label: '材质策略', value: readImagePolishMaterialStrategy(mode) },
    { label: '控图约束', value: '已内置' },
    { label: '增强内容', value: '材质、光影、真实感' },
  ];
}

function readImagePolishModeLabel(mode: ImagePolishMode): string {
  if (isImagePolishMaterializationMode(mode)) return '白模材质化';
  if (mode === 'standard') return '标准提质';
  return '保守提质';
}

function readImagePolishMaterialStrategy(mode: ImagePolishMode): string {
  if (isImagePolishMaterializationMode(mode)) return '自动补全';
  if (mode === 'standard') return '轻度优化';
  return '保持原有材质，仅提质';
}

function readModeBoundaryText(mode: ImagePolishMode, options: ImagePolishOptions): string {
  if (options.addPeople && options.addPlants) {
    return '硬性限制：仅允许按设置新增人物和绿植；结构、镜头、构图、家具、设备、材质、标识和屏幕内容保持不变。';
  }
  if (options.addPeople) {
    return '硬性限制：仅允许按设置新增人物；绿植、结构、镜头、构图、家具、设备、材质、标识和屏幕内容保持不变。';
  }
  if (options.addPlants) {
    return '硬性限制：仅允许按设置新增绿植；人物、结构、镜头、构图、家具、设备、材质、标识和屏幕内容保持不变。';
  }
  if (mode === 'conservative') {
    return '硬性限制：不新增人物、绿植或家具，不替换材质、不改颜色，不改变结构和镜头。';
  }
  if (mode === 'standard') {
    return '硬性限制：轻度优化现有材质表现；不改变材质大类，不自动补全新材质，不改变结构和镜头。';
  }
  return '硬性限制：只补全材质与光影；结构、镜头、构图和主要家具位置仍保持不变。';
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
  return resolveAssetUrl(image.previewUrl || image.publicUrl || image.url || image.thumbnailUrl || image.dataUrl);
}

function readStatusText(state: StepState): string {
  if (state.isGenerating) return '正在提升质感...';
  if (state.generationStatus === 'success') return '质感提升完成';
  if (state.generationStatus === 'error') return '质感提升失败，请稍后重试或更换图片。';
  return '等待上传原图';
}
