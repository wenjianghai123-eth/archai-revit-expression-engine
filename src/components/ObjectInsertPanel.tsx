import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Download, ImagePlus, Move, RotateCcw, RotateCw, Trash2, Upload } from 'lucide-react';
import {
  GenerationConfig,
  GenerationRunStateOverride,
  GenerationStep,
  ObjectInsertDebugMode,
  ObjectInsertPositionConstraintStrength,
  ObjectPlacement,
  StepState,
  UploadedImage,
} from '../types';
import { uploadImageAsset } from '../lib/api';
import { createUploadedImage, validateImageFile } from '../utils/file';
import { buildImageSafetyNotice, precheckGenerationExtraPrompt } from '../safety/generationSafety';
import { PromptVoiceAssistant } from './PromptVoiceAssistant';

type UploadKind = 'source' | 'object';
type InteractionMode = 'move' | 'resize' | 'rotate';

interface ObjectInsertPanelProps {
  state: StepState;
  selectedProjectId?: string | null;
  onUpdateInputImage: (image: UploadedImage | null) => void;
  onUpdateMaterialImage: (image: UploadedImage | null) => void;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
  onGenerate: (stateOverride?: GenerationRunStateOverride) => void;
  isAdmin?: boolean;
}

interface InteractionState {
  mode: InteractionMode;
  startClientX: number;
  startClientY: number;
  startPlacement: ObjectPlacement;
}

interface ExportedImageInfo {
  dataUrl: string;
  width: number;
  height: number;
  bytesApprox: number;
}

interface ExportResult {
  preview: ExportedImageInfo;
  mask: ExportedImageInfo;
  placement: ObjectPlacement;
}

const acceptedImageTypes = 'image/png,image/jpeg,image/webp';
const minObjectSize = 24;
const emptyPlacement: ObjectPlacement = { x: 0, y: 0, width: 0, height: 0, rotation: 0 };
const objectInsertDebugModeOptions: Array<{ value: ObjectInsertDebugMode; label: string }> = [
  { value: 'full', label: '完整输入：原图 + 物体 + guide + mask' },
  { value: 'source_prompt', label: '只提交原图 + prompt' },
  { value: 'source_object', label: '原图 + 物体参考图' },
  { value: 'source_object_mask', label: '原图 + 物体参考图 + mask' },
  { value: 'source_object_preview', label: '原图 + 物体参考图 + placement guide' },
];
const objectInsertPositionConstraintOptions: Array<{
  value: ObjectInsertPositionConstraintStrength;
  label: string;
  description: string;
}> = [
  { value: 'low', label: '低', description: '允许 AI 在附近做自然微调，优先保证透视、遮挡和落地关系。' },
  { value: 'medium', label: '中', description: '尽量贴近用户放置的位置、尺度和角度，同时保留少量自然修正空间。' },
  { value: 'high', label: '高', description: '必须贴近 guide / mask 指定区域，不得出现明显偏移。' },
];

interface DebugSubmitPreviewItem {
  id: string;
  label: string;
  included: boolean;
  imageUrl?: string;
  detail: string;
}

