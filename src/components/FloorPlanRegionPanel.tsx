import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import {
  Brush,
  Check,
  Eraser,
  Eye,
  EyeOff,
  LoaderCircle,
  Merge,
  MousePointer2,
  PenLine,
  Plus,
  Redo2,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Scissors,
  Trash2,
  Undo2,
} from 'lucide-react';
import type { FloorPlanRegion, FloorPlanRegionSet, RegionEditOperation, RegionPolygon, UploadedImage } from '../types';
import {
  confirmFloorPlanRegions,
  getLatestFloorPlanSegmentation,
  restoreFloorPlanAutoRegions,
  segmentFloorPlan,
  updateFloorPlanRegions,
} from '../lib/api';
import { resolveAssetUrl } from '../utils/assetUrl';
import { allowLatestFloorPlanRegionSet, shouldRestoreLatestFloorPlanRegionSet } from '../utils/floorPlanWorkspace';
import { FloorPlanMaterialPanel } from './FloorPlanMaterialPanel';

interface Props {
  image: UploadedImage | null;
  onUpload: () => void;
  onResetRegionsAndMaterials: () => void;
  onResetAll: () => void;
  onDerivedStateChange?: (hasDerivedState: boolean) => void;
  creditBalance?: number | null;
  onRefreshCreditBalance?: () => Promise<void>;
  onEnsureProject?: () => Promise<string>;
}

type ToolMode = 'select' | 'polygon' | 'brush' | 'erase';
type HistoryState = { regions: FloorPlanRegion[]; operation: RegionEditOperation | null };

const COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
const BRUSH_RADIUS = 0.035;
const GRID_SIZE = 180;

