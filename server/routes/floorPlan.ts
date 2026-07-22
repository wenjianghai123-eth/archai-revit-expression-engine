import { NextFunction, Request, Response, Router } from 'express';
import { getRequiredCurrentUser, requireAuth } from '../auth';
import { createStoredFilename, fileStorageProvider } from '../fileStorage';
import { ApiResponse, apiError, apiOk } from '../http';
import { composeFloorPlanMaterialPreview, MaterialPreviewError } from '../floorPlanMaterialPreview';
import {
  readOwnedImageAsset,
  renderFloorPlanRegionMasks,
  segmentFloorPlan,
  SegmentationError,
} from '../floorPlanSegmentation';
import {
  createFloorPlanRegionSet,
  createImageAsset,
  ensureFloorPlanSchemaReady,
  getFloorPlanRegionSet,
  getImageAsset,
  getLatestFloorPlanRegionSet,
  listFloorPlanRegionMaterials,
  saveFloorPlanRegionMaterials,
  updateFloorPlanRegionSet,
  type FloorPlanRegion,
  type FloorPlanRegionMaterial,
  type FloorPlanRegionSet,
  type ImageAsset,
  type SaveFloorPlanRegionMaterialInput,
} from '../storage';

export function createFloorPlanRouter(): Router {
  const router = Router();

  router.post('/segment', requireAuth, async (req: Request, res: Response<ApiResponse<{ regionSet: FloorPlanRegionSet }>>, next: NextFunction) => {
    try {
      const user = getRequiredCurrentUser(req);
      const assetId = typeof req.body?.assetId === 'string' ? req.body.assetId.trim() : '';
      if (!assetId) {
        res.status(400).json(apiError('缺少正式图片资产 ID。', 'FLOOR_PLAN_ASSET_ID_REQUIRED'));
        return;
      }

      await ensureFloorPlanSchemaReady();

      const asset = await getImageAsset(assetId, user.id);
      if (!asset) {
        res.status(404).json(apiError('平面图资产不存在或无权访问。', 'FLOOR_PLAN_ASSET_NOT_FOUND'));
        return;
      }

      const image = await readOwnedImageAsset(asset);
      const segmented = await segmentFloorPlan(image);
      const baseRegions = segmented.regions.map((candidate, index) => normalizeStoredRegion({
        id: `region-${index + 1}`,
        number: index + 1,
        polygon: candidate.polygon,
        areaRatio: candidate.areaRatio,
        suggestedName: null,
        name: `区域 ${index + 1}`,
        regionType: null,
        regionUsage: '',
        confidence: candidate.confidence,
        maskAssetId: null,
        maskUrl: null,
      }, index));
      const stored = await persistRegionMasks(user.id, segmented.width, segmented.height, baseRegions);
      const regionSet = await createFloorPlanRegionSet({
        userId: user.id,
        sourceAssetId: asset.id,
        width: segmented.width,
        height: segmented.height,
        regions: stored.regions,
        autoRegions: stored.regions,
        overlayAssetId: stored.overlayAsset.id,
        overlayUrl: stored.overlayAsset.url,
      });

      console.info('[floor-plan-segment] completed', { userId: user.id, assetId: asset.id, regionSetId: regionSet.id, regionCount: regionSet.regions.length, width: segmented.width, height: segmented.height });
      res.status(201).json(apiOk({ regionSet }));
    } catch (error) {
      if (error instanceof SegmentationError) {
        res.status(error.code === 'FLOOR_PLAN_NO_REGIONS' ? 422 : 400).json(apiError(error.message, error.code));
        return;
      }
      next(error);
    }
  });

  router.get('/segments/latest', requireAuth, async (req: Request, res: Response<ApiResponse<{ regionSet: FloorPlanRegionSet | null }>>, next: NextFunction) => {
    try {
      const assetId = typeof req.query.assetId === 'string' ? req.query.assetId.trim() : '';
      if (!assetId) {
        res.status(400).json(apiError('缺少图片资产 ID。', 'FLOOR_PLAN_ASSET_ID_REQUIRED'));
        return;
      }
      const user = getRequiredCurrentUser(req);
      if (!await getImageAsset(assetId, user.id)) {
        res.status(404).json(apiError('平面图资产不存在或无权访问。', 'FLOOR_PLAN_ASSET_NOT_FOUND'));
        return;
      }
      res.json(apiOk({ regionSet: await getLatestFloorPlanRegionSet(assetId, user.id) }));
    } catch (error) {
      next(error);
    }
  });

  router.patch('/segments/:id', requireAuth, async (req: Request, res: Response<ApiResponse<{ regionSet: FloorPlanRegionSet }>>, next: NextFunction) => {
    try {
      const user = getRequiredCurrentUser(req);
      const current = await getFloorPlanRegionSet(req.params.id, user.id);
      if (!current) {
        res.status(404).json(apiError('区域识别结果不存在或无权访问。', 'FLOOR_PLAN_REGION_SET_NOT_FOUND'));
        return;
      }
      if (current.status === 'confirmed' || current.lockedAt) {
        res.status(409).json(apiError('已确认的区域版本不可修改，请重新识别后再编辑。', 'FLOOR_PLAN_REGION_SET_LOCKED'));
        return;
      }

      const nextRegions = readRegionPatch(req.body, current);
      if (!nextRegions) {
        res.status(400).json(apiError('区域数据无效。', 'FLOOR_PLAN_REGIONS_INVALID'));
        return;
      }

      const stored = await persistRegionMasks(user.id, current.width, current.height, nextRegions);
      const updated = await updateFloorPlanRegionSet(current.id, user.id, {
        regions: stored.regions,
        overlayAssetId: stored.overlayAsset.id,
        overlayUrl: stored.overlayAsset.url,
        status: 'recognized',
        confirmedAt: null,
        lockedAt: null,
      });
      if (!updated) {
        res.status(404).json(apiError('区域识别结果不存在。', 'FLOOR_PLAN_REGION_SET_NOT_FOUND'));
        return;
      }
      res.json(apiOk({ regionSet: updated }));
    } catch (error) {
      next(error);
    }
  });

  router.post('/segments/:id/restore-auto', requireAuth, async (req: Request, res: Response<ApiResponse<{ regionSet: FloorPlanRegionSet }>>, next: NextFunction) => {
    try {
      const user = getRequiredCurrentUser(req);
      const current = await getFloorPlanRegionSet(req.params.id, user.id);
      if (!current) {
        res.status(404).json(apiError('区域识别结果不存在或无权访问。', 'FLOOR_PLAN_REGION_SET_NOT_FOUND'));
        return;
      }
      if (current.status === 'confirmed' || current.lockedAt) {
        res.status(409).json(apiError('已确认的区域版本不可修改，请重新识别后再编辑。', 'FLOOR_PLAN_REGION_SET_LOCKED'));
        return;
      }
      const stored = await persistRegionMasks(user.id, current.width, current.height, current.autoRegions.length ? current.autoRegions : current.regions);
      const updated = await updateFloorPlanRegionSet(current.id, user.id, {
        regions: stored.regions,
        overlayAssetId: stored.overlayAsset.id,
        overlayUrl: stored.overlayAsset.url,
        status: 'recognized',
        confirmedAt: null,
        lockedAt: null,
      });
      if (!updated) {
        res.status(404).json(apiError('区域识别结果不存在。', 'FLOOR_PLAN_REGION_SET_NOT_FOUND'));
        return;
      }
      res.json(apiOk({ regionSet: updated }));
    } catch (error) {
      next(error);
    }
  });

  router.post('/segments/:id/confirm', requireAuth, async (req: Request, res: Response<ApiResponse<{ regionSet: FloorPlanRegionSet }>>, next: NextFunction) => {
    try {
      const user = getRequiredCurrentUser(req);
      const current = await getFloorPlanRegionSet(req.params.id, user.id);
      if (!current) {
        res.status(404).json(apiError('区域识别结果不存在或无权访问。', 'FLOOR_PLAN_REGION_SET_NOT_FOUND'));
        return;
      }

      const confirmedAt = new Date().toISOString();
      const sourceRegions = readRegions(req.body?.regions);
      const regionsToConfirm = sourceRegions ? renumberRegions(sourceRegions) : current.regions;
      const stored = await persistRegionMasks(user.id, current.width, current.height, regionsToConfirm);
      const confirmed = await createFloorPlanRegionSet({
        userId: user.id,
        sourceAssetId: current.sourceAssetId,
        width: current.width,
        height: current.height,
        regions: stored.regions,
        autoRegions: current.autoRegions.length ? current.autoRegions : current.regions,
        overlayAssetId: stored.overlayAsset.id,
        overlayUrl: stored.overlayAsset.url,
        status: 'confirmed',
        versionNumber: current.versionNumber + 1,
        baseRegionSetId: current.id,
        lockedAt: confirmedAt,
        confirmedAt,
      });

      await updateFloorPlanRegionSet(current.id, user.id, { lockedAt: confirmedAt });
      console.info('[floor-plan-segment] confirmed', { userId: user.id, sourceRegionSetId: current.id, confirmedRegionSetId: confirmed.id, regionCount: confirmed.regions.length });
      res.json(apiOk({ regionSet: confirmed }));
    } catch (error) {
      next(error);
    }
  });

  router.get('/segments/:id/materials', requireAuth, async (req: Request, res: Response<ApiResponse<{ materials: FloorPlanRegionMaterial[] }>>, next: NextFunction) => {
    try {
      const user = getRequiredCurrentUser(req);
      const regionSet = await getFloorPlanRegionSet(req.params.id, user.id);
      if (!regionSet) {
        res.status(404).json(apiError('区域版本不存在或无权访问。', 'FLOOR_PLAN_REGION_SET_NOT_FOUND'));
        return;
      }
      if (regionSet.status !== 'confirmed') {
        res.status(409).json(apiError('请先确认区域划分，再设置区域材质。', 'FLOOR_PLAN_REGIONS_NOT_CONFIRMED'));
        return;
      }
      res.json(apiOk({ materials: await listFloorPlanRegionMaterials(regionSet.id, user.id) }));
    } catch (error) {
      next(error);
    }
  });

  router.put('/segments/:id/materials', requireAuth, async (req: Request, res: Response<ApiResponse<{ materials: FloorPlanRegionMaterial[] }>>, next: NextFunction) => {
    try {
      const user = getRequiredCurrentUser(req);
      const regionSet = await getFloorPlanRegionSet(req.params.id, user.id);
      if (!regionSet) {
        res.status(404).json(apiError('区域版本不存在或无权访问。', 'FLOOR_PLAN_REGION_SET_NOT_FOUND'));
        return;
      }
      if (regionSet.status !== 'confirmed') {
        res.status(409).json(apiError('请先确认区域划分，再设置区域材质。', 'FLOOR_PLAN_REGIONS_NOT_CONFIRMED'));
        return;
      }

      const materials = readRegionMaterials(req.body?.materials);
      if (!materials) {
        res.status(400).json(apiError('区域材质配置格式无效。', 'FLOOR_PLAN_MATERIALS_INVALID'));
        return;
      }
      const expectedRegionIds = new Set(regionSet.regions.map(region => region.id));
      if (materials.length !== expectedRegionIds.size || materials.some(material => !expectedRegionIds.has(material.regionId))) {
        res.status(400).json(apiError('材质配置必须与已确认区域一一对应。', 'FLOOR_PLAN_MATERIAL_REGION_MISMATCH'));
        return;
      }
      const referenceWithoutAsset = materials.find(material => material.fallbackMode === 'reference' && !material.materialAssetId);
      if (referenceWithoutAsset) {
        res.status(400).json(apiError(`区域 ${referenceWithoutAsset.regionId} 尚未上传材质参考图。`, 'FLOOR_PLAN_MATERIAL_REFERENCE_REQUIRED'));
        return;
      }

      const assetIds = [...new Set(materials.map(material => material.materialAssetId).filter((id): id is string => Boolean(id)))];
      for (const assetId of assetIds) {
        if (!await getImageAsset(assetId, user.id)) {
          res.status(404).json(apiError('材质参考图不存在或无权访问。', 'FLOOR_PLAN_MATERIAL_ASSET_NOT_FOUND'));
          return;
        }
      }

      const saved = await saveFloorPlanRegionMaterials(regionSet.id, user.id, materials.map(material => ({
        ...material,
        materialAssetId: material.fallbackMode === 'reference' ? material.materialAssetId : null,
      })));
      console.info('[floor-plan-materials] saved', {
        userId: user.id,
        regionSetId: regionSet.id,
        regionCount: saved.length,
        referenceCount: saved.filter(material => material.fallbackMode === 'reference').length,
      });
      res.json(apiOk({ materials: saved }));
    } catch (error) {
      next(error);
    }
  });

  router.post('/material-preview', requireAuth, async (req: Request, res: Response<ApiResponse<{ controlAsset: ImageAsset }>>, next: NextFunction) => {
    try {
      const user = getRequiredCurrentUser(req);
      const sourceAssetId = typeof req.body?.sourceAssetId === 'string' ? req.body.sourceAssetId.trim() : '';
      const regionSetId = typeof req.body?.regionSetId === 'string' ? req.body.regionSetId.trim() : '';
      if (!sourceAssetId || !regionSetId) {
        res.status(400).json(apiError('缺少原始图片资产或已确认区域版本。', 'FLOOR_PLAN_MATERIAL_PREVIEW_INPUT_REQUIRED'));
        return;
      }

      const regionSet = await getFloorPlanRegionSet(regionSetId, user.id);
      if (!regionSet) {
        res.status(404).json(apiError('区域版本不存在或无权访问。', 'FLOOR_PLAN_REGION_SET_NOT_FOUND'));
        return;
      }
      if (regionSet.status !== 'confirmed') {
        res.status(409).json(apiError('请先确认区域划分，再生成材质控制图。', 'FLOOR_PLAN_REGIONS_NOT_CONFIRMED'));
        return;
      }
      if (regionSet.sourceAssetId !== sourceAssetId) {
        res.status(400).json(apiError('原始图片与区域版本不匹配。', 'FLOOR_PLAN_MATERIAL_SOURCE_MISMATCH'));
        return;
      }
      const sourceAsset = await getImageAsset(sourceAssetId, user.id);
      if (!sourceAsset) {
        res.status(404).json(apiError('原始平面图不存在或无权访问。', 'FLOOR_PLAN_ASSET_NOT_FOUND'));
        return;
      }

      const assignments = readRegionMaterials(req.body?.assignments);
      if (!assignments) {
        res.status(400).json(apiError('区域材质配置格式无效。', 'FLOOR_PLAN_MATERIALS_INVALID'));
        return;
      }
      const expectedRegionIds = new Set(regionSet.regions.map(region => region.id));
      if (assignments.length !== expectedRegionIds.size || assignments.some(assignment => !expectedRegionIds.has(assignment.regionId))) {
        res.status(400).json(apiError('材质配置必须与已确认区域一一对应。', 'FLOOR_PLAN_MATERIAL_REGION_MISMATCH'));
        return;
      }
      const missingReference = assignments.find(assignment => assignment.fallbackMode === 'reference' && !assignment.materialAssetId);
      if (missingReference) {
        res.status(400).json(apiError(`区域 ${missingReference.regionId} 尚未上传材质参考图。`, 'FLOOR_PLAN_MATERIAL_REFERENCE_REQUIRED'));
        return;
      }

      const materialImages = new Map<string, Buffer>();
      const assetIds = [...new Set(assignments.map(assignment => assignment.materialAssetId).filter((id): id is string => Boolean(id)))];
      for (const assetId of assetIds) {
        const asset = await getImageAsset(assetId, user.id);
        if (!asset) {
          res.status(404).json(apiError('材质参考图不存在或无权访问。', 'FLOOR_PLAN_MATERIAL_ASSET_NOT_FOUND'));
          return;
        }
        materialImages.set(assetId, await readOwnedImageAsset(asset));
      }

      const controlImage = await composeFloorPlanMaterialPreview({
        sourceImage: await readOwnedImageAsset(sourceAsset),
        width: regionSet.width,
        height: regionSet.height,
        regions: regionSet.regions,
        assignments,
        materialImages,
      });
      const stored = await fileStorageProvider.uploadImage({
        content: controlImage,
        filename: createStoredFilename('png', 'floor-material-control'),
        mimeType: 'image/png',
        userId: user.id,
      });
      const controlAsset = await createImageAsset({
        userId: user.id,
        url: stored.url,
        filename: stored.filename,
        mimeType: stored.mimeType,
        size: stored.size,
      });
      console.info('[floor-plan-material-preview] completed', {
        userId: user.id,
        sourceAssetId,
        regionSetId,
        controlAssetId: controlAsset.id,
        regionCount: regionSet.regions.length,
        referenceCount: assetIds.length,
      });
      res.status(201).json(apiOk({ controlAsset }));
    } catch (error) {
      if (error instanceof MaterialPreviewError) {
        res.status(422).json(apiError(error.message, error.code));
        return;
      }
      if (error instanceof SegmentationError) {
        const status = error.code.endsWith('_DOWNLOAD_FAILED') ? 502 : 400;
        res.status(status).json(apiError(error.message, error.code));
        return;
      }
      next(error);
    }
  });

  return router;
}

