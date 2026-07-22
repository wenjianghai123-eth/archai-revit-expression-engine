import { NextFunction, Request, Response, Router } from 'express';
import { getRequiredCurrentUser, requireAuth } from '../auth';
import { readOwnedImageAsset } from '../floorPlanSegmentation';
import { apiError, apiOk, type ApiResponse } from '../http';
import { parseImageDataUrl, toImageDataUrl } from '../image/imageMetadata';
import {
  MaskRefinementError,
  refineImageMask,
  type MaskRefinementMode,
} from '../image/maskRefinementService';
import { getImageAsset } from '../storage';

interface RefineMaskBody {
  imageAssetId?: unknown;
  image?: unknown;
  roughMask?: unknown;
  maskMode?: unknown;
  targetObject?: unknown;
}

interface RefineMaskResponse {
  refinedMask: string;
  detectedObject: string;
  confidence: number;
  method: string;
}

export function createImageRouter(): Router {
  const router = Router();

  router.post('/refine-mask', requireAuth, async (
    req: Request<Record<string, string>, ApiResponse<RefineMaskResponse>, RefineMaskBody>,
    res: Response<ApiResponse<RefineMaskResponse>>,
    next: NextFunction,
  ) => {
    try {
      const user = getRequiredCurrentUser(req);
      const mode = req.body.maskMode === undefined ? 'smart' : readMaskMode(req.body.maskMode);
      if (!mode) {
        res.status(400).json(apiError('maskMode must be smart or precise.', 'MASK_REFINEMENT_MODE_INVALID'));
        return;
      }
      if (typeof req.body.roughMask !== 'string' || !req.body.roughMask.startsWith('data:image/')) {
        res.status(400).json(apiError('请提供有效的粗略 Mask。', 'MASK_REFINEMENT_MASK_REQUIRED'));
        return;
      }

      const inlineImage = typeof req.body.image === 'string' && req.body.image.startsWith('data:image/')
        ? req.body.image
        : null;
      const imageAssetId = readNonEmptyString(req.body.imageAssetId)
        || (!inlineImage ? readNonEmptyString(req.body.image) : null);
      let sourceImage: Buffer;
      if (imageAssetId) {
        const asset = await getImageAsset(imageAssetId, user.id);
        if (!asset) {
          res.status(404).json(apiError('原始图片资产不存在或无权访问。', 'MASK_REFINEMENT_IMAGE_NOT_FOUND'));
          return;
        }
        try {
          sourceImage = await readOwnedImageAsset(asset);
        } catch {
          throw new MaskRefinementError('读取原始图片失败，请重新上传后重试。', 'MASK_REFINEMENT_IMAGE_DOWNLOAD_FAILED');
        }
      } else if (inlineImage) {
        sourceImage = parseImageDataUrl(inlineImage).content;
      } else {
        res.status(400).json(apiError('请提供正式图片资产 ID。', 'MASK_REFINEMENT_IMAGE_REQUIRED'));
        return;
      }

      const roughMask = parseImageDataUrl(req.body.roughMask).content;
      const result = await refineImageMask({
        sourceImage,
        roughMask,
        mode,
        targetObject: readNonEmptyString(req.body.targetObject) || undefined,
      });
      console.info('[mask-refinement] completed', {
        userId: user.id,
        assetId: imageAssetId,
        mode,
        detectedObject: result.detectedObject,
        confidence: result.confidence,
        method: result.method,
      });
      res.json(apiOk({
        refinedMask: toImageDataUrl(result.mask, 'image/png'),
        detectedObject: result.detectedObject,
        confidence: result.confidence,
        method: result.method,
      }));
    } catch (error) {
      if (error instanceof MaskRefinementError) {
        res.status(400).json(apiError(error.message, error.code));
        return;
      }
      if (error instanceof Error && /image data url/iu.test(error.message)) {
        res.status(400).json(apiError('图片或 Mask 数据格式无效。', 'MASK_REFINEMENT_INPUT_INVALID'));
        return;
      }
      next(error);
    }
  });

  return router;
}

function readMaskMode(value: unknown): MaskRefinementMode | null {
  return value === 'smart' || value === 'precise' ? value : null;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