export function FloorPlanRegionPanel({ image, onUpload, onResetRegionsAndMaterials, onResetAll, onDerivedStateChange, creditBalance = null, onRefreshCreditBalance, onEnsureProject }: Props) {
  const [regionSet, setRegionSet] = useState<FloorPlanRegionSet | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tool, setTool] = useState<ToolMode>('select');
  const [polygonDraft, setPolygonDraft] = useState<RegionPolygon>([]);
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [workflowStep, setWorkflowStep] = useState<'regions' | 'materials'>('regions');
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const latestRegionsRef = useRef<FloorPlanRegion[]>([]);
  const requestGenerationRef = useRef(0);
  const requestAbortRef = useRef<AbortController | null>(null);
  const imageUrl = resolveAssetUrl(image?.previewUrl || image?.publicUrl || image?.url || image?.dataUrl || '');
  const editable = Boolean(regionSet && regionSet.status !== 'confirmed' && !regionSet.lockedAt);

  const beginRequest = () => {
    requestGenerationRef.current += 1;
    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;
    return { controller, generation: requestGenerationRef.current };
  };

  const isCurrentRequest = (generation: number) => generation === requestGenerationRef.current;

  useEffect(() => {
    let active = true;
    const { controller, generation } = beginRequest();
    setRegionSet(null);
    setSelectedIds([]);
    setError(null);
    setHistory([]);
    setHistoryIndex(-1);
    setWorkflowStep('regions');
    setTool('select');
    setPolygonDraft([]);
    setIsLoading(false);
    setIsRestoring(false);
    setIsSaving(false);
    setIsDrawing(false);
    setShowOverlay(true);
    if (!image?.assetId || image.uploadStatus !== 'uploaded' || !shouldRestoreLatestFloorPlanRegionSet(image.assetId)) {
      return () => {
        active = false;
        controller.abort();
      };
    }
    setIsRestoring(true);
    getLatestFloorPlanSegmentation(image.assetId, { signal: controller.signal })
      .then(result => {
        if (!active || !isCurrentRequest(generation)) return;
        setRegionSet(result);
        setSelectedIds(result?.regions[0]?.id ? [result.regions[0].id] : []);
        resetHistory(result?.regions || []);
        setWorkflowStep(result?.status === 'confirmed' ? 'materials' : 'regions');
      })
      .catch(loadError => {
        if (active && isCurrentRequest(generation) && !controller.signal.aborted) console.error('[floor-plan-segment] restore failed', { assetId: image.assetId, error: loadError });
      })
      .finally(() => {
        if (active && isCurrentRequest(generation)) setIsRestoring(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [image?.assetId, image?.uploadStatus]);

  useEffect(() => {
    onDerivedStateChange?.(Boolean(regionSet));
  }, [onDerivedStateChange, regionSet]);

  useEffect(() => () => {
    requestGenerationRef.current += 1;
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    onDerivedStateChange?.(false);
  }, [onDerivedStateChange]);

  const selectedRegion = useMemo(() => regionSet?.regions.find(region => region.id === selectedIds[0]) || null, [regionSet?.regions, selectedIds]);
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex >= 0 && historyIndex < history.length - 1;

  useEffect(() => {
    latestRegionsRef.current = regionSet?.regions || [];
  }, [regionSet?.regions]);

  const resetHistory = (regions: FloorPlanRegion[]) => {
    const snapshot = cloneRegions(regions);
    setHistory([{ regions: snapshot, operation: null }]);
    setHistoryIndex(0);
  };

  const runSegmentation = async () => {
    setError(null);
    if (!image) { setError('请先上传黑白平面图。'); return; }
    if (image.uploadStatus === 'uploading' || image.uploadStatus === 'local-preview') { setError('图片正在上传，完成后才能识别地面区域。'); return; }
    if (image.uploadStatus === 'failed') { setError(image.uploadError || '图片上传失败，请重新上传。'); return; }
    if (!image.assetId) { setError('图片尚未取得正式资产 ID，请重新上传。'); return; }
    allowLatestFloorPlanRegionSet(image.assetId);
    const { controller, generation } = beginRequest();
    setIsLoading(true);
    try {
      const result = await segmentFloorPlan(image.assetId, { signal: controller.signal });
      if (!isCurrentRequest(generation)) return;
      setRegionSet(result);
      setSelectedIds(result.regions[0]?.id ? [result.regions[0].id] : []);
      setShowOverlay(true);
      resetHistory(result.regions);
      setTool('select');
      setPolygonDraft([]);
      setWorkflowStep('regions');
    } catch (segmentError) {
      if (!isCurrentRequest(generation) || controller.signal.aborted) return;
      console.error('[floor-plan-segment] request failed', { assetId: image.assetId, error: segmentError });
      setError(segmentError instanceof Error ? segmentError.message : '区域识别失败，请重试。');
    } finally {
      if (isCurrentRequest(generation)) setIsLoading(false);
    }
  };

  const persistRegions = async (regions: FloorPlanRegion[]) => {
    if (!regionSet || !editable) return;
    const regionSetId = regionSet.id;
    const { controller, generation } = beginRequest();
    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateFloorPlanRegions(regionSetId, renumberRegions(regions), { signal: controller.signal });
      if (!isCurrentRequest(generation)) return;
      setRegionSet(updated);
      setSelectedIds(current => current.filter(id => updated.regions.some(region => region.id === id)));
    } catch (saveError) {
      if (!isCurrentRequest(generation) || controller.signal.aborted) return;
      console.error('[floor-plan-segment] save regions failed', { regionSetId, error: saveError });
      setError(saveError instanceof Error ? saveError.message : '区域编辑保存失败。');
    } finally {
      if (isCurrentRequest(generation)) setIsSaving(false);
    }
  };

  const commitRegions = (regions: FloorPlanRegion[], operation: RegionEditOperation, shouldPersist = true) => {
    if (!regionSet || !editable) return;
    const nextRegions = renumberRegions(regions);
    setRegionSet({ ...regionSet, status: 'recognized', regions: nextRegions });
    setHistory(current => {
      const next = current.slice(0, historyIndex + 1);
      next.push({ regions: cloneRegions(nextRegions), operation });
      setHistoryIndex(next.length - 1);
      return next;
    });
    if (shouldPersist) void persistRegions(nextRegions);
  };

  const undo = () => {
    if (!regionSet || !canUndo) return;
    const nextIndex = historyIndex - 1;
    const regions = cloneRegions(history[nextIndex].regions);
    setHistoryIndex(nextIndex);
    setRegionSet({ ...regionSet, regions });
    setSelectedIds(current => current.filter(id => regions.some(region => region.id === id)));
    void persistRegions(regions);
  };

  const redo = () => {
    if (!regionSet || !canRedo) return;
    const nextIndex = historyIndex + 1;
    const regions = cloneRegions(history[nextIndex].regions);
    setHistoryIndex(nextIndex);
    setRegionSet({ ...regionSet, regions });
    setSelectedIds(current => current.filter(id => regions.some(region => region.id === id)));
    void persistRegions(regions);
  };

  const renameRegion = (regionId: string, name: string) => {
    if (!regionSet || !editable) return;
    setRegionSet({ ...regionSet, regions: regionSet.regions.map(region => region.id === regionId ? { ...region, name } : region) });
  };

  const saveName = (regionId: string) => {
    if (!regionSet || !editable) return;
    commitRegions(regionSet.regions, { type: 'rename', regionId, name: regionSet.regions.find(region => region.id === regionId)?.name || '' });
  };

  const deleteSelected = () => {
    if (!regionSet || !editable || !selectedIds.length) return;
    const deleted = selectedIds[0];
    commitRegions(regionSet.regions.filter(region => !selectedIds.includes(region.id)), { type: 'delete', regionId: deleted });
    setSelectedIds([]);
  };

  const mergeSelected = () => {
    if (!regionSet || !editable || selectedIds.length < 2) return;
    const selected = regionSet.regions.filter(region => selectedIds.includes(region.id));
    const mask = new Uint8Array(GRID_SIZE * GRID_SIZE);
    for (const region of selected) {
      const next = polygonToMask(region.polygon);
      for (let index = 0; index < mask.length; index += 1) mask[index] = mask[index] || next[index] ? 1 : 0;
    }
    const polygon = maskToPolygon(mask);
    if (!polygon) { setError('合并失败：区域边界过于复杂。'); return; }
    const target = selected[0];
    const merged: FloorPlanRegion = { ...target, polygon, name: target.name || '合并区域', areaRatio: polygonArea(polygon), confidence: 1, maskAssetId: null, maskUrl: null };
    const regions = regionSet.regions.filter(region => !selectedIds.includes(region.id));
    regions.push(merged);
    commitRegions(regions, { type: 'merge', sourceRegionIds: selectedIds, outputRegionId: merged.id });
    setSelectedIds([merged.id]);
  };

  const splitSelected = () => {
    if (!regionSet || !editable || !selectedRegion) return;
    const parts = splitPolygonByBounds(selectedRegion.polygon);
    if (!parts) { setError('拆分失败：区域太小或边界过于复杂。'); return; }
    const first: FloorPlanRegion = { ...selectedRegion, polygon: parts[0], areaRatio: polygonArea(parts[0]), maskAssetId: null, maskUrl: null };
    const secondId = createRegionId('split');
    const second: FloorPlanRegion = { ...selectedRegion, id: secondId, name: '', polygon: parts[1], areaRatio: polygonArea(parts[1]), confidence: 1, maskAssetId: null, maskUrl: null };
    const regions = regionSet.regions.filter(region => region.id !== selectedRegion.id);
    regions.push(first, second);
    commitRegions(regions, { type: 'split', sourceRegionId: selectedRegion.id, outputRegionIds: [first.id, second.id] });
    setSelectedIds([first.id, second.id]);
  };

  const restoreAuto = async () => {
    if (!regionSet || !editable) return;
    const regionSetId = regionSet.id;
    const { controller, generation } = beginRequest();
    setIsLoading(true);
    setError(null);
    try {
      const restored = await restoreFloorPlanAutoRegions(regionSetId, { signal: controller.signal });
      if (!isCurrentRequest(generation)) return;
      setRegionSet(restored);
      setSelectedIds(restored.regions[0]?.id ? [restored.regions[0].id] : []);
      resetHistory(restored.regions);
      setPolygonDraft([]);
      setTool('select');
    } catch (restoreError) {
      if (!isCurrentRequest(generation) || controller.signal.aborted) return;
      console.error('[floor-plan-segment] restore auto failed', { regionSetId, error: restoreError });
      setError(restoreError instanceof Error ? restoreError.message : '恢复自动识别结果失败。');
    } finally {
      if (isCurrentRequest(generation)) setIsLoading(false);
    }
  };

  const confirm = async () => {
    if (!regionSet) return;
    const regionSetId = regionSet.id;
    const { controller, generation } = beginRequest();
    setIsLoading(true);
    setError(null);
    try {
      const confirmed = await confirmFloorPlanRegions(regionSetId, regionSet.regions, { signal: controller.signal });
      if (!isCurrentRequest(generation)) return;
      setRegionSet(confirmed);
      setSelectedIds(confirmed.regions[0]?.id ? [confirmed.regions[0].id] : []);
      resetHistory(confirmed.regions);
      setTool('select');
      setPolygonDraft([]);
      setWorkflowStep('materials');
    } catch (confirmError) {
      if (!isCurrentRequest(generation) || controller.signal.aborted) return;
      console.error('[floor-plan-segment] confirm failed', { regionSetId, error: confirmError });
      setError(confirmError instanceof Error ? confirmError.message : '确认区域失败。');
    } finally {
      if (isCurrentRequest(generation)) setIsLoading(false);
    }
  };

  const imagePoint = (event: PointerEvent): [number, number] | null => {
    const rect = viewerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return [clamp01((event.clientX - rect.left) / rect.width), clamp01((event.clientY - rect.top) / rect.height)];
  };

  const onCanvasPointerDown = (event: PointerEvent) => {
    if (!regionSet || !editable) return;
    const point = imagePoint(event);
    if (!point) return;
    if (tool === 'polygon') {
      setPolygonDraft(current => [...current, point]);
      return;
    }
    if ((tool === 'brush' || tool === 'erase') && selectedRegion) {
      setIsDrawing(true);
      applyPaint(point, tool, false);
    }
  };

  const onCanvasPointerMove = (event: PointerEvent) => {
    if (!isDrawing || (tool !== 'brush' && tool !== 'erase')) return;
    const point = imagePoint(event);
    if (point) applyPaint(point, tool, false);
  };

  const onCanvasPointerUp = () => {
    if (!isDrawing || !regionSet || !selectedRegion) return;
    setIsDrawing(false);
    commitRegions(latestRegionsRef.current, { type: tool === 'brush' ? 'brush' : 'erase', regionId: selectedRegion.id, point: polygonCenter(selectedRegion.polygon), radius: BRUSH_RADIUS });
  };

  const applyPaint = (point: [number, number], paintTool: 'brush' | 'erase', shouldPersist: boolean) => {
    if (!regionSet || !editable || !selectedRegion) return;
    const mask = polygonToMask(selectedRegion.polygon);
    paintCircle(mask, point, BRUSH_RADIUS, paintTool === 'brush');
    const polygon = maskToPolygon(mask);
    if (!polygon) return;
    const regions = regionSet.regions.map(region => region.id === selectedRegion.id ? { ...region, polygon, areaRatio: polygonArea(polygon), maskAssetId: null, maskUrl: null } : region);
    setRegionSet({ ...regionSet, regions });
    if (shouldPersist) commitRegions(regions, { type: paintTool, regionId: selectedRegion.id, point, radius: BRUSH_RADIUS });
  };

  const finishPolygon = () => {
    if (!regionSet || !editable || polygonDraft.length < 3) return;
    const regionId = createRegionId('manual');
    const polygon = simplifyPolygon(polygonDraft, 0.004);
    const region: FloorPlanRegion = {
      id: regionId,
      number: regionSet.regions.length + 1,
      polygon,
      areaRatio: polygonArea(polygon),
      suggestedName: null,
      name: '',
      confidence: 1,
      maskAssetId: null,
      maskUrl: null,
    };
    commitRegions([...regionSet.regions, region], { type: 'add-polygon', regionId, polygon });
    setSelectedIds([regionId]);
    setPolygonDraft([]);
    setTool('select');
  };

  const selectRegion = (regionId: string, event?: PointerEvent | MouseEvent) => {
    if (event?.shiftKey || event?.ctrlKey || event?.metaKey) {
      setSelectedIds(current => current.includes(regionId) ? current.filter(id => id !== regionId) : [...current, regionId]);
      return;
    }
    setSelectedIds([regionId]);
  };

  if (regionSet?.status === 'confirmed' && workflowStep === 'materials') {
    return <FloorPlanMaterialPanel
      regionSet={regionSet}
      sourceImageUrl={imageUrl}
      creditBalance={creditBalance}
      onRefreshCreditBalance={onRefreshCreditBalance}
      onEnsureProject={onEnsureProject}
      onBack={() => setWorkflowStep('regions')}
      onResetRegionsAndMaterials={onResetRegionsAndMaterials}
      onResetAll={onResetAll}
    />;
  }

  if (!image) {
    return <main className="workspace-canvas flex min-w-0 flex-1 items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <ScanLine className="mx-auto h-12 w-12 text-slate-300" />
        <h3 className="mt-4 text-lg font-bold text-slate-700">上传黑白平面图</h3>
        <p className="mt-2 text-sm text-slate-500">上传后可自动识别封闭地面区域。</p>
        <button type="button" onClick={onUpload} className="mt-5 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white">选择图片</button>
      </div>
    </main>;
  }

  return <main className="workspace-canvas flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-100">
    <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white/90 px-4 py-2">
      <div>
        <h3 className="text-sm font-bold text-slate-800">地面区域识别与校正</h3>
        <p className="text-xs text-slate-500">{regionSet ? `当前 ${regionSet.regions.length} 个区域${regionSet.status === 'confirmed' ? ' · 已确认版本' : isSaving ? ' · 正在保存' : ''}` : isRestoring ? '正在恢复识别结果…' : '识别封闭房间并校正区域'}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onResetRegionsAndMaterials} disabled={image.uploadStatus !== 'uploaded' || !image.assetId} className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-amber-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"><RotateCcw className="h-4 w-4" />重置区域与材质</button>
        <button type="button" onClick={onResetAll} className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600"><Trash2 className="h-4 w-4" />全部重置</button>
        <button type="button" onClick={() => setShowOverlay(value => !value)} disabled={!regionSet} className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-xs font-bold disabled:opacity-40">{showOverlay ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{showOverlay ? '隐藏覆盖层' : '显示覆盖层'}</button>
        <button type="button" onClick={() => void runSegmentation()} disabled={isLoading || isRestoring || image.uploadStatus !== 'uploaded' || !image.assetId} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:bg-slate-300">{isLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : regionSet ? <RefreshCw className="h-4 w-4" /> : <ScanLine className="h-4 w-4" />}{isLoading ? '正在识别地面区域…' : regionSet ? '重新识别' : '识别地面区域'}</button>
      </div>
    </div>

    {error ? <div role="alert" className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div> : null}

    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="min-w-0 flex-1 overflow-auto p-5">
        <div className="mx-auto max-w-5xl overflow-hidden rounded-xl bg-white shadow-lg">
          <div
            ref={viewerRef}
            className="relative touch-none"
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onPointerCancel={onCanvasPointerUp}
          >
            <img src={imageUrl} alt="待识别平面图" className="block h-auto w-full select-none" draggable={false} />
            {showOverlay && regionSet ? <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-label="区域编辑覆盖层">
              {regionSet.regions.map((region, index) => {
                const points = region.polygon.map(point => point.join(',')).join(' ');
                const center = polygonCenter(region.polygon);
                const active = selectedIds.includes(region.id);
                return <g key={region.id} onClick={event => { event.stopPropagation(); selectRegion(region.id, event); }} className="cursor-pointer">
                  <polygon points={points} fill={COLORS[index % COLORS.length]} fillOpacity={active ? 0.52 : 0.32} stroke={active ? '#0f172a' : COLORS[index % COLORS.length]} strokeWidth={active ? 0.004 : 0.002} />
                  <circle cx={center[0]} cy={center[1]} r="0.018" fill="#0f172a" />
                  <text x={center[0]} y={center[1]} textAnchor="middle" dominantBaseline="central" fill="white" fontSize="0.022" fontWeight="700">{region.number}</text>
                </g>;
              })}
              {polygonDraft.length ? <polyline points={polygonDraft.map(point => point.join(',')).join(' ')} fill="none" stroke="#0f172a" strokeWidth="0.004" strokeDasharray="0.01 0.01" /> : null}
              {polygonDraft.map((point, index) => <circle key={`${point[0]}-${point[1]}-${index}`} cx={point[0]} cy={point[1]} r="0.008" fill="#0f172a" />)}
            </svg> : null}
          </div>
        </div>
      </div>

      <aside className="w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-3">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-800">区域编辑</span>
          {regionSet?.status === 'confirmed' ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">已确认</span> : null}
        </div>

        <div className="mb-3 grid grid-cols-4 gap-1">
          <ToolButton active={tool === 'select'} disabled={!editable} onClick={() => setTool('select')} icon={<MousePointer2 className="h-4 w-4" />} label="选择" />
          <ToolButton active={tool === 'polygon'} disabled={!editable} onClick={() => setTool('polygon')} icon={<PenLine className="h-4 w-4" />} label="多边形" />
          <ToolButton active={tool === 'brush'} disabled={!editable || !selectedRegion} onClick={() => setTool('brush')} icon={<Brush className="h-4 w-4" />} label="画笔" />
          <ToolButton active={tool === 'erase'} disabled={!editable || !selectedRegion} onClick={() => setTool('erase')} icon={<Eraser className="h-4 w-4" />} label="橡皮擦" />
        </div>

        {tool === 'polygon' ? <div className="mb-3 flex gap-2">
          <button type="button" onClick={finishPolygon} disabled={polygonDraft.length < 3} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:bg-slate-300"><Plus className="h-4 w-4" />完成新增</button>
          <button type="button" onClick={() => setPolygonDraft([])} className="rounded-lg border px-3 py-2 text-xs font-bold">清空</button>
        </div> : null}

        <div className="mb-3 grid grid-cols-4 gap-1">
          <ToolButton disabled={!canUndo || !editable} onClick={undo} icon={<Undo2 className="h-4 w-4" />} label="撤销" />
          <ToolButton disabled={!canRedo || !editable} onClick={redo} icon={<Redo2 className="h-4 w-4" />} label="重做" />
          <ToolButton disabled={!editable || !selectedIds.length} onClick={deleteSelected} icon={<Trash2 className="h-4 w-4" />} label="删除" />
          <ToolButton disabled={!editable || selectedIds.length < 2} onClick={mergeSelected} icon={<Merge className="h-4 w-4" />} label="合并" />
          <ToolButton disabled={!editable || !selectedRegion} onClick={splitSelected} icon={<Scissors className="h-4 w-4" />} label="拆分" />
          <ToolButton disabled={!editable || !regionSet} onClick={() => void restoreAuto()} icon={<RotateCcw className="h-4 w-4" />} label="恢复" />
        </div>

        <div className="space-y-2">
          {regionSet?.regions.map((region, index) => <div key={region.id} onClick={() => setSelectedIds([region.id])} className={`rounded-xl border p-2 ${selectedIds.includes(region.id) ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={selectedIds.includes(region.id)} onChange={() => setSelectedIds(current => current.includes(region.id) ? current.filter(id => id !== region.id) : [...current, region.id])} disabled={!editable} className="h-4 w-4" aria-label={`选择区域 ${region.number}`} />
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: COLORS[index % COLORS.length] }}>{region.number}</span>
              <input value={region.name} onChange={event => renameRegion(region.id, event.target.value)} onBlur={() => saveName(region.id)} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} disabled={!editable} placeholder="房间名称" className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold disabled:bg-slate-50" aria-label={`区域 ${region.number} 名称`} />
            </div>
            <p className="mt-1 pl-14 text-[10px] text-slate-400">约占图面 {(region.areaRatio * 100).toFixed(1)}% · regionId {region.id}</p>
          </div>) || <p className="py-8 text-center text-xs text-slate-400">尚未识别区域</p>}
        </div>

        {regionSet?.status === 'confirmed'
          ? <button type="button" onClick={() => setWorkflowStep('materials')} className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white"><Check className="h-4 w-4" />进入设置区域材质</button>
          : regionSet ? <button type="button" onClick={() => void confirm()} disabled={isLoading || isSaving} className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white disabled:bg-slate-300"><Check className="h-4 w-4" />确认区域划分</button> : null}
      </aside>
    </div>
  </main>;
}

function ToolButton({ active = false, disabled = false, onClick, icon, label }: { active?: boolean; disabled?: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return <button type="button" onClick={onClick} disabled={disabled} title={label} className={`inline-flex h-10 items-center justify-center gap-1 rounded-lg border text-xs font-bold disabled:opacity-35 ${active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700'}`}>{icon}<span className="sr-only">{label}</span></button>;
}

function cloneRegions(regions: FloorPlanRegion[]): FloorPlanRegion[] {
  return regions.map(region => ({ ...region, polygon: region.polygon.map(point => [point[0], point[1]]) }));
}

function renumberRegions(regions: FloorPlanRegion[]): FloorPlanRegion[] {
  return [...regions]
    .filter(region => region.polygon.length >= 3)
    .sort((a, b) => {
      const ac = polygonCenter(a.polygon);
      const bc = polygonCenter(b.polygon);
      return ac[1] - bc[1] || ac[0] - bc[0];
    })
    .map((region, index) => ({ ...region, number: index + 1, areaRatio: polygonArea(region.polygon) }));
}

function polygonCenter(points: RegionPolygon): [number, number] {
  if (!points.length) return [0.5, 0.5];
  return [points.reduce((sum, point) => sum + point[0], 0) / points.length, points.reduce((sum, point) => sum + point[1], 0) / points.length];
}

function polygonArea(points: RegionPolygon): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return Math.min(1, Math.abs(area) / 2);
}

function polygonToMask(polygon: RegionPolygon): Uint8Array {
  const mask = new Uint8Array(GRID_SIZE * GRID_SIZE);
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      if (pointInPolygon([(x + 0.5) / GRID_SIZE, (y + 0.5) / GRID_SIZE], polygon)) mask[y * GRID_SIZE + x] = 1;
    }
  }
  return mask;
}

function paintCircle(mask: Uint8Array, point: [number, number], radius: number, value: boolean): void {
  const minX = Math.max(0, Math.floor((point[0] - radius) * GRID_SIZE));
  const maxX = Math.min(GRID_SIZE - 1, Math.ceil((point[0] + radius) * GRID_SIZE));
  const minY = Math.max(0, Math.floor((point[1] - radius) * GRID_SIZE));
  const maxY = Math.min(GRID_SIZE - 1, Math.ceil((point[1] + radius) * GRID_SIZE));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = (x + 0.5) / GRID_SIZE - point[0];
      const dy = (y + 0.5) / GRID_SIZE - point[1];
      if (Math.hypot(dx, dy) <= radius) mask[y * GRID_SIZE + x] = value ? 1 : 0;
    }
  }
}

function maskToPolygon(mask: Uint8Array): RegionPolygon | null {
  const edges = new Map<string, [number, number][]>();
  const add = (a: [number, number], b: [number, number]) => {
    const key = `${a[0]},${a[1]}`;
    const list = edges.get(key) || [];
    list.push(b);
    edges.set(key, list);
  };
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const x = index % GRID_SIZE;
    const y = Math.floor(index / GRID_SIZE);
    if (y === 0 || !mask[index - GRID_SIZE]) add([x, y], [x + 1, y]);
    if (x === GRID_SIZE - 1 || !mask[index + 1]) add([x + 1, y], [x + 1, y + 1]);
    if (y === GRID_SIZE - 1 || !mask[index + GRID_SIZE]) add([x + 1, y + 1], [x, y + 1]);
    if (x === 0 || !mask[index - 1]) add([x, y + 1], [x, y]);
  }
  const startKey = [...edges.keys()].sort((a, b) => {
    const [ax, ay] = a.split(',').map(Number);
    const [bx, by] = b.split(',').map(Number);
    return ay - by || ax - bx;
  })[0];
  if (!startKey) return null;
  const start = startKey.split(',').map(Number) as [number, number];
  const polygon: RegionPolygon = [[start[0] / GRID_SIZE, start[1] / GRID_SIZE]];
  let current = start;
  for (let guard = 0; guard < edges.size + 5; guard += 1) {
    const next = edges.get(`${current[0]},${current[1]}`)?.shift();
    if (!next) break;
    if (next[0] === start[0] && next[1] === start[1]) break;
    polygon.push([next[0] / GRID_SIZE, next[1] / GRID_SIZE]);
    current = next;
  }
  return polygon.length >= 3 ? simplifyPolygon(polygon, 0.006).map(([x, y]) => [clamp01(x), clamp01(y)]) : null;
}