const MATERIAL_DIRECTIONS = new Set<FloorPlanRegionMaterial['direction']>(['auto', 'horizontal', 'vertical', 'diagonal']);
const MATERIAL_JOINT_MODES = new Set<FloorPlanRegionMaterial['jointMode']>(['subtle', 'visible', 'none']);
const MATERIAL_FALLBACK_MODES = new Set<FloorPlanRegionMaterial['fallbackMode']>(['reference', 'default', 'ai-auto']);

function readRegionMaterials(value: unknown): SaveFloorPlanRegionMaterialInput[] | null {
  if (!Array.isArray(value)) return null;
  const materials: SaveFloorPlanRegionMaterialInput[] = [];
  const regionIds = new Set<string>();
  for (const candidate of value) {
    if (!isRecord(candidate)) return null;
    const regionId = typeof candidate.regionId === 'string' ? candidate.regionId.trim().slice(0, 80) : '';
    if (!regionId || regionIds.has(regionId)) return null;
    const materialAssetId = candidate.materialAssetId === null || candidate.materialAssetId === undefined
      ? null
      : typeof candidate.materialAssetId === 'string' && candidate.materialAssetId.trim()
        ? candidate.materialAssetId.trim()
        : null;
    const scale = candidate.scale;
    const rotation = candidate.rotation;
    const direction = candidate.direction;
    const jointMode = candidate.jointMode;
    const fallbackMode = candidate.fallbackMode;
    if (typeof scale !== 'number' || !Number.isFinite(scale) || scale < 0.1 || scale > 20) return null;
    if (typeof rotation !== 'number' || !Number.isFinite(rotation) || rotation < -360 || rotation > 360) return null;
    if (!MATERIAL_DIRECTIONS.has(direction as FloorPlanRegionMaterial['direction'])) return null;
    if (!MATERIAL_JOINT_MODES.has(jointMode as FloorPlanRegionMaterial['jointMode'])) return null;
    if (!MATERIAL_FALLBACK_MODES.has(fallbackMode as FloorPlanRegionMaterial['fallbackMode'])) return null;
    regionIds.add(regionId);
    materials.push({
      regionId,
      materialAssetId,
      materialName: typeof candidate.materialName === 'string' ? candidate.materialName.trim().slice(0, 80) : '',
      scale,
      rotation,
      direction: direction as FloorPlanRegionMaterial['direction'],
      jointMode: jointMode as FloorPlanRegionMaterial['jointMode'],
      fallbackMode: fallbackMode as FloorPlanRegionMaterial['fallbackMode'],
    });
  }
  return materials;
}

