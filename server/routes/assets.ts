import { NextFunction, Request, Response, Router } from 'express';
import { getRequiredCurrentUser, requireAuth } from '../auth';
import { createStoredFilename, fileStorageProvider } from '../fileStorage';
import { ApiResponse, apiError, apiOk } from '../http';
import {
  createImageAsset,
  createModelAsset,
  deleteModelAsset,
  getImageAsset,
  getModelAsset,
  ImageAsset,
  listModelAssets,
  ModelAsset,
} from '../storage';
import {
  getDefaultModelMimeType,
  getImageExtension,
  getModelFileType,
  isUploadOverLimit,
  isAllowedModelMimeType,
  readMultipartFile,
  readMultipartImage,
  sniffModelFile,
} from '../upload';

export function createAssetsRouter(options: { maxImageMb: number; maxModelMb: number }): Router {
  const router = Router();

  router.post('/images', requireAuth, async (
    req: Request,
    res: Response<ApiResponse<{ asset: ImageAsset }>>,
    next: NextFunction,
  ) => {
    try {
      const uploadedFile = await readMultipartImage(req, options.maxImageMb);
      if (uploadedFile.ok === false) {
        res.status(uploadedFile.status).json(apiError(uploadedFile.error.message, uploadedFile.error.code));
        return;
      }

      const extension = getImageExtension(uploadedFile.value.mimeType);
      const user = getRequiredCurrentUser(req);
      const storedFile = await fileStorageProvider.uploadImage({
        content: uploadedFile.value.content,
        filename: createStoredFilename(extension),
        mimeType: uploadedFile.value.mimeType,
        userId: user.id,
      });

      const asset = await createImageAsset({
        userId: user.id,
        url: storedFile.url,
        filename: storedFile.filename,
        mimeType: storedFile.mimeType,
        size: storedFile.size,
      });

      res.status(201).json(apiOk({ asset }));
    } catch (error) {
      next(error);
    }
  });

  router.get('/images/:id', requireAuth, async (
    req: Request,
    res: Response<ApiResponse<{ asset: ImageAsset }>>,
    next: NextFunction,
  ) => {
    try {
      const asset = await getImageAsset(req.params.id, getRequiredCurrentUser(req).id);
      if (!asset) {
        res.status(404).json(apiError('Image asset not found.', 'IMAGE_ASSET_NOT_FOUND'));
        return;
      }

      res.json(apiOk({ asset }));
    } catch (error) {
      next(error);
    }
  });

  router.get('/models', requireAuth, async (
    req: Request,
    res: Response<ApiResponse<{ assets: ModelAsset[] }>>,
    next: NextFunction,
  ) => {
    try {
      res.json(apiOk({ assets: await listModelAssets(getRequiredCurrentUser(req).id) }));
    } catch (error) {
      next(error);
    }
  });

  router.post('/models', requireAuth, async (
    req: Request,
    res: Response<ApiResponse<{ asset: ModelAsset }>>,
    next: NextFunction,
  ) => {
    try {
      const modelTooLargeMessage = `模型文件过大，最大支持 ${options.maxModelMb}MB。建议压缩模型或导出为 GLB 后重新上传。`;
      const uploadedFile = await readMultipartFile(
        req,
        options.maxModelMb * 1024 * 1024 + 1024 * 1024,
        options.maxModelMb,
        modelTooLargeMessage,
      );
      if (uploadedFile.ok === false) {
        res.status(uploadedFile.status).json(apiError(uploadedFile.error.message, uploadedFile.error.code));
        return;
      }

      const fileType = getModelFileType(uploadedFile.value.originalFilename);
      if (!fileType) {
        res.status(400).json(apiError('Only GLB, GLTF, OBJ, DAE, and STL model files are supported. FBX and native SKP files are not supported.', 'MODEL_ASSET_TYPE_INVALID'));
        return;
      }

      if (isUploadOverLimit(uploadedFile.value.content.length, options.maxModelMb)) {
        res.status(413).json(apiError(modelTooLargeMessage, 'MODEL_ASSET_TOO_LARGE'));
        return;
      }

      if (!isAllowedModelMimeType(fileType, uploadedFile.value.mimeType)) {
        res.status(400).json(apiError('Model file MIME type does not match its extension.', 'MODEL_ASSET_MIME_INVALID'));
        return;
      }

      if (!sniffModelFile(fileType, uploadedFile.value.content)) {
        res.status(400).json(apiError('Model file content does not match its extension.', 'MODEL_ASSET_CONTENT_INVALID'));
        return;
      }

      const user = getRequiredCurrentUser(req);
      const storedFile = await fileStorageProvider.uploadModel({
        content: uploadedFile.value.content,
        filename: createStoredFilename(fileType),
        mimeType: uploadedFile.value.mimeType || getDefaultModelMimeType(fileType),
        userId: user.id,
      });

      const asset = await createModelAsset({
        userId: user.id,
        url: storedFile.url,
        filename: storedFile.filename,
        originalFilename: uploadedFile.value.originalFilename,
        fileType,
        mimeType: storedFile.mimeType,
        size: storedFile.size,
      });

      res.status(201).json(apiOk({ asset }));
    } catch (error) {
      next(error);
    }
  });

  router.get('/models/:id', requireAuth, async (
    req: Request,
    res: Response<ApiResponse<{ asset: ModelAsset }>>,
    next: NextFunction,
  ) => {
    try {
      const asset = await getModelAsset(req.params.id, getRequiredCurrentUser(req).id);
      if (!asset) {
        res.status(404).json(apiError('Model asset not found.', 'MODEL_ASSET_NOT_FOUND'));
        return;
      }

      res.json(apiOk({ asset }));
    } catch (error) {
      next(error);
    }
  });

  router.delete('/models/:id', requireAuth, async (
    req: Request,
    res: Response<ApiResponse<{ asset: ModelAsset }>>,
    next: NextFunction,
  ) => {
    try {
      const asset = await deleteModelAsset(req.params.id, getRequiredCurrentUser(req).id);
      if (!asset) {
        res.status(404).json(apiError('Model asset not found.', 'MODEL_ASSET_NOT_FOUND'));
        return;
      }

      await fileStorageProvider.deleteFile(asset.filename);
      res.json(apiOk({ asset }));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
