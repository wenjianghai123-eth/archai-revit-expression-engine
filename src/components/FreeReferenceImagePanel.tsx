import { AlertTriangle, ImagePlus, Loader2, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { FreeReferenceCandidateCount, FreeReferenceCrop, FreeReferenceFocusArea, FreeReferenceReference, FreeReferenceRole, FreeReferenceStrength, FreeReferenceStructureControl, GenerationConfig, GenerationRunStateOverride, GenerationStep, ResultSendTargetStep, SecondaryEditAction, StepState, UploadedImage } from '../types';
import { getImageAsset, ImageAsset, uploadImageAsset } from '../lib/api';
import { createLocalPreviewImage, revokeUploadedImagePreview, validateImageFile } from '../utils/file';
import { formatResultDimensions, getOriginalResultAssetId, getOriginalResultImageUrl } from '../utils/resultImage';
import { resolveAssetUrl } from '../utils/assetUrl';
import { ContinuousEditAction, ResultSendActions } from './workspace/SecondaryEditActions';
import { AspectRatioImage } from './common/AspectRatioImage';
import { GenerationImageViewer } from './common/GenerationImageViewer';
import { IMAGE_UPLOAD_ACCEPT } from '../utils/imageValidation';
import { buildFreeReferenceRoleSummary, buildFreeReferenceTargetSize, findFreeReferenceConflicts, freeReferenceAspectRatioOptions, freeReferenceStylePresets } from '../utils/freeReferenceWorkflow';
import { normalizeStepGenerationResult } from '../utils/normalizeGenerationResult';
import { GenerationResultActions } from './common/GenerationResultActions';
import { NormalizedGenerationProgress } from './common/GenerationProgress';

type UploadKind = 'source' | 'reference';

interface FreeReferenceImagePanelProps {
  state: StepState;
  projectName?: string | null;
  onUpdateInputImage: (image: UploadedImage | null) => void;
  onUpdateMaterialImage: (image: UploadedImage | null) => void;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
  onGenerate: (stateOverride?: GenerationRunStateOverride) => void;
  onSendResultToStep?: (resultId: string, targetStep: ResultSendTargetStep) => void;
  onSecondaryEditResult?: (resultId: string, action: SecondaryEditAction) => void;
}

const resolutionOptions = [1024, 1536, 2048] as const;
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
interface FreeReferenceDraftSetting {
  role: FreeReferenceRole;
  strength: FreeReferenceStrength;
  weight: number;
  crop: FreeReferenceCrop;
  focusArea: FreeReferenceFocusArea;
  focusDescription: string;
}

export function FreeReferenceImagePanel({
  state,
  projectName,
  onUpdateInputImage,
  onUpdateMaterialImage,
  onUpdateConfig,
  onGenerate,
  onSendResultToStep,
  onSecondaryEditResult,
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
  const [generationMessage, setGenerationMessage] = useState<string | null>(null);
  const hydratedReferenceIdsRef = useRef('');
  const localObjectUrlsRef = useRef(new Set<string>());

  const sourceImage = state.inputImage;
  const prompt = state.config.prompt || '';
  const resolution = state.config.freeReferenceResolution || 1024;
  const aspectRatio = state.config.freeReferenceAspectRatio || 'source';
  const structureControl = state.config.freeReferenceStructureControl || 'balanced';
  const candidateCount = state.config.freeReferenceCandidateCount || 1;
  const workflowMode = state.config.freeReferenceWorkflowMode || 'custom';
  const selectedStylePreset = freeReferenceStylePresets.find(preset => preset.id === state.config.freeReferenceStylePresetId);
  const effectivePrompt = prompt.trim() || (workflowMode === 'quick-style' ? selectedStylePreset?.promptHint || '' : '');
  const referenceDefinitions = buildFreeReferenceReferences(referenceImages, referenceSettings);
  const conflictWarnings = findFreeReferenceConflicts(referenceDefinitions);
  const selectedResult = state.generationResults.find(result => result.isSelected) || state.generationResults[0];
  const originalResultImage = getOriginalResultImageUrl(selectedResult, state.outputImage);
  const originalResultAssetId = getOriginalResultAssetId(selectedResult);
  const normalizedResult = normalizeStepGenerationResult(state, {
    originalImageUrl: sourceImage ? readImageSrc(sourceImage) : null,
    originalAssetId: sourceImage?.assetId,
    resultImageUrl: originalResultImage,
    resultAssetId: originalResultAssetId,
  });
  const resultDimensionsText = formatResultDimensions(selectedResult);
  const disabledReason = readGenerateDisabledReason({
    sourceImage,
    prompt: effectivePrompt,
    isGenerating: state.isGenerating,
    isPreparing,
  });

  useEffect(() => {
    const assetIds = (state.config.referenceImageAssetIds || []).slice(0, maxReferenceImages);
    const hydrationKey = assetIds.join('|');
    if (assetIds.length === 0 || hydrationKey === hydratedReferenceIdsRef.current || referenceImages.some(image => image.uploadStatus === 'uploading')) return;
    hydratedReferenceIdsRef.current = hydrationKey;
    let cancelled = false;
    void Promise.all(assetIds.map(assetId => getImageAsset(assetId))).then(assets => {
      if (cancelled) return;
      const images = assets.map(asset => imageAssetToUploadedImage(asset));
      setReferenceImages(images);
      setReferenceSettings(buildInitialReferenceSettings(images, state.config.freeReferenceReferences));
      onUpdateMaterialImage(images[0] || null);
    }).catch(error => {
      if (!cancelled) console.error('[free-reference] restore reference assets failed', { assetIds, error });
    });
    return () => { cancelled = true; };
  }, [onUpdateMaterialImage, referenceImages, state.config.freeReferenceReferences, state.config.referenceImageAssetIds]);

  useEffect(() => () => {
    localObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    localObjectUrlsRef.current.clear();
  }, []);

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
      releaseLocalPreview(sourceImage, localObjectUrlsRef.current);
      const localImage = trackLocalPreview(createLocalPreviewImage(file), localObjectUrlsRef.current);
      onUpdateInputImage({ ...localImage, uploadStatus: 'uploading' });
      setIsPreparing(true);
      try {
        const [asset, dimensions] = await Promise.all([
          uploadImageAsset(file, file.name),
          readImageDimensions(localImage.previewUrl || localImage.dataUrl).catch(() => undefined),
        ]);
        const uploadedImage = imageAssetToUploadedImage(asset, dimensions);
        releaseLocalPreview(localImage, localObjectUrlsRef.current);
        setUploadErrors(prev => ({ ...prev, source: null }));
        setGenerationMessage(null);
        onUpdateInputImage(uploadedImage);
        onUpdateConfig({ sourceImageAssetId: asset.id, sourceImageWidth: dimensions?.width, sourceImageHeight: dimensions?.height });
      } catch (error) {
        const message = error instanceof Error ? error.message : '原图上传失败，请重试。';
        setUploadErrors(prev => ({ ...prev, source: message }));
        onUpdateInputImage({ ...localImage, uploadStatus: 'failed', uploadError: message });
      } finally {
        setIsPreparing(false);
      }
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

    const localImages = acceptedFiles.map(file => ({ ...trackLocalPreview(createLocalPreviewImage(file), localObjectUrlsRef.current), uploadStatus: 'uploading' as const }));
    const nextImages = [...referenceImages, ...localImages].slice(0, maxReferenceImages);
    const nextSettings = [
      ...referenceSettings,
      ...localImages.map(() => createDefaultReferenceSetting()),
    ].slice(0, maxReferenceImages);
    setReferenceImages(nextImages);
    setReferenceSettings(nextSettings);
    setGenerationMessage(null);
    setIsPreparing(true);
    try {
      const uploaded = await Promise.all(acceptedFiles.map(async (file, index) => {
        const [asset, dimensions] = await Promise.all([
          uploadImageAsset(file, file.name),
          readImageDimensions(localImages[index].previewUrl || localImages[index].dataUrl).catch(() => undefined),
        ]);
        releaseLocalPreview(localImages[index], localObjectUrlsRef.current);
        return imageAssetToUploadedImage(asset, dimensions);
      }));
      const uploadedImages = [...referenceImages, ...uploaded].slice(0, maxReferenceImages);
      const referenceImageAssetIds = uploadedImages.map(image => image.assetId).filter((assetId): assetId is string => Boolean(assetId));
      setReferenceImages(uploadedImages);
      setReferenceSettings(nextSettings);
      onUpdateMaterialImage(uploadedImages[0] || null);
      onUpdateConfig({
        referenceImageAssetIds,
        referenceImageAssetId: referenceImageAssetIds[0],
        freeReferenceReferences: buildFreeReferenceReferences(uploadedImages, nextSettings),
      });
      setUploadErrors(prev => ({ ...prev, reference: selectedFiles.length > remainingSlots ? `已添加前 ${remainingSlots} 张，参考图最多 ${maxReferenceImages} 张。` : null }));
    } catch (error) {
      localImages.forEach(image => releaseLocalPreview(image, localObjectUrlsRef.current));
      setReferenceImages(referenceImages);
      setReferenceSettings(referenceSettings);
      const message = error instanceof Error ? error.message : '参考图上传失败，请重试。';
      setUploadErrors(prev => ({ ...prev, reference: message }));
    } finally {
      setIsPreparing(false);
    }
  };

  const removeReferenceImage = (index: number) => {
    releaseLocalPreview(referenceImages[index], localObjectUrlsRef.current);
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
    if (!sourceImage.assetId || sourceImage.uploadStatus !== 'uploaded') {
      setGenerationMessage(sourceImage.uploadStatus === 'failed' ? '原图上传失败，请重新上传' : '原图正在上传，请稍候');
      return;
    }
    if (referenceImages.some(image => !image.assetId || image.uploadStatus !== 'uploaded')) {
      setGenerationMessage('参考图正在上传，请稍候');
      return;
    }
    if (!effectivePrompt) {
      setGenerationMessage(workflowMode === 'quick-style' ? '请选择一个快速风格，或输入提示词' : '请输入提示词');
      onUpdateConfig({ prompt: '' });
      return;
    }

    setIsPreparing(true);
    try {
      const sourceWithAsset = sourceImage;
      const referenceImagesWithAsset = referenceImages;
      const referenceImageAssetIds = referenceImagesWithAsset
        .map(image => image.assetId)
        .filter((assetId): assetId is string => Boolean(assetId))
        .slice(0, maxReferenceImages);
      const freeReferenceReferences = buildFreeReferenceReferences(referenceImagesWithAsset, referenceSettings);
      const target = buildFreeReferenceTargetSize(resolution, aspectRatio, sourceWithAsset);
      const configPatch: GenerationConfig = {
        ...state.config,
        prompt: effectivePrompt,
        step: 'free_reference_image',
        sourceImageAssetId: sourceWithAsset.assetId,
        referenceImageAssetIds,
        referenceImageAssetId: referenceImageAssetIds[0],
        freeReferenceReferences,
        freeReferenceResolution: resolution,
        freeReferenceAspectRatio: aspectRatio,
        freeReferenceStructureControl: structureControl,
        freeReferenceCandidateCount: candidateCount,
        freeReferenceWorkflowMode: workflowMode,
        targetWidth: target.width,
        targetHeight: target.height,
        targetAspectRatio: target.aspectRatio,
        qualityMode: 'balanced',
        batchCount: candidateCount,
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
          prompt: effectivePrompt,
          resolution,
          aspectRatio,
          candidateCount,
          structureControl,
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

          <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
            {(['custom', 'quick-style'] as const).map(mode => (
              <button key={mode} type="button" onClick={() => onUpdateConfig(mode === 'custom' ? { freeReferenceWorkflowMode: mode, freeReferenceStylePresetId: undefined, freeReferenceStylePromptHint: undefined } : { freeReferenceWorkflowMode: mode })} className={`rounded-lg px-3 py-2 text-xs font-black transition ${workflowMode === mode ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>
                {mode === 'custom' ? '自由配置' : '快速风格'}
              </button>
            ))}
          </div>
          {workflowMode === 'quick-style' ? (
            <div className="flex flex-wrap gap-2" aria-label="快速风格预设">
              {freeReferenceStylePresets.map(preset => (
                <button key={preset.id} type="button" onClick={() => onUpdateConfig({ freeReferenceStylePresetId: preset.id, freeReferenceStylePromptHint: preset.promptHint })} className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${state.config.freeReferenceStylePresetId === preset.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200'}`}>
                  {preset.label}
                </button>
              ))}
              <p className="w-full text-[11px] font-semibold text-slate-500">快速预设只补充风格方向，仍复用下方原图、参考图、权重和生成任务。</p>
            </div>
          ) : null}

          <UploadBox title="原图" image={sourceImage} error={uploadErrors.source} onUpload={() => sourceInputRef.current?.click()} onRemove={() => { releaseLocalPreview(sourceImage, localObjectUrlsRef.current); onUpdateInputImage(null); onUpdateConfig({ sourceImageAssetId: undefined }); }} />
          <ReferenceUploadBox
            images={referenceImages}
            settings={referenceSettings}
            error={uploadErrors.reference}
            onUpload={() => referenceInputRef.current?.click()}
            onRemove={removeReferenceImage}
            onSettingChange={updateReferenceSetting}
          />
          {conflictWarnings.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
              <p className="flex items-center gap-2 font-black"><AlertTriangle className="h-4 w-4" />参考图可能冲突</p>
              {conflictWarnings.map(warning => <p key={warning} className="mt-1.5">{warning}</p>)}
            </div>
          ) : null}

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
                {freeReferenceAspectRatioOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-700">结构保持</p>
            <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
              {([['strict', '严格'], ['balanced', '平衡'], ['creative', '创意']] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => onUpdateConfig({ freeReferenceStructureControl: value })} className={`rounded-lg px-2 py-2 text-xs font-black ${structureControl === value ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>{label}</button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-700">候选结果</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {([1, 2, 4] as FreeReferenceCandidateCount[]).map(count => (
                <button key={count} type="button" onClick={() => onUpdateConfig({ freeReferenceCandidateCount: count, batchCount: count })} className={`rounded-xl border px-3 py-2 text-xs font-black ${candidateCount === count ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'}`}>{count} 个</button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] font-semibold text-slate-500">本次预计生成 {candidateCount} 张，按 {candidateCount} 个结果扣除算力点；失败结果沿用任务退款机制。</p>
          </div>

          <div className="space-y-2">
            <button type="button" onClick={() => void handleGenerate()} disabled={Boolean(disabledReason)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">
            {state.isGenerating || isPreparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {state.isGenerating || isPreparing ? '正在处理...' : `生成 ${candidateCount} 个候选`}
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
              <GenerationResultActions result={normalizedResult} featureName="自由参考生图" projectName={projectName} compact />
            </div>
          </div>
          <div className="border-b border-slate-100 px-4 py-3"><NormalizedGenerationProgress result={normalizedResult} compact /></div>
          {originalResultImage && selectedResult && onSendResultToStep ? (
            <div className="border-b border-slate-100 bg-white/45 px-4 py-3">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <ResultSendActions
                    resultId={selectedResult.id}
                    currentStep={GenerationStep.FreeReferenceImage}
                    onSend={onSendResultToStep}
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
        <div className="space-y-2">
          {images.map((image, index) => (
            <div key={image.id} className="group overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="relative overflow-hidden">
                <AspectRatioImage src={readImageSrc(image)} alt={`参考图 ${index + 1}`} className="rounded-none border-0 shadow-none" />
                <div className="pointer-events-none absolute border-2 border-cyan-400 bg-cyan-300/10" style={cropOverlayStyle((settings[index] || createDefaultReferenceSetting()).crop)} />
                <span className="absolute left-1 top-1 rounded bg-slate-950/70 px-1.5 py-0.5 text-[10px] font-black text-white">{index + 1}</span>
                <button type="button" onClick={() => onRemove(index)} className="absolute right-1 top-1 rounded bg-white/90 p-1 text-slate-500 opacity-0 shadow-sm transition group-hover:opacity-100 hover:text-rose-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-2 p-2">
                <div className="grid grid-cols-2 gap-2">
                  <select value={(settings[index] || createDefaultReferenceSetting()).role} onChange={event => onSettingChange(index, { role: event.currentTarget.value as FreeReferenceRole })} className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-bold text-slate-700" aria-label={`参考图 ${index + 1} 角色`}>
                    {referenceRoleOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <select value={(settings[index] || createDefaultReferenceSetting()).focusArea} onChange={event => onSettingChange(index, { focusArea: event.currentTarget.value as FreeReferenceFocusArea })} className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-bold text-slate-700" aria-label={`参考图 ${index + 1} 关注区域`}>
                    <option value="full">关注全图</option><option value="center">关注中心</option><option value="foreground">关注前景</option><option value="background">关注背景</option><option value="left">关注左侧</option><option value="right">关注右侧</option><option value="custom">自定义关注</option>
                  </select>
                </div>
                {(settings[index] || createDefaultReferenceSetting()).focusArea === 'custom' ? <input value={(settings[index] || createDefaultReferenceSetting()).focusDescription} onChange={event => onSettingChange(index, { focusDescription: event.currentTarget.value })} placeholder="例如：只参考木饰面和灯槽" className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-[11px]" /> : null}
                <div>
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-600"><span>参考权重</span><span>{(settings[index] || createDefaultReferenceSetting()).weight}%</span></div>
                  <input type="range" min="0" max="100" step="5" value={(settings[index] || createDefaultReferenceSetting()).weight} onChange={event => { const weight = Number(event.currentTarget.value); onSettingChange(index, { weight, strength: weight >= 75 ? 'high' : weight <= 40 ? 'low' : 'medium' }); }} className="mt-1 w-full accent-blue-600" aria-label={`参考图 ${index + 1} 权重`} />
                </div>
                <p className="rounded-md bg-blue-50 px-2 py-1.5 text-[10px] font-bold text-blue-700">{buildFreeReferenceRoleSummary(settings[index] || createDefaultReferenceSetting())}</p>
                <details className="rounded-md border border-slate-100 bg-slate-50 p-2">
                  <summary className="cursor-pointer text-[11px] font-black text-slate-600">裁切范围（归一化）</summary>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(['x', 'y', 'width', 'height'] as const).map(field => <label key={field} className="text-[10px] font-bold text-slate-500">{field.toUpperCase()} {Math.round((settings[index] || createDefaultReferenceSetting()).crop[field] * 100)}%<input type="range" min="0" max="1" step="0.01" value={(settings[index] || createDefaultReferenceSetting()).crop[field]} onChange={event => onSettingChange(index, { crop: updateCrop((settings[index] || createDefaultReferenceSetting()).crop, field, Number(event.currentTarget.value)) })} className="block w-full accent-cyan-600" /></label>)}
                  </div>
                </details>
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
  return { role: 'style', strength: 'medium', weight: 60, crop: { x: 0, y: 0, width: 1, height: 1 }, focusArea: 'full', focusDescription: '' };
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
      weight: matched?.weight ?? (matched?.strength === 'high' ? 85 : matched?.strength === 'low' ? 30 : 60),
      crop: matched?.crop || { x: 0, y: 0, width: 1, height: 1 },
      focusArea: matched?.focusArea || 'full',
      focusDescription: matched?.focusDescription || '',
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
        weight: setting.weight,
        crop: setting.crop,
        focusArea: setting.focusArea,
        focusDescription: setting.focusDescription.trim() || undefined,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function imageAssetToUploadedImage(asset: ImageAsset, dimensions?: { width?: number; height?: number }): UploadedImage {
  const url = asset.publicUrl || asset.url;
  return { id: asset.id, name: asset.filename, type: asset.mimeType, size: asset.size, dataUrl: url, url: asset.url, publicUrl: asset.publicUrl, thumbnailUrl: asset.thumbnailUrl, assetId: asset.id, uploadStatus: 'uploaded', uploadProgress: 100, width: dimensions?.width, height: dimensions?.height };
}

function readImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('无法读取图片尺寸。'));
    image.src = url;
  });
}

function trackLocalPreview(image: UploadedImage, urls: Set<string>): UploadedImage {
  if (image.previewUrl?.startsWith('blob:')) urls.add(image.previewUrl);
  return image;
}

function releaseLocalPreview(image: UploadedImage | null | undefined, urls: Set<string>): void {
  if (image?.previewUrl?.startsWith('blob:')) urls.delete(image.previewUrl);
  revokeUploadedImagePreview(image);
}

function updateCrop(crop: FreeReferenceCrop, field: keyof FreeReferenceCrop, value: number): FreeReferenceCrop {
  const next = { ...crop, [field]: Math.max(0, Math.min(1, value)) };
  if (field === 'x') next.width = Math.min(next.width, 1 - next.x);
  if (field === 'y') next.height = Math.min(next.height, 1 - next.y);
  if (field === 'width') next.width = Math.max(0.05, Math.min(next.width, 1 - next.x));
  if (field === 'height') next.height = Math.max(0.05, Math.min(next.height, 1 - next.y));
  return next;
}

function cropOverlayStyle(crop: FreeReferenceCrop): React.CSSProperties {
  return { left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` };
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
  return resolveAssetUrl(image.previewUrl || image.publicUrl || image.url || image.thumbnailUrl || image.dataUrl);
}