function readRegionPatch(body: unknown, current: FloorPlanRegionSet): FloorPlanRegion[] | null {
  const record = isRecord(body) ? body : {};
  const regions = readRegions(record.regions);
  if (regions) return renumberRegions(regions);

  const names = record.names;
  if (!isRecord(names)) return null;
  return renumberRegions(current.regions.map(region => {
    const value = names[region.id];
    return typeof value === 'string' ? { ...region, name: value.trim().slice(0, 80) } : region;
  }));
}

function readRegions(value: unknown): FloorPlanRegion[] | null {
  if (!Array.isArray(value)) return null;
  const regions: FloorPlanRegion[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const region = readRegion(value[index], index);
    if (!region || ids.has(region.id)) return null;
    ids.add(region.id);
    regions.push(region);
  }
  return regions;
}

function readRegion(value: unknown, index: number): FloorPlanRegion | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim().slice(0, 80) : `region-${index + 1}`;
  const polygon = readPolygon(value.polygon);
  if (!polygon) return null;
  return normalizeStoredRegion({
    id,
    number: typeof value.number === 'number' ? value.number : index + 1,
    polygon,
    areaRatio: polygonArea(polygon),
    suggestedName: typeof value.suggestedName === 'string' ? value.suggestedName : null,
    name: typeof value.name === 'string' ? value.name.trim().slice(0, 80) : '',
    regionType: readRegionType(value.regionType),
    regionUsage: typeof value.regionUsage === 'string' ? value.regionUsage.trim().slice(0, 120) : '',
    confidence: typeof value.confidence === 'number' ? Math.max(0, Math.min(1, value.confidence)) : 1,
    maskAssetId: null,
    maskUrl: null,
  }, index);
}

