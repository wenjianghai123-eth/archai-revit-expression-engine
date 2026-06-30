import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Crosshair, Download, ExternalLink, ImagePlus, Move, RotateCcw, RotateCw, Trash2, Upload, X } from 'lucide-react';
import {
  GenerationConfig,
  GenerationResultOption,
  GenerationRunStateOverride,
  GenerationStep,
  ObjectInsertItemConfig,
  ObjectInsertDebugMode,
  ObjectFidelity,
  ObjectInsertHarmonyPriority,
  ObjectInsertCandidateStrategy,
  ObjectInsertUIMode,
  ObjectInsertPlacementMode,
  ObjectInsertPositionConstraintStrength,
  ObjectInsertSurface,
  ObjectInsertType,
  ObjectPlacement,
  StepState,
  UploadedImage,
} from '../types';
import { uploadImageAsset } from '../lib/api';
import { buildResultImageFilename, downloadAsset, downloadFallbackMessage } from '../utils/downloadAsset';
import { createUploadedImage, validateImageFile } from '../utils/file';
import { formatResultDimensions, getOriginalResultAssetId, getOriginalResultImageUrl } from '../utils/resultImage';
import { PromptVoiceAssistant } from './PromptVoiceAssistant';
import { AspectRatioImage } from './common/AspectRatioImage';
import { GenerationImageViewer } from './common/GenerationImageViewer';
import { IMAGE_UPLOAD_ACCEPT, readImageTypeUploadError } from '../utils/imageValidation';
import { SavePromptTemplateModal } from './SavePromptTemplateModal';
import { canSavePromptTemplate } from '../utils/savedPromptTemplates';

type UploadKind = 'source' | 'object';
type InteractionMode = 'move' | 'resize' | 'rotate';

interface ObjectInsertDraftItem {
  id: string;
  objectType: ObjectInsertType | string;
  objectLabel: string;
  referenceImages: UploadedImage[];
  placement: ObjectPlacement;
  objectInsertSurface: ObjectInsertSurface;
  objectFidelity: ObjectFidelity;
  enforceContactShadow: boolean;
  enforceOcclusion: boolean;
  enforcePerspectiveScale: boolean;
  placementMode: ObjectInsertPlacementMode;
  placementIntent: string;
  extraPrompt: string;
}

interface ObjectInsertPanelProps {
  state: StepState;
  onUpdateInputImage: (image: UploadedImage | null) => void;
  onUpdateMaterialImage: (image: UploadedImage | null) => void;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
  onGenerate: (stateOverride?: GenerationRunStateOverride) => void;
  onContinueRefineSource?: (image: UploadedImage, source: { resultId?: string; label: string }) => void;
  projectName?: string | null;
  isAdmin?: boolean;
}