export function ObjectInsertPanel({
  state,
  selectedProjectId,
  onUpdateInputImage,
  onUpdateMaterialImage,
  onUpdateConfig,
  onGenerate,
  isAdmin = false,
}: ObjectInsertPanelProps) {
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const objectInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<InteractionState | null>(null);
  const initializedPairRef = useRef<string>('');

  const sourceImage = state.inputImage;
  const objectImage = state.materialImage;
  const [placement, setPlacement] = useState<ObjectPlacement>(() => sanitizePlacement(state.config.objectPlacement || emptyPlacement));
  const [uploadErrors, setUploadErrors] = useState<Record<UploadKind, string | null>>({ source: null, object: null });
  const [message, setMessage] = useState<string | null>(null);
  const [isSelected, setIsSelected] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isPreparingGeneration, setIsPreparingGeneration] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [isSafetyDebugEnabled, setIsSafetyDebugEnabled] = useState(false);
  const [debugInputMode, setDebugInputMode] = useState<ObjectInsertDebugMode>('full');

  const sourceWidth = sourceImage?.width || 1200;
  const sourceHeight = sourceImage?.height || 800;
  const objectAspect = useMemo(() => {
    if (!objectImage?.width || !objectImage.height) return 1;
    return objectImage.width / objectImage.height;
  }, [objectImage?.height, objectImage?.width]);

  const objectStyle = useMemo<React.CSSProperties>(() => ({
    left: `${(placement.x / sourceWidth) * 100}%`,
    top: `${(placement.y / sourceHeight) * 100}%`,
    width: `${(placement.width / sourceWidth) * 100}%`,
    height: `${(placement.height / sourceHeight) * 100}%`,
    transform: `rotate(${placement.rotation}deg)`,
    transformOrigin: 'center center',
  }), [placement, sourceHeight, sourceWidth]);
  const canShowSafetyDebug = isAdmin || import.meta.env.DEV;
  const activeDebugMode: ObjectInsertDebugMode = canShowSafetyDebug && isSafetyDebugEnabled ? debugInputMode : 'full';
  const positionConstraintStrength = readObjectInsertPositionConstraintStrength(state.config);
  const positionConstraintOption = objectInsertPositionConstraintOptions.find(option => option.value === positionConstraintStrength)
    || objectInsertPositionConstraintOptions[2];
  const submitPreview = useMemo(() => buildObjectInsertSubmitPreview({
    mode: activeDebugMode,
    sourceImage,
    objectImage,
    exportResult,
    extraPrompt: state.config.objectInsertExtraPrompt || state.config.customPrompt || '',
  }), [activeDebugMode, exportResult, objectImage, sourceImage, state.config.customPrompt, state.config.objectInsertExtraPrompt]);

  const getStageMetrics = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || !sourceImage) return null;
    const rect = stage.getBoundingClientRect();
    return {
      rect,
      scaleX: rect.width / sourceWidth,
      scaleY: rect.height / sourceHeight,
    };
  }, [sourceHeight, sourceImage, sourceWidth]);

  const updatePlacement = useCallback((nextPlacement: ObjectPlacement) => {
    const next = sanitizePlacement(nextPlacement, sourceWidth, sourceHeight);
    setPlacement(next);
    onUpdateConfig({
      sourceImageAssetId: sourceImage?.assetId,
      objectReferenceAssetId: objectImage?.assetId,
      objectPlacement: next,
      positionConstraintStrength,
      objectInsert: {
        ...(state.config.objectInsert || {}),
        sourceImageAssetId: sourceImage?.assetId,
        objectReferenceAssetId: objectImage?.assetId,
        placement: next,
        extraPrompt: state.config.objectInsertExtraPrompt || state.config.customPrompt || '',
        positionConstraintStrength,
      },
      objectInsertExtraPrompt: state.config.objectInsertExtraPrompt || '',
      customPrompt: state.config.objectInsertExtraPrompt || state.config.customPrompt || '',
    });
  }, [objectImage?.assetId, onUpdateConfig, positionConstraintStrength, sourceHeight, sourceImage?.assetId, sourceWidth, state.config.customPrompt, state.config.objectInsert, state.config.objectInsertExtraPrompt]);

  const createPlacementForImages = useCallback((source: UploadedImage | null, object: UploadedImage | null) => {
    if (!source || !object) return emptyPlacement;
    return createInitialPlacement(source, object);
  }, []);

  useEffect(() => {
    if (!sourceImage || !objectImage) {
      if (!objectImage) {
        setPlacement(emptyPlacement);
      }
      return;
    }

    const pairKey = `${sourceImage.id}:${objectImage.id}`;
    if (initializedPairRef.current === pairKey) return;
    initializedPairRef.current = pairKey;

    const savedPlacement = state.config.objectPlacement;
    const nextPlacement = savedPlacement?.width && savedPlacement.height
      ? sanitizePlacement(savedPlacement, sourceWidth, sourceHeight)
      : createInitialPlacement(sourceImage, objectImage);

    setPlacement(nextPlacement);
    onUpdateConfig({
      sourceImageAssetId: sourceImage.assetId,
      objectReferenceAssetId: objectImage.assetId,
      objectPlacement: nextPlacement,
      positionConstraintStrength,
      objectInsert: {
        ...(state.config.objectInsert || {}),
        sourceImageAssetId: sourceImage.assetId,
        objectReferenceAssetId: objectImage.assetId,
        placement: nextPlacement,
        extraPrompt: state.config.objectInsertExtraPrompt || state.config.customPrompt || '',
        positionConstraintStrength,
      },
      objectInsertExtraPrompt: state.config.objectInsertExtraPrompt || '',
    });
  }, [
    objectImage,
    onUpdateConfig,
    sourceHeight,
    sourceImage,
    sourceWidth,
    positionConstraintStrength,
    state.config.customPrompt,
    state.config.objectInsert,
    state.config.objectInsertExtraPrompt,
    state.config.objectPlacement,
  ]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction) return;

      const metrics = getStageMetrics();
      if (!metrics) return;

      if (interaction.mode === 'move') {
        const dx = (event.clientX - interaction.startClientX) / metrics.scaleX;
        const dy = (event.clientY - interaction.startClientY) / metrics.scaleY;
        updatePlacement({
          ...interaction.startPlacement,
          x: interaction.startPlacement.x + dx,
          y: interaction.startPlacement.y + dy,
        });
        return;
      }

      if (interaction.mode === 'resize') {
        const dx = (event.clientX - interaction.startClientX) / metrics.scaleX;
        const width = Math.max(minObjectSize, interaction.startPlacement.width + dx);
        updatePlacement({
          ...interaction.startPlacement,
          width,
          height: Math.max(minObjectSize, width / objectAspect),
        });
        return;
      }

      const centerX = metrics.rect.left + (interaction.startPlacement.x + interaction.startPlacement.width / 2) * metrics.scaleX;
      const centerY = metrics.rect.top + (interaction.startPlacement.y + interaction.startPlacement.height / 2) * metrics.scaleY;
      const rotation = Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI + 90;
      updatePlacement({
        ...interaction.startPlacement,
        rotation,
      });
    };

    const handlePointerUp = () => {
      interactionRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [getStageMetrics, objectAspect, updatePlacement]);

  const handleUploadImage = useCallback(async (kind: UploadKind, fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;

    const validationError = validateImageFile(file);
    if (validationError) {
      setUploadErrors(prev => ({ ...prev, [kind]: validationError }));
      return;
    }

    try {
      const localImage = await createUploadedImage(file);
      let image = localImage;

      try {
        const asset = await uploadImageAsset(file, file.name);
        image = { ...localImage, assetId: asset.id, url: asset.url };
      } catch {
        setMessage('图片已用于本地画布预览，素材上传暂不可用。');
      }

      setUploadErrors(prev => ({ ...prev, [kind]: null }));
      setExportResult(null);

      if (kind === 'source') {
        onUpdateInputImage(image);
        const nextPlacement = createPlacementForImages(image, objectImage);
        if (objectImage) setPlacement(nextPlacement);
        onUpdateConfig({
          sourceImageAssetId: image.assetId,
          objectReferenceAssetId: objectImage?.assetId,
          objectPlacement: objectImage ? nextPlacement : emptyPlacement,
        });
      } else {
        onUpdateMaterialImage(image);
        const nextPlacement = createPlacementForImages(sourceImage, image);
        if (sourceImage) setPlacement(nextPlacement);
        onUpdateConfig({
          sourceImageAssetId: sourceImage?.assetId,
          objectReferenceAssetId: image.assetId,
          objectPlacement: sourceImage ? nextPlacement : emptyPlacement,
        });
      }

      const baseMessage = kind === 'source' ? '原始场景图已载入。' : '物体参考图已载入，可在画布中拖拽摆放。';
      const safetyNotice = buildImageSafetyNotice({
        imageName: file.name,
        role: kind === 'object' ? 'object_reference' : 'source_scene',
      });
      setMessage([baseMessage, safetyNotice?.message].filter(Boolean).join('\n'));
    } catch (error) {
      setUploadErrors(prev => ({
        ...prev,
        [kind]: error instanceof Error ? error.message : '图片读取失败，请重试。',
      }));
    }
  }, [
    createPlacementForImages,
    objectImage,
    onUpdateConfig,
    onUpdateInputImage,
    onUpdateMaterialImage,
    sourceImage,
  ]);

  const startInteraction = (mode: InteractionMode, event: React.PointerEvent<HTMLElement>) => {
    if (!sourceImage || !objectImage) return;
    event.preventDefault();
    event.stopPropagation();
    setIsSelected(true);
    interactionRef.current = {
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPlacement: placement,
    };
  };

  const handleCenterObject = () => {
    if (!sourceImage || !objectImage) return;
    updatePlacement({
      ...placement,
      x: (sourceWidth - placement.width) / 2,
      y: (sourceHeight - placement.height) / 2,
    });
    setMessage('物体已居中到画布。');
  };

  const handleResetPlacement = () => {
    if (!sourceImage || !objectImage) return;
    const nextPlacement = createInitialPlacement(sourceImage, objectImage);
    updatePlacement(nextPlacement);
    setMessage('摆放已重置。');
  };

  const handleRemoveObject = () => {
    interactionRef.current = null;
    onUpdateMaterialImage(null);
    setPlacement(emptyPlacement);
    setExportResult(null);
    onUpdateConfig({
      objectReferenceAssetId: undefined,
      objectPlacement: emptyPlacement,
    });
    setMessage('已删除物体参考图。');
  };

  const handlePlacementFieldChange = (field: keyof ObjectPlacement, value: string) => {
    if (!value.trim()) return;
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue)) return;
    updatePlacement({ ...placement, [field]: nextValue });
  };

  const handleExtraPromptChange = (value: string) => {
    onUpdateConfig({
      objectInsert: {
        ...(state.config.objectInsert || {}),
        placement,
        extraPrompt: value,
        positionConstraintStrength,
      },
      objectInsertExtraPrompt: value,
      customPrompt: value,
    });
  };

  const handlePositionConstraintStrengthChange = (value: ObjectInsertPositionConstraintStrength) => {
    onUpdateConfig({
      positionConstraintStrength: value,
      objectInsert: {
        ...(state.config.objectInsert || {}),
        sourceImageAssetId: sourceImage?.assetId || state.config.objectInsert?.sourceImageAssetId,
        objectReferenceAssetId: objectImage?.assetId || state.config.objectInsert?.objectReferenceAssetId,
        placement,
        extraPrompt: state.config.objectInsertExtraPrompt || state.config.customPrompt || '',
        positionConstraintStrength: value,
      },
    });
  };

  const handleExport = async () => {
    if (!sourceImage || !objectImage) {
      setMessage('请先上传原始场景图和物体参考图。');
      return;
    }

    setIsExporting(true);
    try {
      const guide = await exportPlacementGuide(sourceImage, objectImage, placement);
      const mask = await exportPlacementMask(sourceImage, objectImage, placement);
      const nextResult = { preview: guide, mask, placement };
      setExportResult(nextResult);
      onUpdateConfig({
        sourceImageAssetId: sourceImage.assetId,
        objectReferenceAssetId: objectImage.assetId,
        objectPlacement: placement,
        positionConstraintStrength,
        objectInsert: {
          ...(state.config.objectInsert || {}),
          sourceImageAssetId: sourceImage.assetId,
          objectReferenceAssetId: objectImage.assetId,
          placement,
          extraPrompt: state.config.objectInsertExtraPrompt || state.config.customPrompt || '',
          positionConstraintStrength,
        },
        placementGuideAssetId: undefined,
        placementPreviewAssetId: undefined,
        placementMaskAssetId: undefined,
      });
      console.info('[ObjectInsert] placement export', {
        sourceImage: readImageDebugInfo(sourceImage),
        objectImage: readImageDebugInfo(objectImage),
        placement,
        positionConstraintStrength,
        guide: omitDataUrl(guide),
        mask: omitDataUrl(mask),
      });
      setMessage('已导出 placement guide 和精确 mask，详细信息已输出到控制台。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '导出失败，请重试。');
    } finally {
      setIsExporting(false);
    }
  };

  const handleGenerateClick = async () => {
    if (state.isGenerating || isPreparingGeneration) return;
    if (!selectedProjectId) {
      setMessage('请先选择项目，再创建元素植入生成任务。');
      return;
    }
    if (!sourceImage || !objectImage) {
      setMessage('请先上传原始场景图和物体参考图。');
      return;
    }

    const safetyPrecheck = precheckGenerationExtraPrompt({
      extraPrompt: state.config.objectInsertExtraPrompt || state.config.customPrompt || '',
    });
    if (safetyPrecheck.blocked) {
      setMessage(safetyPrecheck.message);
      if (typeof window !== 'undefined') {
        window.alert(safetyPrecheck.message);
      }
      return;
    }

    const submittedImageNotices = [
      buildImageSafetyNotice({ imageName: sourceImage.name, role: 'source_scene' }),
      objectInsertIncludesObject(activeDebugMode)
        ? buildImageSafetyNotice({ imageName: objectImage.name, role: 'object_reference' })
        : null,
    ].filter((notice): notice is NonNullable<ReturnType<typeof buildImageSafetyNotice>> => Boolean(notice && notice.warningLevel === 'caution'));
    if (submittedImageNotices.length > 0) {
      const warningMessage = [
        ...submittedImageNotices.map(notice => notice.message),
        '建议更换无水印、无 Logo、无人物、无品牌标识的参考图，或改用文字描述家具。',
      ].join('\n');
      setMessage(warningMessage);
      if (typeof window !== 'undefined') {
        window.alert(warningMessage);
      }
      return;
    }

    setIsPreparingGeneration(true);
    setMessage('正在导出 placement guide / 精确 mask，并上传生成素材...');
    try {
      const guide = await exportPlacementGuide(sourceImage, objectImage, placement);
      const mask = await exportPlacementMask(sourceImage, objectImage, placement);
      setExportResult({ preview: guide, mask, placement });

      const [{ image: sourceWithAsset, assetId: sourceAssetId }, { image: objectWithAsset, assetId: objectAssetId }] = await Promise.all([
        ensureUploadedImageAsset(sourceImage, 'object-insert-source'),
        ensureUploadedImageAsset(objectImage, 'object-insert-reference'),
      ]);
      const [previewAsset, maskAsset] = await Promise.all([
        uploadDataUrlAsset(guide.dataUrl, `object-insert-placement-guide-${Date.now()}`),
        uploadDataUrlAsset(mask.dataUrl, `object-insert-mask-${Date.now()}`),
      ]);
      const includeObject = objectInsertIncludesObject(activeDebugMode);
      const includePreview = objectInsertIncludesPreview(activeDebugMode);
      const includeMask = objectInsertIncludesMask(activeDebugMode);

      const maskImage: UploadedImage = {
        id: `object-insert-mask-${maskAsset.id}`,
        name: maskAsset.filename || 'object-insert-mask.png',
        type: maskAsset.mimeType || 'image/png',
        size: maskAsset.size || mask.bytesApprox,
        dataUrl: mask.dataUrl,
        url: maskAsset.url,
        assetId: maskAsset.id,
        width: mask.width,
        height: mask.height,
      };
      const configPatch: GenerationConfig = {
        ...state.config,
        step: 'object_insert',
        sourceImageAssetId: sourceAssetId,
        objectReferenceAssetId: includeObject ? objectAssetId : undefined,
        placementPreviewAssetId: includePreview ? previewAsset.id : undefined,
        placementGuideAssetId: includePreview ? previewAsset.id : undefined,
        placementMaskAssetId: includeMask ? maskAsset.id : undefined,
        objectPlacement: placement,
        objectInsertDebugMode: activeDebugMode,
        positionConstraintStrength,
        objectInsert: {
          sourceImageAssetId: sourceAssetId,
          objectReferenceAssetId: includeObject ? objectAssetId : undefined,
          previewAssetId: includePreview ? previewAsset.id : undefined,
          guideAssetId: includePreview ? previewAsset.id : undefined,
          maskAssetId: includeMask ? maskAsset.id : undefined,
          placement,
          extraPrompt: state.config.objectInsertExtraPrompt || state.config.customPrompt || '',
          debugMode: activeDebugMode,
          positionConstraintStrength,
        },
        objectInsertExtraPrompt: state.config.objectInsertExtraPrompt || '',
        customPrompt: state.config.objectInsertExtraPrompt || state.config.customPrompt || '',
        maskMode: includeMask ? 'asset-mask' : undefined,
        maskAssetId: includeMask ? maskAsset.id : undefined,
        editTarget: 'furniture',
        preserveStructure: true,
        preserveCamera: true,
      };

      onUpdateInputImage(sourceWithAsset);
      onUpdateMaterialImage(objectWithAsset);
      onUpdateConfig(configPatch);
      console.info('[ObjectInsert] generation job payload prepared', {
        inputAssetIds: [
          sourceAssetId,
          includeObject ? objectAssetId : undefined,
          includePreview ? previewAsset.id : undefined,
          includeMask ? maskAsset.id : undefined,
        ].filter(Boolean),
        placement,
        objectInsertDebugMode: activeDebugMode,
        positionConstraintStrength,
        sourceAssetId,
        objectAssetId,
        placementPreviewAssetId: previewAsset.id,
        placementGuideAssetId: previewAsset.id,
        placementMaskAssetId: maskAsset.id,
      });
      setMessage('素材已准备完成，正在创建 AI 生成任务...');
      onGenerate({
        inputImage: sourceWithAsset,
        materialImage: objectWithAsset,
        maskImage,
        useFullImageMask: false,
        config: configPatch,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '元素植入生成任务准备失败，请重试。');
    } finally {
      setIsPreparingGeneration(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-slate-100">
      <input ref={sourceInputRef} type="file" accept={acceptedImageTypes} className="hidden" onChange={event => { void handleUploadImage('source', event.currentTarget.files); event.currentTarget.value = ''; }} />
      <input ref={objectInputRef} type="file" accept={acceptedImageTypes} className="hidden" onChange={event => { void handleUploadImage('object', event.currentTarget.files); event.currentTarget.value = ''; }} />

      <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-r border-slate-200 bg-white p-4 custom-scrollbar">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-blue-600">Object Insert</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">元素植入</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">上传原图和物体参考图，先完成可视化摆放、placement guide 与 mask 导出。</p>
        </div>

        <UploadCard
          title="原始场景图"
          description="作为画布底图，必填。"
          image={sourceImage}
          error={uploadErrors.source}
          onUpload={() => sourceInputRef.current?.click()}
          onRemove={() => {
            onUpdateInputImage(null);
            setExportResult(null);
            onUpdateConfig({ sourceImageAssetId: undefined, objectPlacement: emptyPlacement });
          }}
        />

        <UploadCard
          title="物体参考图"
          description="先支持 1 张，透明背景会直接保留。"
          image={objectImage}
          error={uploadErrors.object}
          onUpload={() => objectInputRef.current?.click()}
          onRemove={handleRemoveObject}
        />

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <label className="text-xs font-bold text-slate-800" htmlFor="object-insert-prompt">补充提示词</label>
          <div className="mt-2">
            <PromptVoiceAssistant
              generationStep={GenerationStep.ObjectInsert}
              currentPrompt={state.config.objectInsertExtraPrompt || state.config.customPrompt || ''}
              context={state.config as unknown as Record<string, unknown>}
              onApplyPrompt={handleExtraPromptChange}
            />
          </div>
          <textarea
            id="object-insert-prompt"
            value={state.config.objectInsertExtraPrompt || ''}
            onChange={event => handleExtraPromptChange(event.currentTarget.value)}
            placeholder="例如：让椅子自然融入餐厅区域，材质与原图暖色灯光一致。"
            className="mt-2 min-h-24 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold text-slate-800">位置约束</p>
            <p className="text-[11px] font-bold text-blue-600">{positionConstraintOption.label}</p>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5 rounded-xl bg-white p-1">
            {objectInsertPositionConstraintOptions.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => handlePositionConstraintStrengthChange(option.value)}
                className={`rounded-lg px-2 py-1.5 text-xs font-black transition ${
                  positionConstraintStrength === option.value
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">{positionConstraintOption.description}</p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
          请确保原图和物体参考图内容合规且有使用权；如参考图含明显 logo、水印、人像或敏感内容，请更换为无水印、无人物、无敏感内容的图片。
        </div>

        {canShowSafetyDebug ? (
          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-3 text-xs leading-5 text-violet-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black text-violet-950">安全调试模式</p>
                <p className="mt-0.5 text-violet-700">仅管理员/开发环境可见，用于排查 Grsai safety rejected 的触发输入。</p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] font-bold">
                <input
                  type="checkbox"
                  checked={isSafetyDebugEnabled}
                  onChange={event => setIsSafetyDebugEnabled(event.currentTarget.checked)}
                  className="h-4 w-4 rounded border-violet-300 text-violet-600"
                />
                开启
              </label>
            </div>

            {isSafetyDebugEnabled ? (
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className="font-bold text-violet-950">逐项排查提交内容</span>
                  <select
                    value={debugInputMode}
                    onChange={event => setDebugInputMode(event.currentTarget.value as ObjectInsertDebugMode)}
                    className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-900 outline-none focus:border-violet-400"
                  >
                    {objectInsertDebugModeOptions.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <div className="rounded-xl border border-violet-100 bg-white/80 p-2">
                  <p className="font-bold text-violet-950">本次会提交</p>
                  <div className="mt-2 space-y-2">
                    {submitPreview.items.map(item => (
                      <DebugSubmitItem key={item.id} item={item} />
                    ))}
                  </div>
                  <div className="mt-2 rounded-lg bg-violet-100/70 p-2">
                    <p className="font-bold text-violet-950">extraPrompt</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-violet-800">{submitPreview.extraPrompt || '未填写'}</p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-slate-950">摆放画布</h3>
            <p className="text-xs text-slate-500">拖动物体图层，使用右下角缩放，顶部圆点旋转。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={!sourceImage || !objectImage || isExporting || state.isGenerating || isPreparingGeneration}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              <Download className="h-4 w-4" />
              {isExporting ? '正在导出' : '导出 guide + mask'}
            </button>
            <button
              type="button"
              onClick={handleGenerateClick}
              disabled={!sourceImage || !objectImage || state.isGenerating || isPreparingGeneration}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              <ImagePlus className="h-4 w-4" />
              {state.isGenerating ? 'AI 生成中' : isPreparingGeneration ? '准备任务中' : '生成融合效果图'}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-slate-200 bg-white p-3 custom-scrollbar">
          {sourceImage ? (
            <div className="mx-auto max-h-full max-w-5xl">
              <div
                ref={stageRef}
                className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-950 shadow-inner"
                style={{ aspectRatio: `${sourceWidth} / ${sourceHeight}` }}
                onPointerDown={() => setIsSelected(false)}
              >
                <img src={readImageSrc(sourceImage)} alt="原始场景图" className="absolute inset-0 h-full w-full select-none object-contain" draggable={false} />
                {objectImage ? (
                  <div
                    className={`absolute touch-none select-none ${isSelected ? 'ring-2 ring-blue-400' : 'ring-1 ring-white/70'} cursor-move`}
                    style={objectStyle}
                    onPointerDown={event => startInteraction('move', event)}
                  >
                    <img src={readImageSrc(objectImage)} alt="物体参考图" className="h-full w-full select-none object-fill" draggable={false} />
                    {isSelected ? (
                      <>
                        <button
                          type="button"
                          aria-label="旋转物体"
                          className="absolute left-1/2 top-0 flex h-8 w-8 -translate-x-1/2 -translate-y-11 items-center justify-center rounded-full border border-blue-200 bg-white text-blue-600 shadow-lg"
                          onPointerDown={event => startInteraction('rotate', event)}
                        >
                          <RotateCw className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="缩放物体"
                          className="absolute bottom-0 right-0 flex h-8 w-8 translate-x-1/2 translate-y-1/2 items-center justify-center rounded-full border border-blue-200 bg-white text-blue-600 shadow-lg"
                          onPointerDown={event => startInteraction('resize', event)}
                        >
                          <Move className="h-4 w-4 rotate-45" />
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="rounded-2xl border border-dashed border-white/30 bg-slate-950/60 px-4 py-3 text-center text-sm font-bold text-white">
                      请上传物体参考图
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[420px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
              <button
                type="button"
                onClick={() => sourceInputRef.current?.click()}
                className="flex flex-col items-center gap-3 rounded-2xl bg-white px-8 py-6 text-slate-600 shadow-sm transition hover:text-blue-600"
              >
                <ImagePlus className="h-10 w-10" />
                <span className="text-sm font-bold">上传原始场景图后开始摆放</span>
              </button>
            </div>
          )}
        </div>
      </main>

      <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-slate-200 bg-white p-4 custom-scrollbar">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Placement</p>
          <h3 className="mt-1 text-lg font-black text-slate-950">摆放参数</h3>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <NumberField label="X" value={placement.x} onChange={value => handlePlacementFieldChange('x', value)} />
          <NumberField label="Y" value={placement.y} onChange={value => handlePlacementFieldChange('y', value)} />
          <NumberField label="宽" value={placement.width} onChange={value => handlePlacementFieldChange('width', value)} />
          <NumberField label="高" value={placement.height} onChange={value => handlePlacementFieldChange('height', value)} />
          <NumberField label="旋转" value={placement.rotation} onChange={value => handlePlacementFieldChange('rotation', value)} suffix="°" />
        </div>

        <div className="flex flex-wrap gap-2">
          <ToolButton icon={Crosshair} label="居中" onClick={handleCenterObject} disabled={!sourceImage || !objectImage} />
          <ToolButton icon={RotateCcw} label="重置" onClick={handleResetPlacement} disabled={!sourceImage || !objectImage} />
          <ToolButton icon={Trash2} label="删除" onClick={handleRemoveObject} disabled={!objectImage} danger />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
          <p className="font-bold text-slate-800">当前素材</p>
          <p className="mt-1">原图：{sourceImage?.assetId ? `已上传 ${sourceImage.assetId}` : sourceImage ? '本地预览，暂无 assetId' : '未上传'}</p>
          <p>物体：{objectImage?.assetId ? `已上传 ${objectImage.assetId}` : objectImage ? '本地预览，暂无 assetId' : '未上传'}</p>
        </div>

        {message ? (
          <div className="whitespace-pre-line rounded-2xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
            {message}
          </div>
        ) : null}

        {(state.generationStatus !== 'ready' || state.generationError || state.outputImage) ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
            <p className="font-bold text-slate-900">生成状态</p>
            <p className="mt-1">状态：{state.generationStatus}</p>
            <p>进度：{state.generationProgress}%</p>
            {state.generationError ? <p className="mt-2 whitespace-pre-wrap break-words text-rose-600">{state.generationError}</p> : null}
            {state.generationLogs.length > 0 ? (
              <div className="mt-2 space-y-1">
                {state.generationLogs.slice(-4).map((log, index) => (
                  <p key={`${log}-${index}`} className="break-words text-[10px] text-slate-500">{log}</p>
                ))}
              </div>
            ) : null}
            {state.outputImage ? (
              <img src={state.outputImage} alt="元素植入生成结果" className="mt-3 h-32 w-full rounded-xl border border-slate-100 object-cover" />
            ) : null}
          </div>
        ) : null}

        {exportResult ? (
          <div className="space-y-3">
            <ExportPreview title="Placement guide" info={exportResult.preview} />
            <ExportPreview title="Placement mask" info={exportResult.mask} />
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-xs leading-5 text-slate-500">
            导出后这里会显示 placement guide 和 mask 缩略图。
          </div>
        )}
      </aside>
    </div>
  );
}

function UploadCard({
  title,
  description,
  image,
  error,
  onUpload,
  onRemove,
}: {
  title: string;
  description: string;
  image: UploadedImage | null;
  error: string | null;
  onUpload: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
        </div>
        {image ? (
          <button type="button" onClick={onRemove} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500" aria-label={`删除${title}`}>
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onUpload}
        className="mt-3 flex w-full items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-2 text-left transition hover:border-blue-200 hover:bg-blue-50"
      >
        <div className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
          {image ? (
            <img src={readImageSrc(image)} alt={title} className="h-full w-full object-cover" />
          ) : (
            <Upload className="h-6 w-6 text-slate-300" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-800">{image?.name || '点击上传图片'}</p>
          <p className="mt-1 text-xs text-slate-500">{image ? `${image.width || '-'} x ${image.height || '-'} px` : 'PNG / JPG / WEBP'}</p>
        </div>
      </button>
      {error ? <p className="mt-2 text-xs leading-5 text-rose-600">{error}</p> : null}
    </div>
  );
}

function DebugSubmitItem({ item }: { item: DebugSubmitPreviewItem }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border p-2 ${
      item.included ? 'border-violet-200 bg-white' : 'border-slate-200 bg-slate-50 text-slate-400'
    }`}>
      <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-100">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.label} className="h-full w-full object-cover" />
        ) : (
          <span className="text-[10px] font-bold">N/A</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{item.included ? '会提交' : '不提交'} · {item.label}</p>
        <p className="mt-0.5 truncate text-[10px]">{item.detail}</p>
      </div>
    </div>
  );
}

function buildObjectInsertSubmitPreview(input: {
  mode: ObjectInsertDebugMode;
  sourceImage: UploadedImage | null;
  objectImage: UploadedImage | null;
  exportResult: ExportResult | null;
  extraPrompt: string;
}): { items: DebugSubmitPreviewItem[]; extraPrompt: string } {
  const sourceIncluded = true;
  const objectIncluded = objectInsertIncludesObject(input.mode);
  const previewIncluded = objectInsertIncludesPreview(input.mode);
  const maskIncluded = objectInsertIncludesMask(input.mode);
  return {
    extraPrompt: input.extraPrompt,
    items: [
      {
        id: 'source',
        label: '原图',
        included: sourceIncluded,
        imageUrl: input.sourceImage ? readImageSrc(input.sourceImage) : undefined,
        detail: input.sourceImage?.assetId || input.sourceImage?.id || '尚未上传',
      },
      {
        id: 'object',
        label: '物体参考图',
        included: objectIncluded,
        imageUrl: input.objectImage ? readImageSrc(input.objectImage) : undefined,
        detail: input.objectImage?.assetId || input.objectImage?.id || '尚未上传',
      },
      {
        id: 'preview',
        label: 'placement guide',
        included: previewIncluded,
        imageUrl: input.exportResult?.preview.dataUrl,
        detail: input.exportResult ? `${input.exportResult.preview.width} x ${input.exportResult.preview.height}` : '生成时会自动导出',
      },
      {
        id: 'mask',
        label: 'placement mask',
        included: maskIncluded,
        imageUrl: input.exportResult?.mask.dataUrl,
        detail: input.exportResult ? `${input.exportResult.mask.width} x ${input.exportResult.mask.height}` : '生成时会自动导出',
      },
    ],
  };
}

function readObjectInsertPositionConstraintStrength(config: GenerationConfig): ObjectInsertPositionConstraintStrength {
  const value = config.objectInsert?.positionConstraintStrength || config.positionConstraintStrength;
  return value === 'low' || value === 'medium' || value === 'high' ? value : 'high';
}

function objectInsertIncludesObject(mode: ObjectInsertDebugMode): boolean {
  return mode !== 'source_prompt';
}

function objectInsertIncludesPreview(mode: ObjectInsertDebugMode): boolean {
  return mode === 'full' || mode === 'source_object_preview';
}

function objectInsertIncludesMask(mode: ObjectInsertDebugMode): boolean {
  return mode === 'full' || mode === 'source_object_mask';
}

function NumberField({
  label,
  value,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  suffix?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <div className="mt-1 flex items-center gap-1">
        <input
          type="number"
          value={Number.isFinite(value) ? Number(value.toFixed(1)) : 0}
          onChange={event => onChange(event.currentTarget.value)}
          className="min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-900 outline-none"
        />
        {suffix ? <span className="text-xs font-bold text-slate-400">{suffix}</span> : null}
      </div>
    </label>
  );
}

function ToolButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  danger = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${
        danger ? 'bg-rose-50 text-rose-600 hover:bg-rose-100' : 'bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-700'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function ExportPreview({ title, info }: { title: string; info: ExportedImageInfo }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-bold text-slate-800">{title}</p>
        <span className="text-[10px] font-bold text-slate-400">{formatBytes(info.bytesApprox)}</span>
      </div>
      <img src={info.dataUrl} alt={title} className="h-28 w-full rounded-xl border border-slate-100 object-cover" />
      <p className="mt-2 text-[10px] font-bold text-slate-400">{info.width} x {info.height} px</p>
    </div>
  );
}

function readImageSrc(image: UploadedImage): string {
  return image.dataUrl || image.url || '';
}

function sanitizePlacement(placement: ObjectPlacement, sourceWidth = 1200, sourceHeight = 800): ObjectPlacement {
  const width = Math.max(minObjectSize, Number.isFinite(placement.width) ? placement.width : minObjectSize);
  const height = Math.max(minObjectSize, Number.isFinite(placement.height) ? placement.height : minObjectSize);
  return {
    x: clamp(Number.isFinite(placement.x) ? placement.x : 0, -width * 0.5, sourceWidth - width * 0.5),
    y: clamp(Number.isFinite(placement.y) ? placement.y : 0, -height * 0.5, sourceHeight - height * 0.5),
    width,
    height,
    rotation: Number.isFinite(placement.rotation) ? Number(placement.rotation.toFixed(1)) : 0,
  };
}

function createInitialPlacement(source: UploadedImage, object: UploadedImage): ObjectPlacement {
  const sourceWidth = source.width || 1200;
  const sourceHeight = source.height || 800;
  const objectAspect = object.width && object.height ? object.width / object.height : 1;
  const targetWidth = Math.max(80, Math.min(sourceWidth * 0.24, sourceWidth - 40));
  const targetHeight = Math.max(minObjectSize, targetWidth / objectAspect);
  return sanitizePlacement({
    x: (sourceWidth - targetWidth) / 2,
    y: (sourceHeight - targetHeight) / 2,
    width: targetWidth,
    height: targetHeight,
    rotation: 0,
  }, sourceWidth, sourceHeight);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function exportPlacementGuide(sourceImage: UploadedImage, objectImage: UploadedImage, placement: ObjectPlacement): Promise<ExportedImageInfo> {
  const [source, object] = await Promise.all([
    loadCanvasImage(readImageSrc(sourceImage)),
    loadCanvasImage(readImageSrc(objectImage)),
  ]);
  const width = sourceImage.width || source.naturalWidth || 1200;
  const height = sourceImage.height || source.naturalHeight || 800;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器不支持 Canvas 导出。');

  context.drawImage(source, 0, 0, width, height);
  drawPlacementGuide(context, object, placement);

  const dataUrl = canvas.toDataURL('image/png');
  return { dataUrl, width, height, bytesApprox: estimateDataUrlBytes(dataUrl) };
}

async function exportPlacementMask(sourceImage: UploadedImage, objectImage: UploadedImage, placement: ObjectPlacement): Promise<ExportedImageInfo> {
  const object = await loadCanvasImage(readImageSrc(objectImage));
  const width = sourceImage.width || 1200;
  const height = sourceImage.height || 800;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器不支持 Canvas 导出。');

  context.fillStyle = '#000000';
  context.fillRect(0, 0, width, height);
  drawPrecisePlacementMask(context, object, placement);

  const dataUrl = canvas.toDataURL('image/png');
  return { dataUrl, width, height, bytesApprox: estimateDataUrlBytes(dataUrl) };
}

function drawPlacementGuide(context: CanvasRenderingContext2D, object: HTMLImageElement, placement: ObjectPlacement) {
  const lineWidth = Math.max(3, Math.min(10, Math.max(placement.width, placement.height) * 0.015));
  drawPlacedSilhouette(context, object, placement, 'rgba(14, 165, 233, 0.34)');

  context.save();
  context.translate(placement.x + placement.width / 2, placement.y + placement.height / 2);
  context.rotate(placement.rotation * Math.PI / 180);
  context.globalAlpha = 0.52;
  context.drawImage(object, -placement.width / 2, -placement.height / 2, placement.width, placement.height);
  context.globalAlpha = 1;
  context.strokeStyle = '#0ea5e9';
  context.lineWidth = lineWidth;
  context.setLineDash([lineWidth * 3, lineWidth * 1.6]);
  context.strokeRect(-placement.width / 2, -placement.height / 2, placement.width, placement.height);
  context.setLineDash([]);
  context.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  context.lineWidth = Math.max(1, lineWidth * 0.35);
  context.strokeRect(-placement.width / 2, -placement.height / 2, placement.width, placement.height);
  drawGuideCrosshair(context, placement.width, placement.height, lineWidth);
  context.restore();
}

function drawGuideCrosshair(context: CanvasRenderingContext2D, width: number, height: number, lineWidth: number) {
  const radius = Math.max(8, Math.min(width, height) * 0.08);
  context.strokeStyle = '#0ea5e9';
  context.fillStyle = 'rgba(14, 165, 233, 0.18)';
  context.lineWidth = Math.max(2, lineWidth * 0.6);
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.beginPath();
  context.moveTo(-Math.min(width * 0.32, radius * 3), 0);
  context.lineTo(Math.min(width * 0.32, radius * 3), 0);
  context.moveTo(0, -Math.min(height * 0.32, radius * 3));
  context.lineTo(0, Math.min(height * 0.32, radius * 3));
  context.stroke();
}

function drawPlacedSilhouette(context: CanvasRenderingContext2D, object: HTMLImageElement, placement: ObjectPlacement, color: string) {
  const silhouette = createTintedObjectMaskCanvas(object, color);
  if (!silhouette) return;
  context.save();
  context.translate(placement.x + placement.width / 2, placement.y + placement.height / 2);
  context.rotate(placement.rotation * Math.PI / 180);
  context.drawImage(silhouette, -placement.width / 2, -placement.height / 2, placement.width, placement.height);
  context.restore();
}

function drawPrecisePlacementMask(context: CanvasRenderingContext2D, object: HTMLImageElement, placement: ObjectPlacement) {
  const alphaMask = createObjectAlphaMaskCanvas(object);
  if (alphaMask) {
    context.save();
    context.translate(placement.x + placement.width / 2, placement.y + placement.height / 2);
    context.rotate(placement.rotation * Math.PI / 180);
    context.filter = 'blur(2px)';
    context.drawImage(alphaMask, -placement.width / 2, -placement.height / 2, placement.width, placement.height);
    context.filter = 'none';
    context.drawImage(alphaMask, -placement.width / 2, -placement.height / 2, placement.width, placement.height);
    context.restore();
    return;
  }

  const padding = Math.max(2, Math.min(placement.width, placement.height) * 0.025);
  const radius = Math.max(8, Math.min(placement.width, placement.height) * 0.08);
  context.save();
  context.translate(placement.x + placement.width / 2, placement.y + placement.height / 2);
  context.rotate(placement.rotation * Math.PI / 180);
  context.fillStyle = '#ffffff';
  context.filter = 'blur(1px)';
  drawRoundedRectPath(
    context,
    -placement.width / 2 - padding,
    -placement.height / 2 - padding,
    placement.width + padding * 2,
    placement.height + padding * 2,
    radius,
  );
  context.fill();
  context.filter = 'none';
  context.restore();
}

function createObjectAlphaMaskCanvas(object: HTMLImageElement): HTMLCanvasElement | null {
  const width = object.naturalWidth || object.width;
  const height = object.naturalHeight || object.height;
  if (!width || !height) return null;

  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!sourceContext) return null;
  sourceContext.drawImage(object, 0, 0, width, height);

  let imageData: ImageData;
  try {
    imageData = sourceContext.getImageData(0, 0, width, height);
  } catch {
    return null;
  }

  const pixels = imageData.data;
  let transparentPixels = 0;
  let solidPixels = 0;
  for (let index = 3; index < pixels.length; index += 4) {
    const alpha = pixels[index];
    if (alpha < 245) transparentPixels += 1;
    if (alpha > 24) solidPixels += 1;
  }
  const totalPixels = width * height;
  if (transparentPixels / totalPixels < 0.01 || solidPixels / totalPixels < 0.05) return null;

  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    pixels[index] = 255;
    pixels[index + 1] = 255;
    pixels[index + 2] = 255;
    pixels[index + 3] = alpha > 18 ? 255 : 0;
  }
  sourceContext.putImageData(imageData, 0, 0);
  return sourceCanvas;
}

function createTintedObjectMaskCanvas(object: HTMLImageElement, color: string): HTMLCanvasElement | null {
  const alphaMask = createObjectAlphaMaskCanvas(object);
  if (!alphaMask) return null;
  const canvas = document.createElement('canvas');
  canvas.width = alphaMask.width;
  canvas.height = alphaMask.height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(alphaMask, 0, 0);
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

function drawRoundedRectPath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function loadCanvasImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error('图片地址为空，无法导出。'));
      return;
    }
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败，无法导出 guide/mask。'));
    image.src = src;
  });
}

function estimateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] || '';
  return Math.round(base64.length * 0.75);
}

async function ensureUploadedImageAsset(image: UploadedImage, basename: string): Promise<{ image: UploadedImage; assetId: string }> {
  if (image.assetId) {
    return { image, assetId: image.assetId };
  }

  const file = dataUrlToFile(image.dataUrl, `${basename}-${Date.now()}`);
  const asset = await uploadImageAsset(file, image.name || file.name);
  return {
    image: {
      ...image,
      assetId: asset.id,
      url: asset.url,
    },
    assetId: asset.id,
  };
}

async function uploadDataUrlAsset(dataUrl: string, basename: string) {
  const file = dataUrlToFile(dataUrl, basename);
  return uploadImageAsset(file, file.name);
}

function dataUrlToFile(dataUrl: string, basename: string): File {
  const [header, encoded] = dataUrl.split(',');
  const mimeType = /^data:([^;,]+)/u.exec(header || '')?.[1] || 'image/png';
  const extension = getImageExtension(mimeType);
  const binary = window.atob(encoded || '');
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], `${basename}.${extension}`, { type: mimeType });
}

function getImageExtension(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/png') return 'png';
  return 'png';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function readImageDebugInfo(image: UploadedImage) {
  return {
    id: image.id,
    assetId: image.assetId,
    name: image.name,
    width: image.width,
    height: image.height,
    hasDataUrl: Boolean(image.dataUrl),
    url: image.url,
  };
}

function omitDataUrl(info: ExportedImageInfo) {
  return {
    width: info.width,
    height: info.height,
    bytesApprox: info.bytesApprox,
    dataUrlPrefix: info.dataUrl.slice(0, 32),
  };
}