function splitPolygonByBounds(polygon: RegionPolygon): [RegionPolygon, RegionPolygon] | null {
  const xs = polygon.map(point => point[0]);
  const ys = polygon.map(point => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  if (maxX - minX < 0.04 || maxY - minY < 0.04) return null;
  if (maxX - minX >= maxY - minY) {
    const mid = (minX + maxX) / 2;
    return [
      [[minX, minY], [mid, minY], [mid, maxY], [minX, maxY]],
      [[mid, minY], [maxX, minY], [maxX, maxY], [mid, maxY]],
    ];
  }
  const mid = (minY + maxY) / 2;
  return [
    [[minX, minY], [maxX, minY], [maxX, mid], [minX, mid]],
    [[minX, mid], [maxX, mid], [maxX, maxY], [minX, maxY]],
  ];
}

function pointInPolygon(point: [number, number], polygon: RegionPolygon): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const xi = polygon[index][0];
    const yi = polygon[index][1];
    const xj = polygon[previous][0];
    const yj = polygon[previous][1];
    const intersect = yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function simplifyPolygon(points: RegionPolygon, epsilon: number): RegionPolygon {
  if (points.length < 4) return points;
  let maxDistance = 0;
  let splitIndex = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = pointLineDistance(points[index], points[0], points[points.length - 1]);
    if (distance > maxDistance) {
      maxDistance = distance;
      splitIndex = index;
    }
  }
  if (maxDistance <= epsilon) return [points[0], points[points.length - 1]];
  return [...simplifyPolygon(points.slice(0, splitIndex + 1), epsilon).slice(0, -1), ...simplifyPolygon(points.slice(splitIndex), epsilon)];
}

function pointLineDistance(point: [number, number], start: [number, number], end: [number, number]): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (!dx && !dy) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  return Math.abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]) / Math.hypot(dx, dy);
}

function createRegionId(prefix: string): string {
  return `region-${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