interface InteractionState {
  mode: InteractionMode;
  itemId: string;
  startClientX: number;
  startClientY: number;
  startPlacement: ObjectPlacement;
  startAspect: number;
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

type ObjectInsertConfigPatch = Partial<NonNullable<GenerationConfig['objectInsert']>>;

const minObjectSize = 24;
const emptyPlacement: ObjectPlacement = { x: 0, y: 0, width: 0, height: 0, rotation: 0 };
const objectInsertDebugModeOptions: Array<{ value: ObjectInsertDebugMode; label: string }> = [
  { value: 'full', label: '完整输入：原图 + 物体 + guide + mask' },
  { value: 'source_prompt', label: '只提交原图 + prompt' },
  { value: 'source_object', label: '原图 + 物体参考图' },
  { value: 'source_object_mask', label: '原图 + 物体参考图 + mask' },
  { value: 'source_object_preview', label: '原图 + 物体参考图 + placement guide' },
  { value: 'source_placement_preview', label: '原图 + 干净摆放示意图' },
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
const objectInsertPlacementModeOptions: Array<{
  value: ObjectInsertPlacementMode;
  label: string;
  description: string;
}> = [
  { value: 'natural', label: '自然摆放', description: '该框表示建议区域，不是绝对位置。AI 会优先参考原图空间布局，自动优化家具位置、朝向和比例。' },
  { value: 'strict', label: '精确摆放', description: 'AI 将尽量按照当前框的位置、大小和角度生成。' },
];
const objectInsertHarmonyPriorityOptions: Array<{ value: ObjectInsertHarmonyPriority; label: string }> = [
  { value: 'layout', label: '布局关系' },
  { value: 'style', label: '风格材质' },
  { value: 'balance', label: '视觉平衡' },
];
const objectInsertCandidateStrategyOptions: Array<{ value: ObjectInsertCandidateStrategy; label: string; hint: string }> = [
  { value: 'strict-placement', label: '严格贴合摆放', hint: 'Candidate strategy: strict-placement. Follow the user placement guide closely; minimize position, scale, and rotation deviation.' },
  { value: 'natural-fit', label: '自然微调位置比例', hint: 'Candidate strategy: natural-fit. Slightly adjust position, scale, and perspective for a natural scene fit while respecting the guide.' },
  { value: 'object-fidelity', label: '优先保留物体造型', hint: 'Candidate strategy: object-fidelity. Prioritize preserving the reference object shape, material, color, and identity.' },
  { value: 'scene-harmony', label: '优先融入场景光影', hint: 'Candidate strategy: scene-harmony. Prioritize lighting, shadow, perspective, occlusion, and atmospheric harmony with the scene.' },
];

const objectTypeOptions: Array<{ value: ObjectInsertType; label: string }> = [
  { value: 'sofa', label: '沙发' },
  { value: 'chair', label: '椅子' },
  { value: 'table', label: '桌子' },
  { value: 'lamp', label: '灯具' },
  { value: 'plant', label: '绿植' },
  { value: 'artwork', label: '装饰画' },
  { value: 'sculpture', label: '雕塑' },
  { value: 'car', label: '车辆' },
  { value: 'person', label: '人物' },
  { value: 'tree', label: '树木' },
  { value: 'signage', label: '标识' },
  { value: 'custom', label: '自定义' },
];
const legacyObjectTypeLabels: Record<string, string> = {
  furniture: '家具',
  ceiling_light: '吊顶灯',
  coffee_table: '茶几',
  bed: '床',
  cabinet: '边柜',
  rug: '地毯',
  decorative_painting: '装饰画',
};
const objectInsertSurfaceOptions: Array<{ value: ObjectInsertSurface; label: string }> = [
  { value: 'auto', label: '自动' },
  { value: 'floor', label: '地面' },
  { value: 'wall', label: '墙面' },
  { value: 'ceiling', label: '天花' },
  { value: 'tabletop', label: '桌面' },
  { value: 'outdoor-ground', label: '室外地面' },
];
const objectFidelityOptions: Array<{ value: ObjectFidelity; label: string }> = [
  { value: 'strict', label: '严格保留' },
  { value: 'balanced', label: '平衡' },
  { value: 'loose', label: '自然融合' },
];
const maxObjectItems = 8;
const maxReferencesPerObject = 6;
const softAnchorPlacementConfig = {
  placementConstraintMode: 'soft-anchor' as const,
  placementAnchorStrength: 0.72,
  maxCenterOffsetRatio: 0.12,
  maxScaleAdjustmentRatio: 0.18,
  maxRotationAdjustmentDeg: 20,
};

interface DebugSubmitPreviewItem {
  id: string;
  label: string;
  included: boolean;
  imageUrl?: string;
  detail: string;
}

export function ObjectInsertPanel({
  state,
  onUpdateInputImage,
  onUpdateMaterialImage,
  onUpdateConfig,
  onGenerate,
  onContinueRefineSource,
  projectName,
  isAdmin = false,
}: ObjectInsertPanelProps) {
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const objectInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<InteractionState | null>(null);
  const initializedPairRef = useRef<string>('');

  const sourceImage = state.inputImage;
  const [objectItems, setObjectItems] = useState<ObjectInsertDraftItem[]>(() => createInitialObjectItems(state.config, state.materialImage));
  const [activeItemId, setActiveItemId] = useState(() => objectItems[0]?.id || createObjectItemId());
  const activeObjectItem = objectItems.find(item => item.id === activeItemId) || objectItems[0] || null;
  const objectImage = activeObjectItem?.referenceImages[0] || state.materialImage;
  const [placement, setPlacement] = useState<ObjectPlacement>(() => sanitizePlacement(activeObjectItem?.placement || state.config.objectPlacement || emptyPlacement));
  const [uploadErrors, setUploadErrors] = useState<Record<UploadKind, string | null>>({ source: null, object: null });
  const [message, setMessage] = useState<string | null>(null);
  const [isSelected, setIsSelected] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isPreparingGeneration, setIsPreparingGeneration] = useState(false);
  const [isDownloadingResult, setIsDownloadingResult] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [isSafetyDebugEnabled, setIsSafetyDebugEnabled] = useState(false);
  const [debugInputMode, setDebugInputMode] = useState<ObjectInsertDebugMode>('full');
  const [isSaveTemplateOpen, setIsSaveTemplateOpen] = useState(false);

  const sourceWidth = sourceImage?.width || 1200;
  const sourceHeight = sourceImage?.height || 800;
  const configObjectItems = useMemo(() => toObjectInsertConfigItems(objectItems), [objectItems]);

  const getObjectPlacementStyle = useCallback((itemPlacement: ObjectPlacement): React.CSSProperties => ({
    left: `${(itemPlacement.x / sourceWidth) * 100}%`,
    top: `${(itemPlacement.y / sourceHeight) * 100}%`,
    width: `${(itemPlacement.width / sourceWidth) * 100}%`,
    height: `${(itemPlacement.height / sourceHeight) * 100}%`,
    transform: `rotate(${itemPlacement.rotation}deg)`,
    transformOrigin: 'center center',
  }), [sourceHeight, sourceWidth]);
  const canShowSafetyDebug = isAdmin || import.meta.env.DEV;
  const uiMode: ObjectInsertUIMode = state.config.objectInsertUIMode === 'advanced' ? 'advanced' : 'simple';
  const candidateCount = state.config.batchCount === 2 || state.config.batchCount === 3 ? state.config.batchCount : 1;
  const candidateStrategy = readObjectInsertCandidateStrategy(state.config);
  const candidateStrategies = resolveObjectInsertCandidateStrategies(state.config, candidateCount);
  const activeDebugMode: ObjectInsertDebugMode = canShowSafetyDebug && isSafetyDebugEnabled ? debugInputMode : 'full';
  const positionConstraintStrength = readObjectInsertPositionConstraintStrength(state.config);
  const positionConstraintOption = objectInsertPositionConstraintOptions.find(option => option.value === positionConstraintStrength)
    || objectInsertPositionConstraintOptions[2];
  const placementMode = activeObjectItem?.placementMode || readObjectInsertPlacementMode(state.config);
  const placementModeOption = objectInsertPlacementModeOptions.find(option => option.value === placementMode)
    || objectInsertPlacementModeOptions[0];
  const selectedResult = state.generationResults.find(result => result.isSelected) || state.generationResults[0];
  const originalResultImage = getOriginalResultImageUrl(selectedResult, state.outputImage);
  const originalResultAssetId = getOriginalResultAssetId(selectedResult);
  const resultDimensionsText = formatResultDimensions(selectedResult);
  const canSaveTemplate = canSavePromptTemplate(GenerationStep.ObjectInsert, state, selectedResult, originalResultImage);
  const placementIntent = activeObjectItem?.placementIntent || readObjectInsertPlacementIntent(state.config);
  const harmonyPriority = readObjectInsertHarmonyPriority(state.config);
  const allowAutoAdjustPosition = readObjectInsertAutoAdjust(state.config, 'allowAutoAdjustPosition');
  const allowAutoAdjustRotation = readObjectInsertAutoAdjust(state.config, 'allowAutoAdjustRotation');
  const allowAutoAdjustScale = readObjectInsertAutoAdjust(state.config, 'allowAutoAdjustScale');
  const activeObjectType = readActiveObjectType(state.config, activeObjectItem);
  const activeObjectInsertSurface = readActiveObjectInsertSurface(state.config, activeObjectItem);
  const activeObjectFidelity = readActiveObjectFidelity(state.config, activeObjectItem);
  const enforceContactShadow = readObjectInsertBooleanConstraint(state.config, activeObjectItem, 'enforceContactShadow');
  const enforceOcclusion = readObjectInsertBooleanConstraint(state.config, activeObjectItem, 'enforceOcclusion');
  const enforcePerspectiveScale = readObjectInsertBooleanConstraint(state.config, activeObjectItem, 'enforcePerspectiveScale');
  const generationPreflightWarnings = useMemo(() => buildObjectInsertPreflightWarnings({
    surface: activeObjectInsertSurface,
    objectImage,
    placement: activeObjectItem?.placement || placement,
    sourceWidth,
    sourceHeight,
  }), [activeObjectInsertSurface, activeObjectItem?.placement, objectImage, placement, sourceHeight, sourceWidth]);
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

  const buildObjectInsertConfigPatch = useCallback((patch: Partial<GenerationConfig> = {}): Partial<GenerationConfig> => {
    const nextPlacementMode = patch.placementMode || placementMode;
    const nextPlacementIntent = patch.placementIntent ?? placementIntent;
    const nextHarmonyPriority = patch.harmonyPriority || harmonyPriority;
    const nextAllowPosition = patch.allowAutoAdjustPosition ?? allowAutoAdjustPosition;
    const nextAllowRotation = patch.allowAutoAdjustRotation ?? allowAutoAdjustRotation;
    const nextAllowScale = patch.allowAutoAdjustScale ?? allowAutoAdjustScale;
    const nextObjectType = patch.objectType || activeObjectType;
    const nextObjectInsertSurface = patch.objectInsertSurface || activeObjectInsertSurface;
    const nextObjectFidelity = patch.objectFidelity || activeObjectFidelity;
    const nextEnforceContactShadow = patch.enforceContactShadow ?? enforceContactShadow;
    const nextEnforceOcclusion = patch.enforceOcclusion ?? enforceOcclusion;
    const nextEnforcePerspectiveScale = patch.enforcePerspectiveScale ?? enforcePerspectiveScale;
    const nextPositionConstraint = patch.positionConstraintStrength || positionConstraintStrength;
    const nextPlacement = patch.objectPlacement || placement;
    const nextCandidateStrategy = patch.objectInsertCandidateStrategy || candidateStrategy;
    const nextCandidateCount = patch.batchCount === 2 || patch.batchCount === 3
      ? patch.batchCount
      : candidateCount;
    const nextCandidateStrategies = patch.objectInsertCandidateStrategies || resolveObjectInsertCandidateStrategies({
      ...state.config,
      objectInsertCandidateStrategy: nextCandidateStrategy,
      batchCount: nextCandidateCount,
    }, nextCandidateCount);
    const nextCandidatePromptHints = patch.objectInsertCandidatePromptHints || buildObjectInsertCandidatePromptHints(nextCandidateStrategies);
    const nestedPatch: ObjectInsertConfigPatch = patch.objectInsert || {};

    return {
      ...patch,
      objectInsertUIMode: patch.objectInsertUIMode || uiMode,
      objectInsertCandidateStrategy: nextCandidateStrategy,
      objectInsertCandidateStrategies: nextCandidateStrategies,
      objectInsertCandidatePromptHints: nextCandidatePromptHints,
      placementMode: nextPlacementMode,
      placementIntent: nextPlacementIntent,
      harmonyPriority: nextHarmonyPriority,
      allowAutoAdjustPosition: nextAllowPosition,
      allowAutoAdjustRotation: nextAllowRotation,
      allowAutoAdjustScale: nextAllowScale,
      objectType: nextObjectType,
      objectInsertSurface: nextObjectInsertSurface,
      objectFidelity: nextObjectFidelity,
      enforceContactShadow: nextEnforceContactShadow,
      enforceOcclusion: nextEnforceOcclusion,
      enforcePerspectiveScale: nextEnforcePerspectiveScale,
      positionConstraintStrength: nextPositionConstraint,
      objectPlacement: nextPlacement,
      objectInsert: {
        ...(state.config.objectInsert || {}),
        ...nestedPatch,
        sourceImageAssetId: nestedPatch.sourceImageAssetId || sourceImage?.assetId || state.config.objectInsert?.sourceImageAssetId,
        objectItems: nestedPatch.objectItems || configObjectItems,
        globalExtraPrompt: state.config.objectInsertExtraPrompt || state.config.customPrompt || '',
        objectReferenceAssetId: nestedPatch.objectReferenceAssetId || objectImage?.assetId || state.config.objectInsert?.objectReferenceAssetId,
        objectReferenceAssetIds: activeObjectItem?.referenceImages.map(image => image.assetId).filter((assetId): assetId is string => Boolean(assetId)),
        placement: nextPlacement,
        extraPrompt: nestedPatch.extraPrompt ?? state.config.objectInsertExtraPrompt ?? state.config.customPrompt ?? '',
        positionConstraintStrength: nextPositionConstraint,
        placementMode: nextPlacementMode,
        placementIntent: nextPlacementIntent,
        harmonyPriority: nextHarmonyPriority,
        allowAutoAdjustPosition: nextAllowPosition,
        allowAutoAdjustRotation: nextAllowRotation,
        allowAutoAdjustScale: nextAllowScale,
        objectInsertCandidateStrategy: nextCandidateStrategy,
        objectInsertCandidateStrategies: nextCandidateStrategies,
        objectInsertCandidatePromptHints: nextCandidatePromptHints,
        objectType: nestedPatch.objectType || nextObjectType,
        objectInsertSurface: nestedPatch.objectInsertSurface || nextObjectInsertSurface,
        objectFidelity: nestedPatch.objectFidelity || nextObjectFidelity,
        enforceContactShadow: nestedPatch.enforceContactShadow ?? nextEnforceContactShadow,
        enforceOcclusion: nestedPatch.enforceOcclusion ?? nextEnforceOcclusion,
        enforcePerspectiveScale: nestedPatch.enforcePerspectiveScale ?? nextEnforcePerspectiveScale,
      },
    };
  }, [
    activeObjectItem?.referenceImages,
    activeObjectFidelity,
    activeObjectInsertSurface,
    activeObjectType,
    allowAutoAdjustPosition,
    allowAutoAdjustRotation,
    allowAutoAdjustScale,
    candidateCount,
    candidateStrategy,
    configObjectItems,
    enforceContactShadow,
    enforceOcclusion,
    enforcePerspectiveScale,
    harmonyPriority,
    objectImage?.assetId,
    placement,
    placementIntent,
    placementMode,
    positionConstraintStrength,
    sourceImage?.assetId,
    state.config.customPrompt,
    state.config.objectInsert,
    state.config.objectInsertExtraPrompt,
    uiMode,
  ]);

  const updatePlacement = useCallback((nextPlacement: ObjectPlacement, itemId = activeObjectItem?.id) => {
    if (!itemId) return;
    const targetItem = objectItems.find(item => item.id === itemId);
    if (!targetItem) return;
    const next = sanitizePlacement(nextPlacement, sourceWidth, sourceHeight);
    const nextItems = objectItems.map(item => item.id === itemId ? { ...item, placement: next } : item);
    setPlacement(next);
    setObjectItems(nextItems);
    onUpdateConfig(buildObjectInsertConfigPatch({
      sourceImageAssetId: sourceImage?.assetId,
      objectReferenceAssetId: targetItem.referenceImages[0]?.assetId,
      objectPlacement: next,
      objectInsert: {
        ...(state.config.objectInsert || {}),
        objectItems: toObjectInsertConfigItems(nextItems),
      },
      objectInsertExtraPrompt: state.config.objectInsertExtraPrompt || '',
      customPrompt: state.config.objectInsertExtraPrompt || state.config.customPrompt || '',
    }));
  }, [activeObjectItem?.id, buildObjectInsertConfigPatch, objectItems, onUpdateConfig, sourceHeight, sourceImage?.assetId, sourceWidth, state.config.customPrompt, state.config.objectInsert, state.config.objectInsertExtraPrompt]);

  const createPlacementForImages = useCallback((source: UploadedImage | null, object: UploadedImage | null) => {
    if (!source || !object) return emptyPlacement;
    return createInitialPlacement(source, object);
  }, []);

  const applyObjectItems = useCallback((nextItems: ObjectInsertDraftItem[], nextActiveId = activeItemId) => {
    const safeItems = nextItems.slice(0, maxObjectItems);
    const nextActiveItem = safeItems.find(item => item.id === nextActiveId) || safeItems[0] || null;
    setObjectItems(safeItems);
    setActiveItemId(nextActiveItem?.id || '');
    onUpdateMaterialImage(nextActiveItem?.referenceImages[0] || null);
    setPlacement(nextActiveItem?.placement || emptyPlacement);
    onUpdateConfig(buildObjectInsertConfigPatch({
      objectReferenceAssetId: nextActiveItem?.referenceImages[0]?.assetId,
      objectPlacement: nextActiveItem?.placement || emptyPlacement,
      placementMode: nextActiveItem?.placementMode || placementMode,
      placementIntent: nextActiveItem?.placementIntent || placementIntent,
      objectInsert: {
        ...(state.config.objectInsert || {}),
        objectItems: toObjectInsertConfigItems(safeItems),
      },
    }));
  }, [activeItemId, buildObjectInsertConfigPatch, onUpdateConfig, onUpdateMaterialImage, placementIntent, placementMode, state.config.objectInsert]);

  const handleAddObjectItem = useCallback(() => {
    if (objectItems.length >= maxObjectItems) {
      setMessage(`一次任务最多添加 ${maxObjectItems} 个对象。`);
      return;
    }
    const nextItem = createDefaultObjectItem(objectItems.length);
    applyObjectItems([...objectItems, nextItem], nextItem.id);
  }, [applyObjectItems, objectItems]);

  const handleUpdateObjectItem = useCallback((itemId: string, patch: Partial<ObjectInsertDraftItem>) => {
    const nextItems = objectItems.map(item => item.id === itemId ? { ...item, ...patch } : item);
    applyObjectItems(nextItems, itemId);
  }, [applyObjectItems, objectItems]);

  const handleRemoveObjectItem = useCallback((itemId: string) => {
    const nextItems = objectItems.filter(item => item.id !== itemId);
    applyObjectItems(nextItems, nextItems[0]?.id);
  }, [applyObjectItems, objectItems]);

  const handleRemoveObjectReference = useCallback((itemId: string, imageId: string) => {
    const nextItems = objectItems.map(item => item.id === itemId
      ? { ...item, referenceImages: item.referenceImages.filter(image => image.id !== imageId) }
      : item);
    applyObjectItems(nextItems, itemId);
  }, [applyObjectItems, objectItems]);

  useEffect(() => {
    if (!activeObjectItem) return;
    const nextPlacement = activeObjectItem.placement?.width && activeObjectItem.placement.height
      ? sanitizePlacement(activeObjectItem.placement, sourceWidth, sourceHeight)
      : createPlacementForImages(sourceImage, activeObjectItem.referenceImages[0]);
    setPlacement(nextPlacement);
    if (activeObjectItem.referenceImages[0]) {
      onUpdateMaterialImage(activeObjectItem.referenceImages[0]);
    }
  }, [activeItemId, activeObjectItem, createPlacementForImages, onUpdateMaterialImage, sourceHeight, sourceImage, sourceWidth]);

  useEffect(() => {
    if (objectItems.some(item => item.referenceImages.length > 0)) return;
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
    onUpdateConfig(buildObjectInsertConfigPatch({
      sourceImageAssetId: sourceImage.assetId,
      objectReferenceAssetId: objectImage.assetId,
      objectPlacement: nextPlacement,
      objectInsertExtraPrompt: state.config.objectInsertExtraPrompt || '',
    }));
  }, [
    buildObjectInsertConfigPatch,
    objectImage,
    objectItems,
    onUpdateConfig,
    sourceHeight,
    sourceImage,
    sourceWidth,
    state.config.customPrompt,
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
        }, interaction.itemId);
        return;
      }