function readPolygon(value: unknown): [number, number][] | null {
  if (!Array.isArray(value) || value.length < 3 || value.length > 240) return null;
  const points: [number, number][] = [];
  for (const point of value) {
    if (!Array.isArray(point) || point.length < 2) return null;
    const x = Number(point[0]);
    const y = Number(point[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return null;
    points.push([x, y]);
  }
  return points;
}

function renumberRegions(regions: FloorPlanRegion[]): FloorPlanRegion[] {
  return [...regions]
    .filter(region => region.polygon.length >= 3)
    .sort((a, b) => {
      const ac = polygonCenter(a.polygon);
      const bc = polygonCenter(b.polygon);
      return ac[1] - bc[1] || ac[0] - bc[0];
    })
    .map((region, index) => normalizeStoredRegion({ ...region, number: index + 1, areaRatio: polygonArea(region.polygon) }, index));
}

async function persistRegionMasks(userId: string, width: number, height: number, regions: FloorPlanRegion[]): Promise<{ regions: FloorPlanRegion[]; overlayAsset: ImageAsset }> {
  const rendered = await renderFloorPlanRegionMasks(width, height, regions);
  const storedRegions: FloorPlanRegion[] = [];
  for (let index = 0; index < regions.length; index += 1) {
    const stored = await fileStorageProvider.uploadImage({
      content: rendered.masks[index],
      filename: createStoredFilename('png', `floor-region-${index + 1}`),
      mimeType: 'image/png',
      userId,
    });
    const maskAsset = await createImageAsset({ userId, url: stored.url, filename: stored.filename, mimeType: stored.mimeType, size: stored.size });
    storedRegions.push({ ...regions[index], number: index + 1, maskAssetId: maskAsset.id, maskUrl: maskAsset.url });
  }

  const overlayStored = await fileStorageProvider.uploadImage({
    content: rendered.overlay,
    filename: createStoredFilename('png', 'floor-regions-overlay'),
    mimeType: 'image/png',
    userId,
  });
  const overlayAsset = await createImageAsset({ userId, url: overlayStored.url, filename: overlayStored.filename, mimeType: overlayStored.mimeType, size: overlayStored.size });
  return { regions: storedRegions, overlayAsset };
}

function normalizeStoredRegion(region: FloorPlanRegion, index: number): FloorPlanRegion {
  return {
    ...region,
    number: index + 1,
    polygon: region.polygon.map(([x, y]) => [clamp01(x), clamp01(y)]),
    areaRatio: Number.isFinite(region.areaRatio) ? Math.max(0, Math.min(1, region.areaRatio)) : polygonArea(region.polygon),
    suggestedName: region.suggestedName ?? null,
    name: region.name ?? '',
    regionType: region.regionType ?? null,
    regionUsage: region.regionUsage ?? '',
    maskAssetId: region.maskAssetId ?? null,
    maskUrl: region.maskUrl ?? null,
  };
}

function readRegionType(value: unknown): NonNullable<FloorPlanRegion['regionType']> | null {
  type RegionType = NonNullable<FloorPlanRegion['regionType']>;
  const types = new Set<RegionType>(['living', 'dining', 'bedroom', 'kitchen', 'bathroom', 'circulation', 'service', 'outdoor', 'commercial', 'office', 'other']);
  return typeof value === 'string' && types.has(value as RegionType) ? value as RegionType : null;
}

function polygonArea(points: [number, number][]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return Math.min(1, Math.abs(area) / 2);
}

function polygonCenter(points: [number, number][]): [number, number] {
  if (!points.length) return [0.5, 0.5];
  return [
    points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length,
  ];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
