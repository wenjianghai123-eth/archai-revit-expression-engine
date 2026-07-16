import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ArrowLeft, Check, Copy, Download, ExternalLink, ImagePlus, Layers3, LoaderCircle, RefreshCw, RotateCcw, Save, Sparkles, Trash2 } from 'lucide-react';
import type {
  FloorPlanRegionMaterial,
  FloorPlanRegionSet,
  SaveFloorPlanRegionMaterialInput,
} from '../types';
import {
  getFloorPlanRegionMaterials,
  generateFloorPlanMaterialPreview,
  createGenerationJob,
  getGenerationJob,
  getImageAsset,
  saveFloorPlanRegionMaterials,
  uploadImageAsset,
  type ImageAsset,
} from '../lib/api';
import { resolveAssetUrl } from '../utils/assetUrl';
import { getGenerationCreditCost } from '../utils/generationCredits';
import { buildResultImageFilename, downloadAsset } from '../utils/downloadAsset';
import { ImageOverlayCompare } from './common/ImageOverlayCompare';

interface Props {
  regionSet: FloorPlanRegionSet;
  sourceImageUrl: string;
  onBack: () => void;
  onResetRegionsAndMaterials: () => void;
  onResetAll: () => void;
  creditBalance?: number | null;
  onRefreshCreditBalance?: () => Promise<void>;
  onEnsureProject?: () => Promise<string>;
}

type MaterialDraft = SaveFloorPlanRegionMaterialInput & { materialUrl: string | null };
type ResultView = 'original' | 'regions' | 'control' | 'final' | 'compare';
interface FloorPlanFinalVersion { jobId: string; assetId: string; imageUrl: string; createdAt: string }

const COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export function FloorPlanMaterialPanel({ regionSet, sourceImageUrl, onBack, onResetRegionsAndMaterials, onResetAll, creditBalance = null, onRefreshCreditBalance, onEnsureProject }: Props) {
  const [materials, setMaterials] = useState<MaterialDraft[]>(() => createDefaultDrafts(regionSet));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [previewControlAsset, setPreviewControlAsset] = useState<ImageAsset | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [isGeneratingFinal, setIsGeneratingFinal] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStatus, setGenerationStatus] = useState<string | null>(null);
  const [finalVersions, setFinalVersions] = useState<FloorPlanFinalVersion[]>([]);
  const [selectedFinalJobId, setSelectedFinalJobId] = useState<string | null>(null);
  const [resultView, setResultView] = useState<ResultView>('control');
  const [isDownloading, setIsDownloading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const blobUrlsRef = useRef(new Map<string, string>());
  const mountedRef = useRef(true);
  const lifecycleGenerationRef = useRef(0);
  const requestControllersRef = useRef(new Set<AbortController>());

  const beginRequest = () => {
    const controller = new AbortController();
    requestControllersRef.current.add(controller);
    return { controller, generation: lifecycleGenerationRef.current };
  };

  const finishRequest = (controller: AbortController) => {
    requestControllersRef.current.delete(controller);
  };

  const isActiveRequest = (generation: number) => mountedRef.current && generation === lifecycleGenerationRef.current;

  useEffect(() => {
    let active = true;
    const { controller, generation } = beginRequest();
    setIsLoading(true);
    setError(null);
    getFloorPlanRegionMaterials(regionSet.id, { signal: controller.signal })
      .then(saved => {
        if (!active || !isActiveRequest(generation)) return;
        setMaterials(mergeSavedMaterials(regionSet, saved));
        setSavedAt(saved[0]?.updatedAt || null);
        setIsDirty(false);
      })
      .catch(loadError => {
        if (!active || !isActiveRequest(generation) || controller.signal.aborted) return;
        console.error('[floor-plan-materials] restore failed', { regionSetId: regionSet.id, error: loadError });
        setError(loadError instanceof Error ? loadError.message : '区域材质配置加载失败。');
      })
      .finally(() => {
        finishRequest(controller);
        if (active && isActiveRequest(generation)) setIsLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
      finishRequest(controller);
    };
  }, [regionSet]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      lifecycleGenerationRef.current += 1;
      for (const controller of requestControllersRef.current) controller.abort();
      requestControllersRef.current.clear();
      for (const url of blobUrlsRef.current.values()) URL.revokeObjectURL(url);
      blobUrlsRef.current.clear();
    };
  }, []);

  const hasUploads = Object.keys(uploadProgress).length > 0;
  const finalCreditCost = getGenerationCreditCost('plan-colorize', { batchCount: 1 });
  const insufficientCredits = creditBalance !== null && creditBalance < finalCreditCost;
  const selectedFinal = finalVersions.find(version => version.jobId === selectedFinalJobId) || finalVersions[0] || null;
  const configuredCount = useMemo(
    () => materials.filter(material => material.fallbackMode !== 'ai-auto' || Boolean(material.materialName)).length,
    [materials],
  );

  const updateMaterial = (regionId: string, patch: Partial<MaterialDraft>) => {
    setMaterials(current => current.map(material => material.regionId === regionId ? { ...material, ...patch } : material));
    setIsDirty(true);
    setPreviewControlAsset(null);
    setError(null);
  };

  const releaseBlobUrl = (regionId: string) => {
    const url = blobUrlsRef.current.get(regionId);
    if (url) URL.revokeObjectURL(url);
    blobUrlsRef.current.delete(regionId);
  };

  const uploadMaterial = async (regionId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    releaseBlobUrl(regionId);
    const previewUrl = URL.createObjectURL(file);
    blobUrlsRef.current.set(regionId, previewUrl);
    setUploadErrors(current => omitKey(current, regionId));
    setUploadProgress(current => ({ ...current, [regionId]: 0 }));
    updateMaterial(regionId, {
      materialAssetId: null,
      materialUrl: previewUrl,
      materialName: materialNameForUpload(materials.find(material => material.regionId === regionId)?.materialName, file.name),
      fallbackMode: 'reference',
    });
    const { controller, generation } = beginRequest();
    try {
      const asset = await uploadImageAsset(file, file.name, {
        onProgress: progress => {
          if (isActiveRequest(generation)) setUploadProgress(current => ({ ...current, [regionId]: progress }));
        },
        signal: controller.signal,
      });
      if (!isActiveRequest(generation)) return;
      updateMaterial(regionId, {
        materialAssetId: asset.id,
        materialUrl: asset.publicUrl || asset.url,
        fallbackMode: 'reference',
      });
      releaseBlobUrl(regionId);
    } catch (uploadError) {
      if (!isActiveRequest(generation) || controller.signal.aborted) return;
      console.error('[floor-plan-materials] material upload failed', { regionSetId: regionSet.id, regionId, error: uploadError });
      setUploadErrors(current => ({
        ...current,
        [regionId]: uploadError instanceof Error ? uploadError.message : '材质参考图上传失败，请重试。',
      }));
    } finally {
      finishRequest(controller);
      if (isActiveRequest(generation)) setUploadProgress(current => omitKey(current, regionId));
    }
  };

  const useFallback = (regionId: string, fallbackMode: 'default' | 'ai-auto') => {
    releaseBlobUrl(regionId);
    setUploadErrors(current => omitKey(current, regionId));
    updateMaterial(regionId, { materialAssetId: null, materialUrl: null, fallbackMode });
  };

  const clearMaterial = (regionId: string) => {
    releaseBlobUrl(regionId);
    setUploadErrors(current => omitKey(current, regionId));
    const reset = createDefaultDraft(regionId);
    setMaterials(current => current.map(material => material.regionId === regionId ? reset : material));
    setIsDirty(true);
    setPreviewControlAsset(null);
    setError(null);
  };

  const copyMaterial = (targetRegionId: string, sourceRegionId: string) => {
    if (!sourceRegionId) return;
    const source = materials.find(material => material.regionId === sourceRegionId);
    if (!source) return;
    releaseBlobUrl(targetRegionId);
    setUploadErrors(current => omitKey(current, targetRegionId));
    updateMaterial(targetRegionId, {
      materialAssetId: source.materialAssetId,
      materialUrl: source.materialUrl,
      materialName: source.materialName,
      scale: source.scale,
      rotation: source.rotation,
      direction: source.direction,
      jointMode: source.jointMode,
      fallbackMode: source.fallbackMode,
    });
  };

  const save = async (): Promise<MaterialDraft[] | null> => {
    const invalid = materials.find(material => material.fallbackMode === 'reference' && !material.materialAssetId);
    if (invalid) {
      const region = regionSet.regions.find(candidate => candidate.id === invalid.regionId);
      setError(`区域 ${region?.number || invalid.regionId} 的材质参考图尚未上传完成。`);
      return null;
    }
    setIsSaving(true);
    setError(null);
    const { controller, generation } = beginRequest();
    try {
      const saved = await saveFloorPlanRegionMaterials(regionSet.id, materials.map(toSaveInput), { signal: controller.signal });
      if (!isActiveRequest(generation)) return null;
      const merged = mergeSavedMaterials(regionSet, saved);
      setMaterials(merged);
      setSavedAt(saved[0]?.updatedAt || new Date().toISOString());
      setIsDirty(false);
      return merged;
    } catch (saveError) {
      if (!isActiveRequest(generation) || controller.signal.aborted) return null;
      console.error('[floor-plan-materials] save failed', { regionSetId: regionSet.id, error: saveError });
      setError(saveError instanceof Error ? saveError.message : '区域材质配置保存失败。');
      return null;
    } finally {
      finishRequest(controller);
      if (isActiveRequest(generation)) setIsSaving(false);
    }
  };

  const generateControlPreview = async () => {
    if (hasUploads) {
      setError('请等待所有材质参考图上传完成。');
      return;
    }
    setIsGeneratingPreview(true);
    setError(null);
    const { controller, generation } = beginRequest();
    try {
      const assignments = isDirty ? await save() : materials;
      if (!assignments || !isActiveRequest(generation)) return;
      const asset = await generateFloorPlanMaterialPreview(
        regionSet.sourceAssetId,
        regionSet.id,
        assignments.map(toSaveInput),
        { signal: controller.signal },
      );
      if (!isActiveRequest(generation)) return;
      setPreviewControlAsset(asset);
      setResultView('control');
    } catch (previewError) {
      if (!isActiveRequest(generation) || controller.signal.aborted) return;
      console.error('[floor-plan-materials] control preview failed', { regionSetId: regionSet.id, error: previewError });
      setError(previewError instanceof Error ? previewError.message : '材质控制图生成失败。');
    } finally {
      finishRequest(controller);
      if (isActiveRequest(generation)) setIsGeneratingPreview(false);
    }
  };

  const generateFinalFloorPlan = async () => {
    if (isGeneratingFinal) return;
    if (regionSet.status !== 'confirmed') { setError('请先确认区域划分。'); return; }
    if (!previewControlAsset?.id) { setError('请先生成并检查材质控制图。'); return; }
    if (isDirty) { setError('材质配置已修改，请先重新生成材质控制图。'); return; }
    if (insufficientCredits) { setError(`算力点不足，本次预计需要 ${finalCreditCost} 点。`); return; }
    const invalid = materials.find(material => material.fallbackMode === 'reference' && !material.materialAssetId);
    if (invalid) { setError(`区域 ${invalid.regionId} 缺少材质参考图。`); return; }
    setIsGeneratingFinal(true);
    setGenerationProgress(0);
    setGenerationStatus('正在创建生成任务…');
    setError(null);
    const generation = lifecycleGenerationRef.current;
    try {
      if (!onEnsureProject) throw new Error('当前项目尚未准备完成，请返回项目后重试。');
      const projectId = await onEnsureProject();
      if (!isActiveRequest(generation)) return;
      const assignments = buildGenerationAssignments(regionSet, materials);
      const materialReferenceAssetIds = [...new Set(materials
        .filter(material => material.fallbackMode === 'reference')
        .map(material => material.materialAssetId)
        .filter((id): id is string => Boolean(id)))].slice(0, 2);
      const aspectRatio = closestProviderAspectRatio(regionSet.width, regionSet.height);
      const job = await createGenerationJob({
        projectId,
        mode: 'plan-colorize',
        step: 'plan_colorize',
        generationStep: 'plan_colorize',
        featureName: '区域材质彩平',
        provider: 'apiyi-nano-banana2-edit',
        prompt: '',
        inputAssetIds: [regionSet.sourceAssetId, previewControlAsset.id, ...materialReferenceAssetIds],
        config: {
          generationStep: 'plan_colorize',
          floorPlanMaterialMapping: true,
          sourceImageAssetId: regionSet.sourceAssetId,
          floorPlanRegionSetId: regionSet.id,
          floorPlanControlAssetId: previewControlAsset.id,
          floorPlanMaterialAssignments: assignments,
          floorPlanMaterialReferenceAssetIds: materialReferenceAssetIds,
          batchCount: 1,
          planColorizeBatchEnabled: false,
          drawingType: 'residential',
          template: 'colored-plan',
          preserveLinework: true,
          enableFurnitureEnhance: true,
          enableRoomLabels: false,
          enableZoningColor: false,
          apiyiImageSize: '2K',
          apiyiAspectRatio: aspectRatio,
          targetAspectRatio: aspectRatio,
          qualityMode: 'high',
        },
      });
      if (!isActiveRequest(generation)) return;
      await onRefreshCreditBalance?.().catch(() => undefined);
      if (!isActiveRequest(generation)) return;
      setGenerationStatus('任务已创建，正在生成材质彩平…');
      let latest = job;
      const startedAt = Date.now();
      while (latest.status === 'queued' || latest.status === 'running') {
        if (!isActiveRequest(generation)) return;
        setGenerationProgress(latest.progress);
        setGenerationStatus(latest.status === 'queued' ? '任务排队中…' : 'APIYI 正在生成材质彩平…');
        if (Date.now() - startedAt > 10 * 60 * 1000) throw new Error('生成时间较长，请稍后重新打开页面查看任务结果。');
        await delay(readPollDelay(Date.now() - startedAt));
        if (!isActiveRequest(generation)) return;
        latest = await getGenerationJob(job.id);
      }
      if (!isActiveRequest(generation)) return;
      if (latest.status !== 'succeeded') {
        throw new Error(latest.errorMessage || latest.failureReason || '材质彩平生成失败，算力点将自动退回。');
      }
      const result = latest.results?.[0];
      const assetId = result?.assetId || latest.outputAssetId;
      if (!assetId) throw new Error('生成成功但未返回结果资产。');
      const asset = result ? null : await getImageAsset(assetId);
      if (!isActiveRequest(generation)) return;
      const version: FloorPlanFinalVersion = {
        jobId: latest.id,
        assetId,
        imageUrl: result?.imageUrl || asset?.publicUrl || asset?.url || '',
        createdAt: result?.createdAt || latest.finishedAt || new Date().toISOString(),
      };
      setFinalVersions(current => [version, ...current.filter(candidate => candidate.jobId !== version.jobId)]);
      setSelectedFinalJobId(version.jobId);
      setGenerationProgress(100);
      setGenerationStatus('材质彩平生成完成');
      setResultView('final');
      await onRefreshCreditBalance?.().catch(() => undefined);
    } catch (generationError) {
      if (!isActiveRequest(generation)) return;
      console.error('[floor-plan-materials] final generation failed', { regionSetId: regionSet.id, controlAssetId: previewControlAsset.id, error: generationError });
      setGenerationStatus('生成失败，失败任务将按现有规则自动退款');
      setError(generationError instanceof Error ? generationError.message : '材质彩平生成失败。');
      await onRefreshCreditBalance?.().catch(() => undefined);
    } finally {
      if (isActiveRequest(generation)) setIsGeneratingFinal(false);
    }
  };

  const downloadFinal = async () => {
    if (!selectedFinal) return;
    setIsDownloading(true);
    try {
      await downloadAsset({ assetId: selectedFinal.assetId, url: selectedFinal.imageUrl }, buildResultImageFilename({ featureLabel: '区域材质彩平' }));
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : '结果下载失败。');
    } finally {
      setIsDownloading(false);
    }
  };

  return <main className="workspace-canvas flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-100">
    <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-2">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"><ArrowLeft className="h-4 w-4" />查看区域</button>
        <div>
          <h3 className="text-sm font-bold text-slate-800">第二步 · 设置区域材质</h3>
          <p className="text-xs text-slate-500">已确认 {regionSet.regions.length} 个区域 · 已配置 {configuredCount} 个{isDirty ? ' · 有未保存修改' : savedAt ? ' · 已保存' : ''}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onResetRegionsAndMaterials} className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-amber-700"><RotateCcw className="h-4 w-4" />重置区域与材质</button>
        <button type="button" onClick={onResetAll} className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600"><Trash2 className="h-4 w-4" />全部重置</button>
        <button type="button" onClick={() => void save()} disabled={isLoading || isSaving || hasUploads || !isDirty || isGeneratingPreview} className="inline-flex items-center gap-1 rounded-lg border border-emerald-600 bg-white px-4 py-2 text-xs font-bold text-emerald-700 disabled:border-slate-200 disabled:text-slate-400">
          {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{isSaving ? '正在保存…' : hasUploads ? '等待上传完成' : '保存材质配置'}
        </button>
        <button type="button" onClick={() => void generateControlPreview()} disabled={isLoading || isSaving || hasUploads || isGeneratingPreview} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:bg-slate-300">
          {isGeneratingPreview ? <LoaderCircle className="h-4 w-4 animate-spin" /> : previewControlAsset ? <RefreshCw className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}{isGeneratingPreview ? '正在合成控制图…' : previewControlAsset ? '更新控制图' : '生成材质控制图'}
        </button>
      </div>
    </div>

    {error ? <div role="alert" className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div> : null}

    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto mb-4 flex max-w-6xl items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <img src={sourceImageUrl} alt="已确认平面图" className="h-16 w-24 rounded-lg bg-white object-contain" />
        <div className="min-w-0">
          <div className="flex items-center gap-1 text-sm font-bold text-emerald-800"><Check className="h-4 w-4" />区域划分已确认</div>
          <p className="mt-1 text-xs text-emerald-700">材质始终按稳定的 regionId 绑定，区域编号变化不会改变对应关系。本阶段仅保存映射，不启动 AI 渲染。</p>
        </div>
      </div>

      {previewControlAsset ? <section className="mx-auto mb-4 max-w-6xl overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-blue-100 bg-blue-50 px-4 py-3">
          <div><h4 className="text-sm font-bold text-blue-900">材质映射控制图</h4><p className="text-xs text-blue-700">这是服务端正式合成结果，可在调用 AI 前检查材质是否串区、边界是否正确。</p></div>
          <a href={resolveAssetUrl(previewControlAsset.publicUrl || previewControlAsset.url)} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-bold text-blue-700"><ExternalLink className="h-4 w-4" />查看原图</a>
        </div>
        <div className="bg-slate-100 p-4"><img src={resolveAssetUrl(previewControlAsset.publicUrl || previewControlAsset.url)} alt="材质映射控制图" className="mx-auto max-h-[70vh] max-w-full rounded-lg bg-white object-contain shadow" /></div>
      </section> : null}

      <section className="mx-auto mb-4 max-w-6xl overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-100 bg-violet-50 px-4 py-3">
          <div><h4 className="flex items-center gap-1 text-sm font-bold text-violet-900"><Sparkles className="h-4 w-4" />最终区域材质彩平</h4><p className="text-xs text-violet-700">预计消耗 {finalCreditCost} 算力点 · 当前余额 {creditBalance ?? '读取中'} · 每次生成保存为独立结果版本</p></div>
          <button type="button" onClick={() => void generateFinalFloorPlan()} disabled={!previewControlAsset || isDirty || hasUploads || isGeneratingFinal || insufficientCredits} className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold text-white disabled:bg-slate-300">
            {isGeneratingFinal ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{isGeneratingFinal ? '正在生成…' : finalVersions.length ? '重新生成新版本' : '生成材质彩平'}
          </button>
        </div>
        {!previewControlAsset ? <p className="p-4 text-sm text-slate-500">请先生成并检查材质控制图，才能提交最终彩平任务。</p> : null}
        {generationStatus ? <div className="border-b border-slate-100 px-4 py-3"><div className="flex justify-between text-xs font-semibold text-slate-600"><span>{generationStatus}</span><span>{generationProgress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${generationProgress}%` }} /></div></div> : null}

        {selectedFinal ? <div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div className="flex flex-wrap gap-1">{([
              ['original', '原始平面'], ['regions', '区域编号图'], ['control', '材质控制图'], ['final', '最终彩平'], ['compare', '滑动对比'],
            ] as Array<[ResultView, string]>).map(([value, label]) => <button key={value} type="button" onClick={() => setResultView(value)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${resultView === value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>)}</div>
            <button type="button" onClick={() => void downloadFinal()} disabled={isDownloading} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 disabled:opacity-50"><Download className="h-4 w-4" />{isDownloading ? '正在下载…' : '下载最终彩平'}</button>
          </div>
          <div className="h-[min(68vh,720px)] min-h-[360px] bg-slate-100 p-3">
            {resultView === 'compare' ? <ImageOverlayCompare sourceImageUrl={previewControlAsset?.publicUrl || previewControlAsset?.url} resultImageUrl={selectedFinal.imageUrl} sourceLabel="材质控制图" resultLabel="最终彩平" className="h-full rounded-xl" />
              : resultView === 'regions' ? <RegionNumberedPreview regionSet={regionSet} sourceImageUrl={sourceImageUrl} />
                : <img src={resolveAssetUrl(resultView === 'original' ? sourceImageUrl : resultView === 'control' ? previewControlAsset?.publicUrl || previewControlAsset?.url : selectedFinal.imageUrl)} alt={resultView === 'final' ? '最终材质彩平' : '平面图检查视图'} className="h-full w-full rounded-xl bg-white object-contain" />}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 p-3">{finalVersions.map((version, index) => <button key={version.jobId} type="button" onClick={() => { setSelectedFinalJobId(version.jobId); setResultView('final'); }} className={`rounded-lg border px-3 py-2 text-xs font-bold ${selectedFinal.jobId === version.jobId ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-600'}`}>结果版本 {finalVersions.length - index} · {new Date(version.createdAt).toLocaleString()}</button>)}</div>
        </div> : null}
      </section>

      {isLoading ? <div className="flex items-center justify-center gap-2 py-16 text-sm font-semibold text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" />正在恢复区域材质配置…</div> : <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-2">
        {regionSet.regions.map((region, index) => {
          const material = materials.find(candidate => candidate.regionId === region.id) || createDefaultDraft(region.id);
          const progress = uploadProgress[region.id];
          const uploadError = uploadErrors[region.id];
          const previewUrl = material.materialUrl ? resolveAssetUrl(material.materialUrl) : '';
          return <section key={region.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3" style={{ backgroundColor: `${COLORS[index % COLORS.length]}18` }}>
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black text-white" style={{ backgroundColor: COLORS[index % COLORS.length] }}>{region.number}</span>
                <div className="min-w-0"><h4 className="truncate text-sm font-bold text-slate-800">{region.name || `区域 ${region.number}`}</h4><p className="truncate text-[10px] text-slate-400">{region.id}</p></div>
              </div>
              <span className="rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold text-slate-600">{fallbackLabel(material.fallbackMode)}</span>
            </div>

            <div className="grid gap-4 p-4 sm:grid-cols-[160px_1fr]">
              <div>
                <div className="flex h-36 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">
                  {previewUrl ? <img src={previewUrl} alt={`${region.name || `区域 ${region.number}`}材质预览`} className="h-full w-full object-cover" /> : <div className="px-3 text-center text-xs text-slate-400">{material.fallbackMode === 'default' ? '使用默认材质' : 'AI 自动判断材质'}</div>}
                </div>
                <label className="mt-2 inline-flex w-full cursor-pointer items-center justify-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">
                  {progress !== undefined ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}{progress !== undefined ? `上传中 ${progress}%` : '上传材质参考图'}
                  <input type="file" accept="image/*" disabled={progress !== undefined} onChange={event => void uploadMaterial(region.id, event)} className="sr-only" />
                </label>
                {uploadError ? <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{uploadError}</p> : null}
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-600">材质名称<input value={material.materialName} onChange={event => updateMaterial(region.id, { materialName: event.target.value })} placeholder="例如：浅米色大理石" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800" /></label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-bold text-slate-600">铺贴方向<select value={material.direction} onChange={event => updateMaterial(region.id, { direction: event.target.value as MaterialDraft['direction'] })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm font-normal"><option value="auto">自动</option><option value="horizontal">横向</option><option value="vertical">纵向</option><option value="diagonal">斜向</option></select></label>
                  <label className="block text-xs font-bold text-slate-600">拼缝设置<select value={material.jointMode} onChange={event => updateMaterial(region.id, { jointMode: event.target.value as MaterialDraft['jointMode'] })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm font-normal"><option value="subtle">弱化拼缝</option><option value="visible">清晰拼缝</option><option value="none">无缝</option></select></label>
                  <label className="block text-xs font-bold text-slate-600">纹理尺度<input type="number" min="0.1" max="20" step="0.1" value={material.scale} onChange={event => updateMaterial(region.id, { scale: clampNumber(event.target.value, 0.1, 20, 1) })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" /></label>
                  <label className="block text-xs font-bold text-slate-600">旋转角度<input type="number" min="-360" max="360" step="1" value={material.rotation} onChange={event => updateMaterial(region.id, { rotation: clampNumber(event.target.value, -360, 360, 0) })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" /></label>
                </div>
                <label className="block text-xs font-bold text-slate-600"><span className="inline-flex items-center gap-1"><Copy className="h-3.5 w-3.5" />复制其他区域材质</span><select defaultValue="" onChange={event => { copyMaterial(region.id, event.target.value); event.currentTarget.value = ''; }} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm font-normal"><option value="">选择来源区域…</option>{regionSet.regions.filter(candidate => candidate.id !== region.id).map(candidate => <option key={candidate.id} value={candidate.id}>区域 {candidate.number} · {candidate.name || '未命名'}</option>)}</select></label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => useFallback(region.id, 'default')} className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${material.fallbackMode === 'default' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>使用默认材质</button>
                  <button type="button" onClick={() => useFallback(region.id, 'ai-auto')} className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${material.fallbackMode === 'ai-auto' ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-600'}`}>AI 自动判断</button>
                  <button type="button" onClick={() => clearMaterial(region.id)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-bold text-red-600"><Trash2 className="h-3.5 w-3.5" />清除材质</button>
                </div>
              </div>
            </div>
          </section>;
        })}
      </div>}
    </div>
  </main>;
}

function createDefaultDrafts(regionSet: FloorPlanRegionSet): MaterialDraft[] {
  return regionSet.regions.map(region => createDefaultDraft(region.id));
}

function createDefaultDraft(regionId: string): MaterialDraft {
  return { regionId, materialAssetId: null, materialUrl: null, materialName: '', scale: 1, rotation: 0, direction: 'auto', jointMode: 'subtle', fallbackMode: 'ai-auto' };
}

function mergeSavedMaterials(regionSet: FloorPlanRegionSet, saved: FloorPlanRegionMaterial[]): MaterialDraft[] {
  const savedByRegion = new Map(saved.map(material => [material.regionId, material]));
  return regionSet.regions.map(region => {
    const material = savedByRegion.get(region.id);
    return material ? {
      regionId: region.id,
      materialAssetId: material.materialAssetId,
      materialUrl: material.materialUrl,
      materialName: material.materialName,
      scale: material.scale,
      rotation: material.rotation,
      direction: material.direction,
      jointMode: material.jointMode,
      fallbackMode: material.fallbackMode,
    } : createDefaultDraft(region.id);
  });
}

function toSaveInput(material: MaterialDraft): SaveFloorPlanRegionMaterialInput {
  return {
    regionId: material.regionId,
    materialAssetId: material.materialAssetId,
    materialName: material.materialName,
    scale: material.scale,
    rotation: material.rotation,
    direction: material.direction,
    jointMode: material.jointMode,
    fallbackMode: material.fallbackMode,
  };
}

function fallbackLabel(mode: MaterialDraft['fallbackMode']): string {
  if (mode === 'reference') return '参考图';
  if (mode === 'default') return '默认材质';
  return 'AI 自动判断';
}

function materialNameForUpload(current: string | undefined, filename: string): string {
  if (current?.trim()) return current;
  return filename.replace(/\.[^.]+$/u, '').slice(0, 80);
}

function clampNumber(value: string, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

function buildGenerationAssignments(regionSet: FloorPlanRegionSet, materials: MaterialDraft[]) {
  const materialByRegionId = new Map(materials.map(material => [material.regionId, material]));
  return regionSet.regions.map(region => {
    const material = materialByRegionId.get(region.id) || createDefaultDraft(region.id);
    return {
      regionId: region.id,
      number: region.number,
      roomName: region.name || '',
      materialName: material.materialName,
      materialAssetId: material.materialAssetId,
      fallbackMode: material.fallbackMode,
      scale: material.scale,
      rotation: material.rotation,
      direction: material.direction,
      jointMode: material.jointMode,
    };
  });
}

function closestProviderAspectRatio(width: number, height: number): string {
  const ratio = width / Math.max(1, height);
  const candidates = [
    { value: '1:1', ratio: 1 }, { value: '4:3', ratio: 4 / 3 }, { value: '3:4', ratio: 3 / 4 },
    { value: '16:9', ratio: 16 / 9 }, { value: '9:16', ratio: 9 / 16 }, { value: '3:2', ratio: 3 / 2 }, { value: '2:3', ratio: 2 / 3 },
  ];
  return candidates.reduce((best, candidate) => Math.abs(candidate.ratio - ratio) < Math.abs(best.ratio - ratio) ? candidate : best).value;
}

function RegionNumberedPreview({ regionSet, sourceImageUrl }: { regionSet: FloorPlanRegionSet; sourceImageUrl: string }) {
  return <div className="flex h-full items-center justify-center overflow-hidden rounded-xl bg-white">
    <div className="relative max-h-full max-w-full">
      <img src={resolveAssetUrl(sourceImageUrl)} alt="区域编号平面图" className="block max-h-[calc(min(68vh,720px)-24px)] max-w-full object-contain" />
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-label="区域编号图">
        {regionSet.regions.map((region, index) => {
          const center = region.polygon.reduce<[number, number]>((sum, point) => [sum[0] + point[0] / region.polygon.length, sum[1] + point[1] / region.polygon.length], [0, 0]);
          return <g key={region.id}>
            <polygon points={region.polygon.map(point => point.join(',')).join(' ')} fill={COLORS[index % COLORS.length]} fillOpacity="0.34" stroke={COLORS[index % COLORS.length]} strokeWidth="0.002" />
            <circle cx={center[0]} cy={center[1]} r="0.018" fill="#0f172a" />
            <text x={center[0]} y={center[1]} textAnchor="middle" dominantBaseline="central" fill="white" fontSize="0.022" fontWeight="700">{region.number}</text>
          </g>;
        })}
      </svg>
    </div>
  </div>;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function readPollDelay(elapsedMs: number): number {
  return elapsedMs < 15_000 ? 1_000 : elapsedMs < 60_000 ? 2_000 : 4_000;
}