      if (interaction.mode === 'resize') {
        const dx = (event.clientX - interaction.startClientX) / metrics.scaleX;
        const width = Math.max(minObjectSize, interaction.startPlacement.width + dx);
        updatePlacement({
          ...interaction.startPlacement,
          width,
          height: Math.max(minObjectSize, width / interaction.startAspect),
        }, interaction.itemId);
        return;
      }

      const centerX = metrics.rect.left + (interaction.startPlacement.x + interaction.startPlacement.width / 2) * metrics.scaleX;
      const centerY = metrics.rect.top + (interaction.startPlacement.y + interaction.startPlacement.height / 2) * metrics.scaleY;
      const rotation = Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI + 90;
      updatePlacement({
        ...interaction.startPlacement,
        rotation,
      }, interaction.itemId);
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
  }, [getStageMetrics, updatePlacement]);

  const handleUploadImage = useCallback(async (kind: UploadKind, fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;

    const validationError = validateImageFile(file, `object-insert:${kind}`);
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
      } catch (error) {
        const uploadError = readImageTypeUploadError(error);
        if (uploadError) {
          setUploadErrors(prev => ({ ...prev, [kind]: uploadError }));
          return;
        }
        setMessage('图片已用于本地画布预览，素材上传暂不可用。');
      }

      setUploadErrors(prev => ({ ...prev, [kind]: null }));
      setExportResult(null);

      if (kind === 'source') {
        onUpdateInputImage(image);
        const nextItems = objectItems.map((item, index) => {
          const itemImage = item.referenceImages[0];
          if (!itemImage) return item;
          const shouldInitialize = !item.placement.width || !item.placement.height || item.placement === emptyPlacement;
          return shouldInitialize
            ? { ...item, placement: offsetPlacement(createPlacementForImages(image, itemImage), image.width || sourceWidth, image.height || sourceHeight, index) }
            : { ...item, placement: sanitizePlacement(item.placement, image.width || sourceWidth, image.height || sourceHeight) };
        });
        const nextActiveItem = nextItems.find(item => item.id === activeItemId) || nextItems[0];
        if (nextItems.length > 0) setObjectItems(nextItems);
        if (nextActiveItem) setPlacement(nextActiveItem.placement);
        onUpdateConfig({
          sourceImageAssetId: image.assetId,
          objectReferenceAssetId: nextActiveItem?.referenceImages[0]?.assetId,
          objectPlacement: nextActiveItem?.placement || emptyPlacement,
          objectInsert: {
            ...(state.config.objectInsert || {}),
            sourceImageAssetId: image.assetId,
            objectItems: toObjectInsertConfigItems(nextItems),
          },
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
      setMessage(baseMessage);
    } catch (error) {
      setUploadErrors(prev => ({
        ...prev,
        [kind]: error instanceof Error ? error.message : '图片读取失败，请重试。',
      }));
    }
  }, [
    activeItemId,
    createPlacementForImages,
    objectImage,
    objectItems,
    onUpdateConfig,
    onUpdateInputImage,
    onUpdateMaterialImage,
    sourceImage,
    sourceHeight,
    sourceWidth,
    state.config.objectInsert,
  ]);

  const handleUploadObjectReferences = useCallback(async (fileList: FileList | null) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    const baseItems = objectItems.filter(item => item.referenceImages.length > 0);
    const availableSlots = Math.max(0, maxObjectItems - baseItems.length);
    const selectedFiles = files.slice(0, availableSlots);
    if (selectedFiles.length === 0) {
      setUploadErrors(prev => ({ ...prev, object: `一次任务最多添加 ${maxObjectItems} 个对象。` }));
      return;
    }

    try {
      const newItems: ObjectInsertDraftItem[] = [];
      for (const file of selectedFiles) {
        const validationError = validateImageFile(file, 'object-insert:object-reference');
        if (validationError) {
          setUploadErrors(prev => ({ ...prev, object: validationError }));
          return;
        }
        const localImage = await createUploadedImage(file);
        let image = localImage;
        try {
          const asset = await uploadImageAsset(file, file.name);
          image = { ...localImage, assetId: asset.id, url: asset.url };
        } catch (error) {
          const uploadError = readImageTypeUploadError(error);
          if (uploadError) {
            setUploadErrors(prev => ({ ...prev, object: uploadError }));
            return;
          }
          setMessage('图片已用于本地预览，素材上传暂不可用。');
        }
        const itemIndex = baseItems.length + newItems.length;
        const basePlacement = sourceImage ? createPlacementForImages(sourceImage, image) : emptyPlacement;
        const typeLabel = readObjectTypeLabel(activeObjectType);
        const nextItem = {
          ...createDefaultObjectItem(itemIndex),
          objectType: activeObjectType || 'custom',
          objectLabel: `${typeLabel} ${itemIndex + 1}`,
          referenceImages: [image],
          placement: sourceImage ? offsetPlacement(basePlacement, sourceWidth, sourceHeight, itemIndex) : basePlacement,
          objectInsertSurface: activeObjectInsertSurface,
          objectFidelity: activeObjectFidelity,
          enforceContactShadow,
          enforceOcclusion,
          enforcePerspectiveScale,
          placementMode,
          placementIntent,
        };
        newItems.push(nextItem);
      }

      const nextItems = [...baseItems, ...newItems].slice(0, maxObjectItems);
      const nextActiveItem = newItems[0] || nextItems[0];
      setObjectItems(nextItems);
      setActiveItemId(nextActiveItem.id);
      if (nextActiveItem.referenceImages[0]) onUpdateMaterialImage(nextActiveItem.referenceImages[0]);
      if (nextActiveItem.placement) setPlacement(nextActiveItem.placement);
      setUploadErrors(prev => ({ ...prev, object: null }));
      setExportResult(null);
      onUpdateConfig(buildObjectInsertConfigPatch({
        objectReferenceAssetId: nextActiveItem.referenceImages[0]?.assetId,
        objectPlacement: nextActiveItem.placement,
        objectInsert: {
          ...(state.config.objectInsert || {}),
          objectItems: toObjectInsertConfigItems(nextItems),
        },
      }));
      setMessage(`已新增 ${newItems.length} 个植入对象。`);
    } catch (error) {
      setUploadErrors(prev => ({
        ...prev,
        object: error instanceof Error ? error.message : '图片读取失败，请重试。',
      }));
    }
  }, [
    activeObjectFidelity,
    activeObjectInsertSurface,
    activeObjectType,
    buildObjectInsertConfigPatch,
    createPlacementForImages,
    enforceContactShadow,
    enforceOcclusion,
    enforcePerspectiveScale,
    objectItems,
    onUpdateConfig,
    onUpdateMaterialImage,
    placementIntent,
    placementMode,
    sourceImage,
    sourceHeight,
    sourceWidth,
    state.config.objectInsert,
  ]);

  const startInteraction = (itemId: string, mode: InteractionMode, event: React.PointerEvent<HTMLElement>) => {
    const item = objectItems.find(candidate => candidate.id === itemId);
    const itemImage = item?.referenceImages[0];
    if (!sourceImage || !item || !itemImage) return;
    event.preventDefault();
    event.stopPropagation();
    setActiveItemId(itemId);
    setPlacement(item.placement);
    onUpdateMaterialImage(itemImage);
    setIsSelected(true);
    interactionRef.current = {
      mode,
      itemId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPlacement: item.placement,
      startAspect: itemImage.width && itemImage.height ? itemImage.width / itemImage.height : 1,
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
    onUpdateConfig(buildObjectInsertConfigPatch({
      objectInsert: {
        ...(state.config.objectInsert || {}),
        extraPrompt: value,
      } as GenerationConfig['objectInsert'],
      objectInsertExtraPrompt: value,
      customPrompt: value,
    }));
  };

  const handlePositionConstraintStrengthChange = (value: ObjectInsertPositionConstraintStrength) => {
    onUpdateConfig(buildObjectInsertConfigPatch({
      positionConstraintStrength: value,
    }));
  };

  const handlePlacementModeChange = (value: ObjectInsertPlacementMode) => {
    if (activeObjectItem) {
      handleUpdateObjectItem(activeObjectItem.id, { placementMode: value });
    }
    onUpdateConfig(buildObjectInsertConfigPatch({
      placementMode: value,
      allowAutoAdjustPosition: value === 'natural' ? true : allowAutoAdjustPosition,
      allowAutoAdjustRotation: value === 'natural' ? true : allowAutoAdjustRotation,
      allowAutoAdjustScale: value === 'natural' ? true : allowAutoAdjustScale,
    }));
  };

  const handlePlacementIntentChange = (value: string) => {
    if (activeObjectItem) {
      handleUpdateObjectItem(activeObjectItem.id, { placementIntent: value });
    }
    onUpdateConfig(buildObjectInsertConfigPatch({
      placementIntent: value,
    }));
  };

  const handleHarmonyPriorityChange = (value: ObjectInsertHarmonyPriority) => {
    onUpdateConfig(buildObjectInsertConfigPatch({
      harmonyPriority: value,
    }));
  };

  const handleCandidateCountChange = (count: 1 | 2 | 3) => {
    const strategies = resolveObjectInsertCandidateStrategies({
      ...state.config,
      batchCount: count,
      objectInsertCandidateStrategy: candidateStrategy,
    }, count);
    onUpdateConfig(buildObjectInsertConfigPatch({
      batchCount: count,
      objectInsertCandidateStrategies: strategies,
      objectInsertCandidatePromptHints: buildObjectInsertCandidatePromptHints(strategies),
    }));
  };

  const handleCandidateStrategyChange = (value: ObjectInsertCandidateStrategy) => {
    const strategies = resolveObjectInsertCandidateStrategies({
      ...state.config,
      objectInsertCandidateStrategy: value,
      batchCount: candidateCount,
    }, candidateCount);
    onUpdateConfig(buildObjectInsertConfigPatch({
      objectInsertCandidateStrategy: value,
      objectInsertCandidateStrategies: strategies,
      objectInsertCandidatePromptHints: buildObjectInsertCandidatePromptHints(strategies),
    }));
  };

  const handleAutoAdjustChange = (
    key: 'allowAutoAdjustPosition' | 'allowAutoAdjustRotation' | 'allowAutoAdjustScale',
    value: boolean,
  ) => {
    onUpdateConfig(buildObjectInsertConfigPatch({
      [key]: value,
    }));
  };

  const handleObjectTypeChange = (value: string) => {
    if (activeObjectItem) {
      handleUpdateObjectItem(activeObjectItem.id, { objectType: value });
    }
    onUpdateConfig(buildObjectInsertConfigPatch({
      objectType: value,
      objectInsert: {
        ...(state.config.objectInsert || {}),
        objectType: value,
      },
    }));
  };

  const handleObjectSurfaceChange = (value: ObjectInsertSurface) => {
    if (activeObjectItem) {
      handleUpdateObjectItem(activeObjectItem.id, { objectInsertSurface: value });
    }
    onUpdateConfig(buildObjectInsertConfigPatch({
      objectInsertSurface: value,
      objectInsert: {
        ...(state.config.objectInsert || {}),
        objectInsertSurface: value,
      },
    }));
  };

  const handleObjectFidelityChange = (value: ObjectFidelity) => {
    if (activeObjectItem) {
      handleUpdateObjectItem(activeObjectItem.id, { objectFidelity: value });
    }
    onUpdateConfig(buildObjectInsertConfigPatch({
      objectFidelity: value,
      objectInsert: {
        ...(state.config.objectInsert || {}),
        objectFidelity: value,
      },
    }));
  };

  const handleObjectConstraintChange = (
    key: 'enforceContactShadow' | 'enforceOcclusion' | 'enforcePerspectiveScale',
    value: boolean,
  ) => {
    if (activeObjectItem) {
      handleUpdateObjectItem(activeObjectItem.id, { [key]: value });
    }
    onUpdateConfig(buildObjectInsertConfigPatch({
      [key]: value,
      objectInsert: {
        ...(state.config.objectInsert || {}),
        [key]: value,
      },
    }));
  };

  const handleExport = async () => {
    if (!sourceImage || !objectImage) {
      setMessage('请先上传原始场景图和物体参考图。');
      return;
    }

    setIsExporting(true);
    try {
      const guide = await exportCompositePlacementPreview(sourceImage, [{
        image: objectImage,
        placement,
      }]);
      const mask = await exportPlacementMask(sourceImage, objectImage, placement);
      const nextResult = { preview: guide, mask, placement };
      setExportResult(nextResult);
      onUpdateConfig(buildObjectInsertConfigPatch({
        sourceImageAssetId: sourceImage.assetId,
        objectReferenceAssetId: objectImage.assetId,
        objectPlacement: placement,
        placementGuideAssetId: undefined,
        placementPreviewAssetId: undefined,
        placementMaskAssetId: undefined,
      }));
      console.info('[ObjectInsert] placement export', {
        sourceImage: readImageDebugInfo(sourceImage),
        objectImage: readImageDebugInfo(objectImage),
        placement,
        placementMode,
        placementIntent,
        positionConstraintStrength,
        cleanPlacementPreview: omitDataUrl(guide),
        mask: omitDataUrl(mask),
      });
      setMessage('已导出干净摆放示意图和精确 mask，详细信息已输出到控制台。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '导出失败，请重试。');
    } finally {
      setIsExporting(false);
    }
  };

  const handleGenerateClick = async (configOverride: Partial<GenerationConfig> = {}) => {
    if (state.isGenerating || isPreparingGeneration) return;
    if (!sourceImage || !objectImage) {
      setMessage('请先上传原始场景图和物体参考图。');
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
      const effectiveConfig = {
        ...state.config,
        ...configOverride,
        objectInsert: {
          ...(state.config.objectInsert || {}),
          ...(configOverride.objectInsert || {}),
        },
      } as GenerationConfig;
      const nextPlacementMode = readObjectInsertPlacementMode(effectiveConfig);
      const nextPlacementIntent = readObjectInsertPlacementIntent(effectiveConfig);
      const nextHarmonyPriority = readObjectInsertHarmonyPriority(effectiveConfig);
      const nextAllowAutoAdjustPosition = readObjectInsertAutoAdjust(effectiveConfig, 'allowAutoAdjustPosition');
      const nextAllowAutoAdjustRotation = readObjectInsertAutoAdjust(effectiveConfig, 'allowAutoAdjustRotation');
      const nextAllowAutoAdjustScale = readObjectInsertAutoAdjust(effectiveConfig, 'allowAutoAdjustScale');

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
        ...effectiveConfig,
        step: 'object_insert',
        sourceImageAssetId: sourceAssetId,
        objectReferenceAssetId: includeObject ? objectAssetId : undefined,
        placementPreviewAssetId: includePreview ? previewAsset.id : undefined,
        placementGuideAssetId: includePreview ? previewAsset.id : undefined,
        placementMaskAssetId: includeMask ? maskAsset.id : undefined,
        objectPlacement: placement,
        objectInsertDebugMode: activeDebugMode,
        positionConstraintStrength,
        placementMode: nextPlacementMode,
        placementIntent: nextPlacementIntent,
        harmonyPriority: nextHarmonyPriority,
        allowAutoAdjustPosition: nextAllowAutoAdjustPosition,
        allowAutoAdjustRotation: nextAllowAutoAdjustRotation,
        allowAutoAdjustScale: nextAllowAutoAdjustScale,
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
          placementMode: nextPlacementMode,
          placementIntent: nextPlacementIntent,
          harmonyPriority: nextHarmonyPriority,
          allowAutoAdjustPosition: nextAllowAutoAdjustPosition,
          allowAutoAdjustRotation: nextAllowAutoAdjustRotation,
          allowAutoAdjustScale: nextAllowAutoAdjustScale,
        },
        objectInsertExtraPrompt: state.config.objectInsertExtraPrompt || '',
        customPrompt: state.config.objectInsertExtraPrompt || state.config.customPrompt || '',
        maskMode: includeMask ? 'asset-mask' : undefined,
        maskAssetId: includeMask ? maskAsset.id : undefined,
        editTarget: 'furniture',
        preserveStructure: true,
        preserveCamera: true,
        objectInsertCandidateStrategy: effectiveConfig.objectInsertCandidateStrategy || candidateStrategy,
        objectInsertCandidateStrategies: candidateStrategies,
        objectInsertCandidatePromptHints: buildObjectInsertCandidatePromptHints(candidateStrategies),
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
        placementMode: nextPlacementMode,
        placementIntent: nextPlacementIntent,
        harmonyPriority: nextHarmonyPriority,
        allowAutoAdjustPosition: nextAllowAutoAdjustPosition,
        allowAutoAdjustRotation: nextAllowAutoAdjustRotation,
        allowAutoAdjustScale: nextAllowAutoAdjustScale,
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

  const handleGenerateMultiClick = async (configOverride: Partial<GenerationConfig> = {}) => {
    if (state.isGenerating || isPreparingGeneration) return;
    if (!sourceImage) {
      setMessage('请先上传原始场景图。');
      return;
    }
    const candidateItems = objectItems.filter(item => item.referenceImages.length > 0).slice(0, maxObjectItems);
    if (candidateItems.length === 0) {
      setMessage('请至少添加 1 个植入对象，并上传参考图。');
      return;
    }

    setIsPreparingGeneration(true);
    setMessage('正在准备多元素植入素材...');
    try {
      const previewFusionSourceUpload = await ensureUploadedImageAsset(sourceImage, 'object-insert-preview-fusion-source');
      const previewFusionItems = candidateItems.map(item => ({
        ...item,
        placement: item.id === activeObjectItem?.id ? placement : item.placement,
      }));
      const placementPreview = await exportCompositePlacementPreview(
        previewFusionSourceUpload.image,
        previewFusionItems.map(item => ({
          image: item.referenceImages[0],
          placement: item.placement,
        })),
      );
      const placementPreviewAsset = await uploadDataUrlAsset(placementPreview.dataUrl, `object-insert-placement-preview-${Date.now()}`);
      if (!placementPreviewAsset.id) {
        setMessage('摆放示意图生成失败，请重试。');
        return;
      }
      const effectivePreviewFusionConfig = {
        ...state.config,
        ...configOverride,
        objectInsert: {
          ...(state.config.objectInsert || {}),
          ...(configOverride.objectInsert || {}),
        },
      } as GenerationConfig;
      const previewFusionPlacementMode = readObjectInsertPlacementMode(effectivePreviewFusionConfig);
      const previewFusionPlacementIntent = readObjectInsertPlacementIntent(effectivePreviewFusionConfig);
      const previewFusionHarmonyPriority = readObjectInsertHarmonyPriority(effectivePreviewFusionConfig);
      const previewFusionAllowAutoAdjustPosition = true;
      const previewFusionAllowAutoAdjustRotation = readObjectInsertAutoAdjust(effectivePreviewFusionConfig, 'allowAutoAdjustRotation');
      const previewFusionAllowAutoAdjustScale = readObjectInsertAutoAdjust(effectivePreviewFusionConfig, 'allowAutoAdjustScale');
      const previewFusionObjectItemConfigs: ObjectInsertItemConfig[] = previewFusionItems.map(item => ({
        id: item.id,
        objectType: item.objectType || 'custom',
        objectLabel: item.objectLabel || undefined,
        referenceAssetIds: item.referenceImages.map(image => image.assetId).filter((assetId): assetId is string => Boolean(assetId)),
        placement: item.placement,
        placementPreviewAssetId: placementPreviewAsset.id,
        placementMode: item.placementMode || previewFusionPlacementMode,
        placementIntent: item.placementIntent || undefined,
        ...softAnchorPlacementConfig,
        extraPrompt: item.extraPrompt || undefined,
      }));
      const previewFusionConfigPatch: GenerationConfig = {
        ...effectivePreviewFusionConfig,
        step: 'object_insert',
        objectInsertMode: 'object_insert_preview_fusion',
        sourceImageAssetId: previewFusionSourceUpload.assetId,
        placementPreviewAssetId: placementPreviewAsset.id,
        placementGuideAssetId: placementPreviewAsset.id,
        objectReferenceAssetId: undefined,
        placementMaskAssetId: undefined,
        objectPlacement: previewFusionObjectItemConfigs[0]?.placement,
        objectInsertDebugMode: 'source_placement_preview',
        positionConstraintStrength: 'medium',
        placementMode: previewFusionPlacementMode,
        placementIntent: previewFusionPlacementIntent,
        harmonyPriority: previewFusionHarmonyPriority,
        ...softAnchorPlacementConfig,
        allowAutoAdjustPosition: previewFusionAllowAutoAdjustPosition,
        allowAutoAdjustRotation: previewFusionAllowAutoAdjustRotation,
        allowAutoAdjustScale: previewFusionAllowAutoAdjustScale,
        objectInsert: {
          mode: 'object_insert_preview_fusion',
          sourceImageAssetId: previewFusionSourceUpload.assetId,
          objectItems: previewFusionObjectItemConfigs,
          globalExtraPrompt: state.config.objectInsertExtraPrompt || state.config.customPrompt || '',
          previewAssetId: placementPreviewAsset.id,
          guideAssetId: placementPreviewAsset.id,
          placement: previewFusionObjectItemConfigs[0]?.placement,
          extraPrompt: state.config.objectInsertExtraPrompt || state.config.customPrompt || '',
          debugMode: 'source_placement_preview',
          positionConstraintStrength: 'medium',
          placementMode: previewFusionPlacementMode,
          placementIntent: previewFusionPlacementIntent,
          harmonyPriority: previewFusionHarmonyPriority,
          ...softAnchorPlacementConfig,
          allowAutoAdjustPosition: previewFusionAllowAutoAdjustPosition,
          allowAutoAdjustRotation: previewFusionAllowAutoAdjustRotation,
          allowAutoAdjustScale: previewFusionAllowAutoAdjustScale,
        },
        objectInsertInputOrder: undefined,
        objectInsertExtraPrompt: state.config.objectInsertExtraPrompt || '',
        customPrompt: state.config.objectInsertExtraPrompt || state.config.customPrompt || '',
        maskMode: undefined,
        maskAssetId: undefined,
        editTarget: 'furniture',
        preserveStructure: true,
        preserveCamera: true,
        batchCount: 1,
        objectInsertCandidateStrategy: 'natural-fit',
        objectInsertCandidateStrategies: ['natural-fit'],
        objectInsertCandidatePromptHints: buildObjectInsertCandidatePromptHints(['natural-fit']),
      };
      setExportResult({ preview: placementPreview, mask: placementPreview, placement: previewFusionObjectItemConfigs[0]?.placement || emptyPlacement });
      setObjectItems(objectItems.map(item => {
        const prepared = previewFusionItems.find(preparedItem => preparedItem.id === item.id);
        return prepared ? { ...item, placement: prepared.placement } : item;
      }));
      onUpdateInputImage(previewFusionSourceUpload.image);
      onUpdateMaterialImage(null);
      onUpdateConfig(previewFusionConfigPatch);
      console.debug('[ObjectInsert] create generation job payload', {
        step: 'object_insert',
        requestMode: 'inpaint',
        objectInsertMode: 'object_insert_preview_fusion',
        configMode: previewFusionConfigPatch.objectInsert?.mode,
        inputAssetIds: [previewFusionSourceUpload.assetId, placementPreviewAsset.id],
        sourceImageAssetId: previewFusionSourceUpload.assetId,
        placementPreviewAssetId: placementPreviewAsset.id,
        objectItemsCount: previewFusionObjectItemConfigs.length,
        objectItemsReferenceCount: previewFusionObjectItemConfigs.reduce((sum, item) => sum + item.referenceAssetIds.length, 0),
        providerImageCount: 2,
        sendsFurnitureReferencesToProvider: false,
        placementConstraintMode: 'soft-anchor',
        cleanPlacementPreview: true,
      });
      console.info('[ObjectInsert] preview fusion generation job payload prepared', {
        inputAssetIds: [previewFusionSourceUpload.assetId, placementPreviewAsset.id],
        providerImageCount: 2,
        sourceAssetId: previewFusionSourceUpload.assetId,
        placementPreviewAssetId: placementPreviewAsset.id,
        placementPreview: omitDataUrl(placementPreview),
        objectItems: previewFusionObjectItemConfigs,
        placementConstraintMode: 'soft-anchor',
      });
      setMessage(`已导出 ${placementPreview.width}x${placementPreview.height} placement preview，将以原图 + 示意图模式融合。`);
      onGenerate({
        inputImage: previewFusionSourceUpload.image,
        materialImage: null,
        maskImage: null,
        useFullImageMask: false,
        config: previewFusionConfigPatch,
      });
      return;

      const includeObject = objectInsertIncludesObject(activeDebugMode);
      const includePreview = objectInsertIncludesPreview(activeDebugMode);
      const includeMask = objectInsertIncludesMask(activeDebugMode);
      const [{ image: sourceWithAsset, assetId: sourceAssetId }] = await Promise.all([
        ensureUploadedImageAsset(sourceImage, 'multi-object-insert-source'),
      ]);

      const preparedItems = [];
      for (const [index, item] of candidateItems.entries()) {
        const referenceUploads = await Promise.all(item.referenceImages.slice(0, maxReferencesPerObject).map((image, referenceIndex) => (
          ensureUploadedImageAsset(image, `multi-object-${index + 1}-reference-${referenceIndex + 1}`)
        )));
        const primaryReference = referenceUploads[0]?.image;
        if (!primaryReference) continue;
        const itemPlacement = item.id === activeObjectItem?.id ? placement : item.placement;
        const guide = includePreview ? await exportPlacementGuide(sourceWithAsset, primaryReference, itemPlacement) : null;
        const mask = includeMask ? await exportPlacementMask(sourceWithAsset, primaryReference, itemPlacement) : null;
        const [previewAsset, maskAsset] = await Promise.all([
          guide ? uploadDataUrlAsset(guide.dataUrl, `multi-object-placement-guide-${item.id}-${Date.now()}`) : Promise.resolve(null),
          mask ? uploadDataUrlAsset(mask.dataUrl, `multi-object-mask-${item.id}-${Date.now()}`) : Promise.resolve(null),
        ]);
        preparedItems.push({
          ...item,
          placement: itemPlacement,
          referenceImages: referenceUploads.map(upload => upload.image),
          referenceAssetIds: referenceUploads.map(upload => upload.assetId),
          placementPreviewAssetId: previewAsset?.id,
          placementMaskAssetId: maskAsset?.id,
          guide,
          mask,
        });
      }

      if (preparedItems.length === 0) {
        setMessage('对象参考图上传失败，请重试。');
        return;
      }

      const firstItem = preparedItems[0];
      const firstReferenceImage = firstItem.referenceImages[0];
      const firstMask = firstItem.mask;
      const firstMaskAssetId = firstItem.placementMaskAssetId;
      if (firstItem.guide && firstMask) {
        setExportResult({ preview: firstItem.guide, mask: firstMask, placement: firstItem.placement });
      }

      const effectiveConfig = {
        ...state.config,
        ...configOverride,
        objectInsert: {
          ...(state.config.objectInsert || {}),
          ...(configOverride.objectInsert || {}),
        },
      } as GenerationConfig;
      const nextPlacementMode = readObjectInsertPlacementMode(effectiveConfig);
      const nextPlacementIntent = readObjectInsertPlacementIntent(effectiveConfig);
      const nextHarmonyPriority = readObjectInsertHarmonyPriority(effectiveConfig);
      const nextAllowAutoAdjustPosition = readObjectInsertAutoAdjust(effectiveConfig, 'allowAutoAdjustPosition');
      const nextAllowAutoAdjustRotation = readObjectInsertAutoAdjust(effectiveConfig, 'allowAutoAdjustRotation');
      const nextAllowAutoAdjustScale = readObjectInsertAutoAdjust(effectiveConfig, 'allowAutoAdjustScale');
      const objectItemConfigs: ObjectInsertItemConfig[] = preparedItems.map(item => ({
        id: item.id,
        objectType: item.objectType || 'custom',
        objectLabel: item.objectLabel || undefined,
        referenceAssetIds: includeObject ? item.referenceAssetIds : [],
        placement: item.placement,
        placementPreviewAssetId: includePreview ? item.placementPreviewAssetId : undefined,
        placementMaskAssetId: includeMask ? item.placementMaskAssetId : undefined,
        placementMode: item.placementMode || nextPlacementMode,
        placementIntent: item.placementIntent || undefined,
        extraPrompt: item.extraPrompt || undefined,
      }));
      const multiObject = objectItemConfigs.length > 1;
      const maskImage: UploadedImage | null = firstMask && firstMaskAssetId && !multiObject ? {
        id: `object-insert-mask-${firstMaskAssetId}`,
        name: 'object-insert-mask.png',
        type: 'image/png',
        size: firstMask.bytesApprox,
        dataUrl: firstMask.dataUrl,
        assetId: firstMaskAssetId,
        width: firstMask.width,
        height: firstMask.height,
      } : null;
      const configPatch: GenerationConfig = {
        ...effectiveConfig,
        step: 'object_insert',
        sourceImageAssetId: sourceAssetId,
        objectReferenceAssetId: includeObject ? firstItem.referenceAssetIds[0] : undefined,
        placementPreviewAssetId: includePreview ? firstItem.placementPreviewAssetId : undefined,
        placementGuideAssetId: includePreview ? firstItem.placementPreviewAssetId : undefined,
        placementMaskAssetId: includeMask ? firstItem.placementMaskAssetId : undefined,
        objectPlacement: firstItem.placement,
        objectInsertDebugMode: activeDebugMode,
        positionConstraintStrength,
        placementMode: nextPlacementMode,
        placementIntent: nextPlacementIntent,
        harmonyPriority: nextHarmonyPriority,
        allowAutoAdjustPosition: nextAllowAutoAdjustPosition,
        allowAutoAdjustRotation: nextAllowAutoAdjustRotation,
        allowAutoAdjustScale: nextAllowAutoAdjustScale,
        objectInsert: {
          sourceImageAssetId: sourceAssetId,
          objectItems: objectItemConfigs,
          globalExtraPrompt: state.config.objectInsertExtraPrompt || state.config.customPrompt || '',
          objectReferenceAssetId: includeObject ? firstItem.referenceAssetIds[0] : undefined,
          objectReferenceAssetIds: includeObject ? firstItem.referenceAssetIds : undefined,
          previewAssetId: includePreview ? firstItem.placementPreviewAssetId : undefined,
          guideAssetId: includePreview ? firstItem.placementPreviewAssetId : undefined,
          maskAssetId: includeMask ? firstItem.placementMaskAssetId : undefined,
          placement: firstItem.placement,
          extraPrompt: state.config.objectInsertExtraPrompt || state.config.customPrompt || '',
          debugMode: activeDebugMode,
          positionConstraintStrength,
          placementMode: nextPlacementMode,
          placementIntent: nextPlacementIntent,
          harmonyPriority: nextHarmonyPriority,
          allowAutoAdjustPosition: nextAllowAutoAdjustPosition,
          allowAutoAdjustRotation: nextAllowAutoAdjustRotation,
          allowAutoAdjustScale: nextAllowAutoAdjustScale,
        },
        objectInsertExtraPrompt: state.config.objectInsertExtraPrompt || '',
        customPrompt: state.config.objectInsertExtraPrompt || state.config.customPrompt || '',
        maskMode: !multiObject && includeMask ? 'asset-mask' : undefined,
        maskAssetId: !multiObject && includeMask ? firstItem.placementMaskAssetId : undefined,
        editTarget: 'furniture',
        preserveStructure: true,
        preserveCamera: true,
        objectInsertCandidateStrategy: effectiveConfig.objectInsertCandidateStrategy || candidateStrategy,
        objectInsertCandidateStrategies: candidateStrategies,
        objectInsertCandidatePromptHints: buildObjectInsertCandidatePromptHints(candidateStrategies),
      };
      const nextItems = objectItems.map(item => {
        const prepared = preparedItems.find(preparedItem => preparedItem.id === item.id);
        return prepared ? { ...item, referenceImages: prepared.referenceImages, placement: prepared.placement } : item;
      });
      setObjectItems(nextItems);
      onUpdateInputImage(sourceWithAsset);
      onUpdateMaterialImage(firstReferenceImage);
      onUpdateConfig(configPatch);
      console.info('[ObjectInsert] multi-object generation job payload prepared', {
        sourceAssetId,
        totalObjectItems: objectItemConfigs.length,
        objectItems: objectItemConfigs,
      });
      setMessage(buildObjectInsertSummary(objectItemConfigs));
      onGenerate({
        inputImage: sourceWithAsset,
        materialImage: firstReferenceImage,
        maskImage,
        useFullImageMask: false,
        config: configPatch,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '多元素植入任务准备失败，请重试。');
    } finally {
      setIsPreparingGeneration(false);
    }
  };

  const handleRetryNatural = () => {
    const naturalPatch = buildObjectInsertConfigPatch({
      placementMode: 'natural',
      allowAutoAdjustPosition: true,
      allowAutoAdjustRotation: true,
      allowAutoAdjustScale: true,
      harmonyPriority: harmonyPriority || 'layout',
    });
    onUpdateConfig(naturalPatch);
    setMessage('将以自然摆放模式重新生成，当前拖放框会作为建议区域。');
    void handleGenerateMultiClick(naturalPatch);
  };

  const handleContinueTuning = async () => {
    if (state.isGenerating || isPreparingGeneration) return;
    const source = resolveContinueRefineSource(selectedResult, state.outputImage);
    if (!source.assetId && !source.url) {
      setMessage('无法继续微调：未找到结果图原图资源。');
      return;
    }

    setIsPreparingGeneration(true);
    setMessage('正在载入当前结果作为新的原图...');
    try {
      const preparedSource = await buildContinueRefineUploadedImage(source);
      const nextConfig: Partial<GenerationConfig> = {
        sourceImageAssetId: preparedSource.assetId,
        placementPreviewAssetId: undefined,
        placementGuideAssetId: undefined,
        placementMaskAssetId: undefined,
        objectReferenceAssetId: undefined,
        objectPlacement: undefined,
        objectInsertInputOrder: undefined,
        maskMode: undefined,
        maskAssetId: undefined,
        objectInsertMode: 'object_insert_preview_fusion',
        objectInsert: {
          ...(state.config.objectInsert || {}),
          mode: 'object_insert_preview_fusion',
          sourceImageAssetId: preparedSource.assetId,
          objectItems: [],
          previewAssetId: undefined,
          guideAssetId: undefined,
          maskAssetId: undefined,
          objectReferenceAssetId: undefined,
          objectReferenceAssetIds: undefined,
          placement: undefined,
        },
      };

      setObjectItems([]);
      setActiveItemId('');
      setPlacement(emptyPlacement);
      setExportResult(null);
      initializedPairRef.current = '';
      onContinueRefineSource?.(preparedSource, {
        resultId: source.resultId,
        label: source.label,
      });
      onUpdateInputImage(preparedSource);
      onUpdateMaterialImage(null);
      onUpdateConfig(nextConfig);
      setIsSelected(true);
      setMessage('已将当前结果作为新的原图，可继续添加家具进行微调。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法继续微调：结果图载入失败。');
    } finally {
      setIsPreparingGeneration(false);
    }
  };

  const handleDownloadResult = async () => {
    if (!originalResultImage || isDownloadingResult) return;
    setIsDownloadingResult(true);
    setDownloadMessage(null);
    setDownloadError(null);
    try {
      await downloadAsset({
        url: originalResultImage,
        assetId: originalResultAssetId,
      }, buildResultImageFilename({
        projectName,
        featureLabel: '元素植入',
      }));
      setDownloadMessage('已开始下载');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '';
      setDownloadError(errorMessage === downloadFallbackMessage ? downloadFallbackMessage : '下载失败，请稍后重试');
    } finally {
      setIsDownloadingResult(false);
    }
  };

  return (
    <div className="workspace-layout workspace-surface flex min-h-0 flex-1 overflow-hidden p-3">
      <input ref={sourceInputRef} type="file" accept={IMAGE_UPLOAD_ACCEPT} className="hidden" onChange={event => { void handleUploadImage('source', event.currentTarget.files); event.currentTarget.value = ''; }} />
      <input ref={objectInputRef} type="file" accept={IMAGE_UPLOAD_ACCEPT} multiple className="hidden" onChange={event => { void handleUploadObjectReferences(event.currentTarget.files); event.currentTarget.value = ''; }} />

      <aside className="workspace-side-panel glass-panel flex w-80 shrink-0 flex-col gap-3 overflow-y-auto rounded-l-3xl border border-white/60 p-4 custom-scrollbar">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-blue-600">Object Insert</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">元素植入</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">上传原图后，可上传多张家具图片并直接拖动摆放到目标位置。生成时系统会自动根据摆放示意图进行自然融合，生成具有自然阴影、统一透视和协调材质的效果图。</p>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1">
          {(['simple', 'advanced'] as ObjectInsertUIMode[]).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => onUpdateConfig({ objectInsertUIMode: mode })}
              className={`rounded-xl px-3 py-2 text-xs font-black transition ${
                uiMode === mode ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {mode === 'simple' ? '简单模式' : '高级模式'}
            </button>
          ))}
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

        {uiMode === 'simple' ? (
          <UploadCard
            title="物体参考图"
            description="上传要植入的物体，随后在画布中拖拽摆放。"
            image={objectImage}
            error={uploadErrors.object}
            onUpload={() => objectInputRef.current?.click()}
            onRemove={handleRemoveObject}
          />
        ) : (
          <>

        <ObjectItemsPanel
          items={objectItems}
          activeItemId={activeObjectItem?.id || ''}
          canAdd={objectItems.length < maxObjectItems}
          onSelect={itemId => {
            setActiveItemId(itemId);
            setIsSelected(true);
          }}
          onAdd={handleAddObjectItem}
          onRemove={handleRemoveObjectItem}
          onUpdate={handleUpdateObjectItem}
          onUploadReferences={itemId => {
            setActiveItemId(itemId);
            objectInputRef.current?.click();
          }}
          onRemoveReference={handleRemoveObjectReference}
        />

        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
          <p className="font-black text-slate-900">生成摘要</p>
          <div className="mt-2 space-y-1.5">
            <p>原图：{sourceImage ? '1 张' : '未上传'}</p>
            <p>对象数量：{objectItems.length}</p>
            {objectItems.map((item, index) => {
              const typeLabel = readObjectTypeLabel(item.objectType);
              return (
                <p key={item.id} className="truncate">
                  {item.objectLabel || `${typeLabel} ${index + 1}`}：参考图 {item.referenceImages.length} 张
                </p>
              );
            })}
          </div>
          {uploadErrors.object ? <p className="mt-2 text-xs leading-5 text-rose-600">{uploadErrors.object}</p> : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-black text-slate-900">元素配置</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">对象类型</span>
              <select
                value={activeObjectType}
                onChange={event => handleObjectTypeChange(event.currentTarget.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-blue-300"
              >
                {!objectTypeOptions.some(option => option.value === activeObjectType) ? (
                  <option value={activeObjectType}>{readObjectTypeLabel(activeObjectType)}</option>
                ) : null}
                {objectTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">放置面</span>
              <select
                value={activeObjectInsertSurface}
                onChange={event => handleObjectSurfaceChange(event.currentTarget.value as ObjectInsertSurface)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-blue-300"
              >
                {objectInsertSurfaceOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">物体保真度</p>
            <div className="mt-1 grid grid-cols-3 gap-1.5 rounded-xl bg-white p-1">
              {objectFidelityOptions.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleObjectFidelityChange(option.value)}
                  className={`rounded-lg px-2 py-1.5 text-[11px] font-black transition ${
                    activeObjectFidelity === option.value
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 grid gap-2 text-xs text-slate-700">
            <label className="inline-flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
              <span className="font-bold">生成接触阴影</span>
              <input type="checkbox" checked={enforceContactShadow} onChange={event => handleObjectConstraintChange('enforceContactShadow', event.currentTarget.checked)} className="h-4 w-4 rounded border-blue-200 text-blue-600" />
            </label>
            <label className="inline-flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
              <span className="font-bold">保持遮挡关系</span>
              <input type="checkbox" checked={enforceOcclusion} onChange={event => handleObjectConstraintChange('enforceOcclusion', event.currentTarget.checked)} className="h-4 w-4 rounded border-blue-200 text-blue-600" />
            </label>
            <label className="inline-flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
              <span className="font-bold">匹配透视比例</span>
              <input type="checkbox" checked={enforcePerspectiveScale} onChange={event => handleObjectConstraintChange('enforcePerspectiveScale', event.currentTarget.checked)} className="h-4 w-4 rounded border-blue-200 text-blue-600" />
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-black text-slate-900">候选策略</p>
          <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-xl bg-white p-1">
            {([1, 2, 3] as const).map(count => (
              <button
                key={count}
                type="button"
                onClick={() => handleCandidateCountChange(count)}
                className={`rounded-lg px-2 py-1.5 text-xs font-black transition ${
                  candidateCount === count ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {count} 张
              </button>
            ))}
          </div>
          <select
            value={candidateStrategy}
            onChange={event => handleCandidateStrategyChange(event.currentTarget.value as ObjectInsertCandidateStrategy)}
            className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-blue-300"
          >
            {objectInsertCandidateStrategyOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          {candidateCount > 1 ? (
            <p className="mt-2 text-xs leading-5 text-slate-500">
              多候选会自动组合：{candidateStrategies.map(strategy => readObjectInsertCandidateStrategyLabel(strategy)).join(' / ')}
            </p>
          ) : null}
        </div>

        {generationPreflightWarnings.length > 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
            <p className="font-black text-amber-900">生成前提示</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {generationPreflightWarnings.map(warning => <li key={warning}>{warning}</li>)}
            </ul>
          </div>
        ) : null}

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

        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold text-slate-800">放置模式</p>
            <p className="text-[11px] font-bold text-blue-700">{placementModeOption.label}</p>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-xl bg-white p-1">
            {objectInsertPlacementModeOptions.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => handlePlacementModeChange(option.value)}
                className={`rounded-lg px-2 py-1.5 text-xs font-black transition ${
                  placementMode === option.value
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-600">{placementModeOption.description}</p>

          <label className="mt-3 block text-xs font-bold text-slate-800" htmlFor="object-insert-placement-intent">摆放意图（可选）</label>
          <textarea
            id="object-insert-placement-intent"
            value={placementIntent}
            onChange={event => handlePlacementIntentChange(event.currentTarget.value)}
            placeholder="例如：放在长条沙发后侧作为辅助单椅，保持动线和空间协调。"
            className="mt-2 min-h-20 w-full resize-none rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          />

          <div className="mt-3">
            <p className="text-xs font-bold text-slate-800">自然摆放优先项</p>
            <div className="mt-2 grid grid-cols-3 gap-1.5 rounded-xl bg-white p-1">
              {objectInsertHarmonyPriorityOptions.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleHarmonyPriorityChange(option.value)}
                  disabled={placementMode !== 'natural'}
                  className={`rounded-lg px-2 py-1.5 text-xs font-black transition disabled:cursor-not-allowed disabled:text-slate-300 ${
                    harmonyPriority === option.value && placementMode === 'natural'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {placementMode === 'natural' ? (
            <div className="mt-3 grid gap-2 text-xs text-slate-700">
              <label className="inline-flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
                <span className="font-bold">自动微调位置</span>
                <input type="checkbox" checked={allowAutoAdjustPosition} onChange={event => handleAutoAdjustChange('allowAutoAdjustPosition', event.currentTarget.checked)} className="h-4 w-4 rounded border-blue-200 text-blue-600" />
              </label>
              <label className="inline-flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
                <span className="font-bold">自动微调朝向</span>
                <input type="checkbox" checked={allowAutoAdjustRotation} onChange={event => handleAutoAdjustChange('allowAutoAdjustRotation', event.currentTarget.checked)} className="h-4 w-4 rounded border-blue-200 text-blue-600" />
              </label>
              <label className="inline-flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
                <span className="font-bold">自动微调比例</span>
                <input type="checkbox" checked={allowAutoAdjustScale} onChange={event => handleAutoAdjustChange('allowAutoAdjustScale', event.currentTarget.checked)} className="h-4 w-4 rounded border-blue-200 text-blue-600" />
              </label>
            </div>
          ) : null}
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
          请确保原图和物体参考图为可使用素材，并在生成前确认你拥有相应使用权。
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
          </>
        )}
      </aside>

      <main className="workspace-canvas mx-3 flex min-w-0 flex-1 flex-col p-4">
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
              {isExporting ? '正在导出' : '导出 placement preview'}
            </button>
            <button
              type="button"
              onClick={() => void handleGenerateMultiClick()}
              disabled={!sourceImage || objectItems.every(item => item.referenceImages.length === 0) || state.isGenerating || isPreparingGeneration}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              <ImagePlus className="h-4 w-4" />
              {state.isGenerating ? 'AI 生成中' : isPreparingGeneration ? '准备任务中' : '生成融合效果图'}
            </button>
          </div>
        </div>

        {originalResultImage ? (
          <section className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-blue-600">Generated Result</p>
                <h3 className="mt-1 text-base font-black text-slate-950">最终植入效果图</h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700">
                  {placementMode === 'strict' ? '精确摆放' : '自然摆放'}
                </span>
                {resultDimensionsText ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">{resultDimensionsText}</span> : null}
              </div>
            </div>
            <div className="bg-slate-50 p-3">
              <GenerationImageViewer
                sourceImageUrl={sourceImage ? readImageSrc(sourceImage) : null}
                sourceImageAssetId={sourceImage?.assetId}
                resultImageUrl={originalResultImage}
                resultImageAssetId={originalResultAssetId}
                aspectRatio="16:9"
                featureName="元素植入"
                step={GenerationStep.ObjectInsert}
                sourceMissingMessage="暂无原图，无法对比。"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-white px-4 py-3">
              <button
                type="button"
                onClick={() => window.open(originalResultImage, '_blank', 'noopener,noreferrer')}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
              >
                <ExternalLink className="mr-1 inline h-3.5 w-3.5" />
                查看大图
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadResult()}
                disabled={isDownloadingResult}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download className={`mr-1 inline h-3.5 w-3.5 ${isDownloadingResult ? 'animate-pulse' : ''}`} />
                {isDownloadingResult ? '正在下载...' : '保存到本地'}
              </button>
              {canSaveTemplate && selectedResult ? (
                <button
                  type="button"
                  onClick={() => setIsSaveTemplateOpen(true)}
                  className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white transition hover:bg-blue-700"
                >
                  <BookOpen className="mr-1 inline h-3.5 w-3.5" />
                  保存为提示词模板
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleRetryNatural}
                disabled={!sourceImage || !objectImage || state.isGenerating || isPreparingGeneration}
                className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                再试一次（更自然）
              </button>
              <button
                type="button"
                onClick={handleContinueTuning}
                disabled={state.isGenerating || isPreparingGeneration}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                继续微调
              </button>
            </div>
            {(downloadMessage || downloadError) ? (
              <div className="border-t border-slate-100 px-4 py-2 text-xs font-semibold">
                {downloadMessage ? <span className="text-emerald-700">{downloadMessage}</span> : null}
                {downloadError ? <span className="text-amber-700">{downloadError}</span> : null}
              </div>
            ) : null}
          </section>
        ) : null}

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
                {objectItems.some(item => item.referenceImages[0]) ? (
                  objectItems.map((item, index) => {
                    const itemImage = item.referenceImages[0];
                    if (!itemImage) return null;
                    const isActive = item.id === activeObjectItem?.id;
                    return (
                      <div
                        key={item.id}
                        className={`absolute touch-none select-none cursor-move ${
                          isActive && isSelected ? 'ring-2 ring-blue-400' : 'ring-1 ring-white/70'
                        }`}
                        style={{ ...getObjectPlacementStyle(item.placement), zIndex: 10 + index }}
                        onPointerDown={event => startInteraction(item.id, 'move', event)}
                      >
                        <img src={readImageSrc(itemImage)} alt={item.objectLabel || `家具 ${index + 1}`} className="h-full w-full select-none object-contain" draggable={false} />
                        {isActive && isSelected ? (
                          <>
                            <button
                              type="button"
                              aria-label="旋转物体"
                              className="absolute left-1/2 top-0 flex h-8 w-8 -translate-x-1/2 -translate-y-11 items-center justify-center rounded-full border border-blue-200 bg-white text-blue-600 shadow-lg"
                              onPointerDown={event => startInteraction(item.id, 'rotate', event)}
                            >
                              <RotateCw className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              aria-label="缩放物体"
                              className="absolute bottom-0 right-0 flex h-8 w-8 translate-x-1/2 translate-y-1/2 items-center justify-center rounded-full border border-blue-200 bg-white text-blue-600 shadow-lg"
                              onPointerDown={event => startInteraction(item.id, 'resize', event)}
                            >
                              <Move className="h-4 w-4 rotate-45" />
                            </button>
                          </>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="rounded-2xl border border-dashed border-white/30 bg-slate-950/60 px-4 py-3 text-center text-sm font-bold text-white">
                      请上传家具参考图
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

      <aside className="workspace-side-panel glass-panel flex w-80 shrink-0 flex-col gap-3 overflow-y-auto rounded-r-3xl border border-white/60 p-4 custom-scrollbar">
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
          <ToolButton icon={Trash2} label="删除对象" onClick={() => activeObjectItem && handleRemoveObjectItem(activeObjectItem.id)} disabled={!activeObjectItem} danger />
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
            {originalResultImage ? (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-slate-700">
                    {placementMode === 'strict' ? '精确摆放' : '自然摆放'}
                  </span>
                  {resultDimensionsText ? <span className="text-[11px] font-bold text-slate-500">{resultDimensionsText}</span> : null}
                </div>
                <p className="rounded-xl bg-white px-3 py-2 text-[11px] font-semibold text-slate-500">
                  最终效果图已显示在中央结果区，可在中央切换结果图、原图、对比和叠加对比。
                </p>
              </div>
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

      {isSaveTemplateOpen && selectedResult ? (
        <SavePromptTemplateModal
          step={GenerationStep.ObjectInsert}
          state={state}
          result={selectedResult}
          previewImage={originalResultImage}
          onClose={() => setIsSaveTemplateOpen(false)}
        />
      ) : null}
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
        className="mt-3 w-full rounded-xl border border-dashed border-slate-200 bg-slate-50 p-2 text-left transition hover:border-blue-200 hover:bg-blue-50"
      >
        <div className="flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-white">
          {image ? (
            <AspectRatioImage src={readImageSrc(image)} alt={title} className="h-full rounded-none border-0 shadow-none" enableLightbox={false} />
          ) : (
            <Upload className="h-6 w-6 text-slate-300" />
          )}
        </div>
        <div className="mt-2 min-w-0 px-1">
          <p className="truncate text-sm font-bold text-slate-800">{image?.name || '点击上传图片'}</p>
          <p className="mt-1 text-xs text-slate-500">{image ? `${image.width || '-'} x ${image.height || '-'} px` : 'PNG / JPG / WEBP'}</p>
        </div>
      </button>
      {error ? <p className="mt-2 text-xs leading-5 text-rose-600">{error}</p> : null}
    </div>
  );
}

function ObjectItemsPanel({
  items,
  activeItemId,
  canAdd,
  onSelect,
  onAdd,
  onRemove,
  onUpdate,
  onUploadReferences,
  onRemoveReference,
}: {
  items: ObjectInsertDraftItem[];
  activeItemId: string;
  canAdd: boolean;
  onSelect: (itemId: string) => void;
  onAdd: () => void;
  onRemove: (itemId: string) => void;
  onUpdate: (itemId: string, patch: Partial<ObjectInsertDraftItem>) => void;
  onUploadReferences: (itemId: string) => void;
  onRemoveReference: (itemId: string, imageId: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black text-slate-900">植入对象</p>
          <p className="mt-0.5 text-[11px] font-semibold text-slate-500">对象数量：{items.length} / {maxObjectItems}</p>
        </div>
        <button type="button" onClick={onAdd} disabled={!canAdd} className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-[11px] font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">
          添加
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {items.map((item, index) => {
          const isActive = item.id === activeItemId;
          const typeLabel = readObjectTypeLabel(item.objectType);
          const hasPlacement = Boolean(item.placement.width && item.placement.height);
          return (
            <div key={item.id} className={`rounded-xl border bg-white p-2 ${isActive ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'}`}>
              <button type="button" onClick={() => onSelect(item.id)} className="flex w-full items-center justify-between gap-2 text-left">
                <span className="text-xs font-black text-slate-900">{item.objectLabel || `${typeLabel} ${index + 1}`}</span>
                <span className="text-[10px] font-bold text-slate-500">{item.placementMode === 'strict' ? '精确' : '自然'}</span>
              </button>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <select value={item.objectType} onChange={event => onUpdate(item.id, { objectType: event.currentTarget.value })} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-700">
                  {!objectTypeOptions.some(option => option.value === item.objectType) ? (
                    <option value={item.objectType}>{readObjectTypeLabel(item.objectType)}</option>
                  ) : null}
                  {objectTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <input value={item.objectLabel} onChange={event => onUpdate(item.id, { objectLabel: event.currentTarget.value })} placeholder="对象名称" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-700" />
              </div>
              <textarea
                value={item.extraPrompt}
                onChange={event => onUpdate(item.id, { extraPrompt: event.currentTarget.value })}
                placeholder="附加说明，可选"
                className="mt-2 min-h-14 w-full resize-none rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-300"
              />
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold">
                <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">参考图 {item.referenceImages.length} / {maxReferencesPerObject}</span>
                <span className={`rounded-full px-2 py-1 ${hasPlacement ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{hasPlacement ? '已设置区域' : '未设置区域'}</span>
              </div>
              {item.referenceImages.length > 0 ? (
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {item.referenceImages.map(image => (
                    <div key={image.id} className="group relative overflow-hidden rounded-lg border border-slate-100 bg-slate-100">
                      <AspectRatioImage src={readImageSrc(image)} alt={image.name} className="rounded-none border-0 shadow-none" />
                      <button type="button" onClick={() => onRemoveReference(item.id, image.id)} className="absolute right-1 top-1 hidden rounded bg-white/90 p-1 text-rose-600 shadow group-hover:block" aria-label="删除参考图">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <button type="button" onClick={() => onUploadReferences(item.id)} className="rounded-lg bg-slate-100 px-2 py-1.5 text-[11px] font-black text-slate-700 hover:text-blue-700">
                  上传为新对象
                </button>
                <button type="button" onClick={() => onRemove(item.id)} className="rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] font-black text-rose-600 hover:bg-rose-100">
                  删除对象
                </button>
              </div>
            </div>
          );
        })}
      </div>
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
          <img src={item.imageUrl} alt={item.label} className="h-full w-full object-contain" />
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
  const cleanPreviewMode = input.mode === 'source_placement_preview';
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
        included: objectIncluded && !cleanPreviewMode,
        imageUrl: input.objectImage ? readImageSrc(input.objectImage) : undefined,
        detail: input.objectImage?.assetId || input.objectImage?.id || '尚未上传',
      },
      {
        id: 'preview',
        label: cleanPreviewMode ? '干净摆放示意图' : 'placement guide',
        included: previewIncluded || cleanPreviewMode,
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

function readObjectInsertPlacementMode(config: GenerationConfig): ObjectInsertPlacementMode {
  const value = config.objectInsert?.placementMode || config.placementMode;
  return value === 'strict' || value === 'natural' ? value : 'natural';
}

function readObjectInsertPlacementIntent(config: GenerationConfig): string {
  return (config.objectInsert?.placementIntent || config.placementIntent || '').trim();
}

function readObjectInsertHarmonyPriority(config: GenerationConfig): ObjectInsertHarmonyPriority {
  const value = config.objectInsert?.harmonyPriority || config.harmonyPriority;
  return value === 'style' || value === 'balance' || value === 'layout' ? value : 'layout';
}

function readObjectInsertCandidateStrategy(config: GenerationConfig): ObjectInsertCandidateStrategy {
  const value = config.objectInsert?.objectInsertCandidateStrategy || config.objectInsertCandidateStrategy;
  return objectInsertCandidateStrategyOptions.some(option => option.value === value) ? value : 'natural-fit';
}

function resolveObjectInsertCandidateStrategies(config: GenerationConfig, count: 1 | 2 | 3): ObjectInsertCandidateStrategy[] {
  const preferred = readObjectInsertCandidateStrategy(config);
  const configured = [
    ...(Array.isArray(config.objectInsertCandidateStrategies) ? config.objectInsertCandidateStrategies : []),
    ...(Array.isArray(config.objectInsert?.objectInsertCandidateStrategies) ? config.objectInsert.objectInsertCandidateStrategies : []),
  ].filter((strategy): strategy is ObjectInsertCandidateStrategy => objectInsertCandidateStrategyOptions.some(option => option.value === strategy));
  const defaults: ObjectInsertCandidateStrategy[] = [preferred, 'natural-fit', 'strict-placement', 'object-fidelity', 'scene-harmony'];
  const merged = Array.from(new Set([...configured, ...defaults]));
  return merged.slice(0, count);
}

function buildObjectInsertCandidatePromptHints(strategies: ObjectInsertCandidateStrategy[]): string[] {
  return strategies.map(strategy => objectInsertCandidateStrategyOptions.find(option => option.value === strategy)?.hint || '');
}

function readObjectInsertCandidateStrategyLabel(strategy: ObjectInsertCandidateStrategy): string {
  return objectInsertCandidateStrategyOptions.find(option => option.value === strategy)?.label || '自然融合';
}

function readObjectInsertAutoAdjust(
  config: GenerationConfig,
  key: 'allowAutoAdjustPosition' | 'allowAutoAdjustRotation' | 'allowAutoAdjustScale',
): boolean {
  const nested = config.objectInsert?.[key];
  const value = nested ?? config[key];
  return value === undefined ? true : value !== false;
}

function objectInsertIncludesObject(mode: ObjectInsertDebugMode): boolean {
  if (mode === 'source_placement_preview') return false;
  return mode !== 'source_prompt';
}

function objectInsertIncludesPreview(mode: ObjectInsertDebugMode): boolean {
  if (mode === 'source_placement_preview') return true;
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
      <AspectRatioImage src={info.dataUrl} alt={title} />
      <p className="mt-2 text-[10px] font-bold text-slate-400">{info.width} x {info.height} px</p>
    </div>
  );
}

function readImageSrc(image: UploadedImage): string {
  return image.dataUrl || image.url || '';
}

function createObjectItemId(): string {
  return `object-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultObjectItem(index = 0): ObjectInsertDraftItem {
  return {
    id: createObjectItemId(),
    objectType: 'custom',
    objectLabel: `对象 ${index + 1}`,
    referenceImages: [],
    placement: emptyPlacement,
    objectInsertSurface: 'auto',
    objectFidelity: 'balanced',
    enforceContactShadow: true,
    enforceOcclusion: true,
    enforcePerspectiveScale: true,
    placementMode: 'natural',
    placementIntent: '',
    extraPrompt: '',
  };
}

function createInitialObjectItems(config: GenerationConfig, legacyObjectImage: UploadedImage | null): ObjectInsertDraftItem[] {
  const items = config.objectInsert?.objectItems;
  if (items && items.length > 0) {
    return items.slice(0, maxObjectItems).map((item, index) => ({
      id: item.id || createObjectItemId(),
      objectType: item.objectType || readActiveObjectType(config, null),
      objectLabel: item.objectLabel || `对象 ${index + 1}`,
      referenceImages: [],
      placement: sanitizePlacement(item.placement || (index === 0 ? config.objectPlacement : undefined) || emptyPlacement),
      objectInsertSurface: item.objectInsertSurface || readActiveObjectInsertSurface(config, null),
      objectFidelity: item.objectFidelity || readActiveObjectFidelity(config, null),
      enforceContactShadow: item.enforceContactShadow ?? readObjectInsertBooleanConstraint(config, null, 'enforceContactShadow'),
      enforceOcclusion: item.enforceOcclusion ?? readObjectInsertBooleanConstraint(config, null, 'enforceOcclusion'),
      enforcePerspectiveScale: item.enforcePerspectiveScale ?? readObjectInsertBooleanConstraint(config, null, 'enforcePerspectiveScale'),
      placementMode: item.placementMode === 'strict' ? 'strict' : 'natural',
      placementIntent: item.placementIntent || '',
      extraPrompt: item.extraPrompt || '',
    }));
  }

  const legacyItem = createDefaultObjectItem(0);
  return [{
    ...legacyItem,
    referenceImages: legacyObjectImage ? [legacyObjectImage] : [],
    placement: sanitizePlacement(config.objectPlacement || config.objectInsert?.placement || emptyPlacement),
    objectType: readActiveObjectType(config, null),
    objectInsertSurface: readActiveObjectInsertSurface(config, null),
    objectFidelity: readActiveObjectFidelity(config, null),
    enforceContactShadow: readObjectInsertBooleanConstraint(config, null, 'enforceContactShadow'),
    enforceOcclusion: readObjectInsertBooleanConstraint(config, null, 'enforceOcclusion'),
    enforcePerspectiveScale: readObjectInsertBooleanConstraint(config, null, 'enforcePerspectiveScale'),
    placementMode: readObjectInsertPlacementMode(config),
    placementIntent: readObjectInsertPlacementIntent(config),
    extraPrompt: config.objectInsertExtraPrompt || config.objectInsert?.extraPrompt || config.customPrompt || '',
  }];
}

interface ContinueRefineSource {
  resultId?: string;
  label: string;
  assetId?: string;
  url?: string;
  width?: number;
  height?: number;
}

function resolveContinueRefineSource(result: GenerationResultOption | undefined, fallbackUrl: string | null): ContinueRefineSource {
  const metadata = result?.metadata || {};
  return {
    resultId: result?.id,
    label: result?.variantName || result?.variantLabel || '继续微调原图',
    assetId: readFirstString(
      metadata.outputAssetId,
      metadata.originalAssetId,
      metadata.output_asset_id,
      metadata.original_asset_id,
      result?.assetId,
    ) || undefined,
    url: readFirstString(
      metadata.outputUrl,
      metadata.originalUrl,
      metadata.output_url,
      metadata.original_url,
      result?.imageUrl,
      fallbackUrl,
    ) || undefined,
    width: readPositiveNumber(metadata.outputWidth, metadata.originalWidth, metadata.width, metadata.output_width, metadata.original_width) || undefined,
    height: readPositiveNumber(metadata.outputHeight, metadata.originalHeight, metadata.height, metadata.output_height, metadata.original_height) || undefined,
  };
}

async function buildContinueRefineUploadedImage(source: ContinueRefineSource): Promise<UploadedImage> {
  let assetId = source.assetId;
  let url = source.url || '';
  let type = readImageMimeType(url);
  let size = 0;

  if (!assetId) {
    if (!url) throw new Error('无法继续微调：未找到结果图原图资源。');
    const response = await fetch(url);
    if (!response.ok) throw new Error('无法继续微调：结果图资源无法读取，请稍后重试。');
    const blob = await response.blob();
    type = blob.type || type;
    size = blob.size;
    const asset = await uploadImageAsset(blob, `object-insert-continue-${Date.now()}.${readImageExtension(type)}`);
    assetId = asset.id;
    url = asset.url || url;
    type = asset.mimeType || type;
    size = asset.size || size;
  }

  const displayUrl = url || source.url || '';
  let dimensions = source.width && source.height ? { width: source.width, height: source.height } : null;
  if (!dimensions && displayUrl) {
    try {
      const image = await loadCanvasImage(displayUrl);
      dimensions = { width: image.naturalWidth, height: image.naturalHeight };
    } catch {
      dimensions = null;
    }
  }

  return {
    id: `object-insert-continue-${assetId || Date.now()}`,
    name: source.label || '继续微调原图',
    type,
    size,
    dataUrl: displayUrl,
    url: displayUrl.startsWith('data:') ? undefined : displayUrl,
    assetId,
    width: dimensions?.width,
    height: dimensions?.height,
  };
}

function readImageMimeType(url: string | undefined): string {
  if (!url) return 'image/png';
  const dataUrlMimeType = /^data:([^;,]+)/u.exec(url)?.[1];
  if (dataUrlMimeType) return dataUrlMimeType;
  const pathname = url.split('?')[0]?.toLowerCase() || '';
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg';
  if (pathname.endsWith('.webp')) return 'image/webp';
  return 'image/png';
}

function readImageExtension(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

function readFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

function readPositiveNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value);
  }
  return null;
}

function toObjectInsertConfigItems(items: ObjectInsertDraftItem[]): ObjectInsertItemConfig[] {
  return items.slice(0, maxObjectItems).map(item => ({
    id: item.id,
    objectType: item.objectType || 'custom',
    objectLabel: item.objectLabel || undefined,
    referenceAssetIds: item.referenceImages
      .map(image => image.assetId)
      .filter((assetId): assetId is string => Boolean(assetId))
      .slice(0, maxReferencesPerObject),
    placement: item.placement,
    objectInsertSurface: item.objectInsertSurface,
    objectFidelity: item.objectFidelity,
    enforceContactShadow: item.enforceContactShadow,
    enforceOcclusion: item.enforceOcclusion,
    enforcePerspectiveScale: item.enforcePerspectiveScale,
    placementMode: item.placementMode,
    placementIntent: item.placementIntent || undefined,
    extraPrompt: item.extraPrompt || undefined,
  }));
}

function buildObjectInsertSummary(items: ObjectInsertItemConfig[]): string {
  return [
    '正在创建多元素植入任务...',
    `原图：1 张`,
    `对象数量：${items.length}`,
    ...items.map((item, index) => {
      const typeLabel = readObjectTypeLabel(item.objectType || item.objectLabel || `对象 ${index + 1}`);
      return `${item.objectLabel || typeLabel}参考图：${item.referenceAssetIds.length} 张`;
    }),
  ].join('\n');
}

function readObjectTypeLabel(value: string | undefined): string {
  if (!value) return '自定义';
  return objectTypeOptions.find(option => option.value === value)?.label || legacyObjectTypeLabels[value] || value;
}

function readActiveObjectType(config: GenerationConfig, item: ObjectInsertDraftItem | null): string {
  return item?.objectType || config.objectInsert?.objectType || config.objectType || 'custom';
}

function readActiveObjectInsertSurface(config: GenerationConfig, item: ObjectInsertDraftItem | null): ObjectInsertSurface {
  const value = item?.objectInsertSurface || config.objectInsert?.objectInsertSurface || config.objectInsertSurface;
  return value === 'floor'
    || value === 'wall'
    || value === 'ceiling'
    || value === 'tabletop'
    || value === 'outdoor-ground'
    || value === 'auto'
    ? value
    : 'auto';
}

function readActiveObjectFidelity(config: GenerationConfig, item: ObjectInsertDraftItem | null): ObjectFidelity {
  const value = item?.objectFidelity || config.objectInsert?.objectFidelity || config.objectFidelity;
  return value === 'strict' || value === 'balanced' || value === 'loose' ? value : 'balanced';
}

function readObjectInsertBooleanConstraint(
  config: GenerationConfig,
  item: ObjectInsertDraftItem | null,
  key: 'enforceContactShadow' | 'enforceOcclusion' | 'enforcePerspectiveScale',
): boolean {
  const value = item?.[key] ?? config.objectInsert?.[key] ?? config[key];
  return value === undefined ? true : value !== false;
}

function buildObjectInsertPreflightWarnings(input: {
  surface: ObjectInsertSurface;
  objectImage: UploadedImage | null;
  placement: ObjectPlacement;
  sourceWidth: number;
  sourceHeight: number;
}): string[] {
  const warnings: string[] = [];
  if (input.surface === 'auto') {
    warnings.push('未明确选择放置面，AI 会自动判断；墙面、天花或桌面物体建议手动指定。');
  }

  const mimeType = input.objectImage?.type?.toLowerCase() || '';
  const fileName = input.objectImage?.name?.toLowerCase() || '';
  if (input.objectImage && (mimeType.includes('jpeg') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg'))) {
    warnings.push('物体参考图可能包含复杂背景，建议使用主体清晰、背景简单或透明 PNG 的参考图。');
  }

  const sourceArea = Math.max(1, input.sourceWidth * input.sourceHeight);
  const placementArea = Math.max(0, input.placement.width * input.placement.height);
  const minSide = Math.min(input.placement.width, input.placement.height);
  if (placementArea > 0 && (placementArea / sourceArea < 0.015 || minSide < 48)) {
    warnings.push('摆放框偏小，可能影响遮挡、阴影和比例判断，可适当放大后再生成。');
  }
  return warnings;
}

function sanitizePlacement(placement: ObjectPlacement | undefined, sourceWidth = 1200, sourceHeight = 800): ObjectPlacement {
  const input = placement || emptyPlacement;
  const width = Math.max(minObjectSize, Number.isFinite(input.width) ? input.width : minObjectSize);
  const height = Math.max(minObjectSize, Number.isFinite(input.height) ? input.height : minObjectSize);
  return {
    x: clamp(Number.isFinite(input.x) ? input.x : 0, -width * 0.5, sourceWidth - width * 0.5),
    y: clamp(Number.isFinite(input.y) ? input.y : 0, -height * 0.5, sourceHeight - height * 0.5),
    width,
    height,
    rotation: Number.isFinite(input.rotation) ? Number(input.rotation.toFixed(1)) : 0,
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

function offsetPlacement(placement: ObjectPlacement, sourceWidth: number, sourceHeight: number, index: number): ObjectPlacement {
  const offset = (index % 4) * 36;
  const rowOffset = Math.floor(index / 4) * 28;
  return sanitizePlacement({
    ...placement,
    x: placement.x + offset - rowOffset,
    y: placement.y + offset + rowOffset,
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

async function exportCompositePlacementPreview(
  sourceImage: UploadedImage,
  items: Array<{ image: UploadedImage; placement: ObjectPlacement }>,
): Promise<ExportedImageInfo> {
  const [source, ...objects] = await Promise.all([
    loadCanvasImage(readImageSrc(sourceImage)),
    ...items.map(item => loadCanvasImage(readImageSrc(item.image))),
  ]);
  const width = sourceImage.width || source.naturalWidth || 1200;
  const height = sourceImage.height || source.naturalHeight || 800;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas export is not supported in this browser.');

  context.drawImage(source, 0, 0, width, height);
  items.forEach((item, index) => {
    const object = objects[index];
    if (!object) return;
    context.save();
    context.translate(item.placement.x + item.placement.width / 2, item.placement.y + item.placement.height / 2);
    context.rotate(item.placement.rotation * Math.PI / 180);
    context.globalAlpha = 0.92;
    context.drawImage(object, -item.placement.width / 2, -item.placement.height / 2, item.placement.width, item.placement.height);
    context.restore();
  });

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
