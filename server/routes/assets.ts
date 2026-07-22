import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { NextFunction, Request, Response, Router } from 'express';
import { getRequiredCurrentUser, requireAuth } from '../auth';
import { createStoredFilename, fileStorageProvider, uploadsDir } from '../fileStorage';
import { ApiResponse, apiError, apiOk } from '../http';
import {
  assertModelConversionAvailable,
  convertModelToGlb,
  getModelConversionConfig,
  inspectModelArchive,
  materializeModelInput,
  ModelArchiveError,
  ModelConversionDisabledError,
  ModelConversionExecutionError,
  ModelConversionUnavailableError,
} from '../modelConversionService';
import {
  buildInitialModelOptimizationMetadata,
  shouldOptimizeModelAsset,
  startModelOptimization,
} from '../modelOptimizationService';
import {
  createImageAsset,
  createModelAsset,
  deleteModelAsset,
  getImageAsset,
  listImageAssets,
  getModelAsset,
  ImageAsset,
  listModelAssets,
  ModelAsset,
  updateModelAsset,
} from '../storage';
import { readOwnedImageAsset } from '../floorPlanSegmentation';
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
        res.status(400).json(apiError('Only GLB, GLTF, OBJ, DAE, STL, and ZIP model resource packages are supported. FBX and native SKP files are not supported.', 'MODEL_ASSET_TYPE_INVALID'));
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

      const archiveInspection = fileType === 'zip'
        ? await inspectModelArchive(uploadedFile.value.content).catch(error => {
          if (error instanceof ModelArchiveError) return error;
          throw error;
        })
        : null;
      if (archiveInspection instanceof ModelArchiveError) {
        res.status(400).json(apiError(archiveInspection.message, 'MODEL_ARCHIVE_INVALID'));
        return;
      }
      if (archiveInspection?.selectionWarning) {
        console.info('Model archive contains multiple model files; selected primary model.', {
          originalFilename: uploadedFile.value.originalFilename,
          mainModelPath: archiveInspection.mainModelRelativePath,
          mainModelFileType: archiveInspection.mainModelFileType,
          modelFileCount: archiveInspection.modelFileCount,
        });
      }

      const user = getRequiredCurrentUser(req);
      const storedFile = await fileStorageProvider.uploadModel({
        content: uploadedFile.value.content,
        filename: createStoredFilename(fileType),
        mimeType: uploadedFile.value.mimeType || getDefaultModelMimeType(fileType),
        userId: user.id,
      });

      const metadata = buildInitialModelOptimizationMetadata({
        url: storedFile.url,
        fileType,
        size: storedFile.size,
      });
      if (archiveInspection) {
        metadata.conversionStatus = 'idle';
        metadata.archiveMainModelPath = archiveInspection.mainModelRelativePath;
        metadata.archiveMainModelFileType = archiveInspection.mainModelFileType;
        metadata.archiveModelFileCount = archiveInspection.modelFileCount;
        metadata.archiveSelectionWarning = archiveInspection.selectionWarning;
      }

      const asset = await createModelAsset({
        userId: user.id,
        url: storedFile.url,
        filename: storedFile.filename,
        originalFilename: uploadedFile.value.originalFilename,
        fileType,
        mimeType: storedFile.mimeType,
        size: storedFile.size,
        metadata,
      });

      try {
        if (shouldOptimizeModelAsset(asset)) {
          startModelOptimization(asset.id);
        }
      } catch (optimizationError) {
        console.error('Model optimization scheduling failed; upload will continue.', {
          assetId: asset.id,
          error: optimizationError,
        });
      }

      res.status(201).json(apiOk({ asset }));
    } catch (error) {
      next(error);
    }
  });

  router.get('/images', requireAuth, async (
    req: Request,
    res: Response<ApiResponse<{ assets: ImageAsset[] }>>,
    next: NextFunction,
  ) => {
    try {
      const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 40;
      const assets = await listImageAssets(getRequiredCurrentUser(req).id, Number.isFinite(limit) ? limit : 40);
      res.json(apiOk({ assets }));
    } catch (error) {
      next(error);
    }
  });

  router.post('/images/:id/remove-background', requireAuth, async (
    req: Request,
    res: Response<ApiResponse<{ asset: ImageAsset }>>,
    next: NextFunction,
  ) => {
    try {
      const user = getRequiredCurrentUser(req);
      const source = await getImageAsset(req.params.id, user.id);
      if (!source) {
        res.status(404).json(apiError('图片素材不存在或无权访问。', 'IMAGE_ASSET_NOT_FOUND'));
        return;
      }
      const output = await removeFlatBackground(await readOwnedImageAsset(source));
      const storedFile = await fileStorageProvider.uploadImage({
        content: output,
        filename: createStoredFilename('png'),
        mimeType: 'image/png',
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

  router.get('/:assetId/download', requireAuth, async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const asset = await getImageAsset(req.params.assetId, getRequiredCurrentUser(req).id);
      if (!asset) {
        res.status(404).json(apiError('Image asset not found.', 'IMAGE_ASSET_NOT_FOUND'));
        return;
      }

      const filename = buildDownloadFilename(asset, req.query.filename);
      res.setHeader('Content-Type', asset.mimeType || 'image/png');
      res.setHeader('Content-Disposition', `attachment; filename="${escapeHeaderFilename(filename)}"`);

      if (asset.url.startsWith('/uploads/')) {
        const filePath = path.resolve(uploadsDir, asset.url.replace(/^\/uploads\//u, ''));
        const relativePath = path.relative(uploadsDir, filePath);
        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
          res.status(400).json(apiError('Invalid image asset path.', 'IMAGE_ASSET_PATH_INVALID'));
          return;
        }
        const buffer = await readFile(filePath);
        res.setHeader('Content-Length', String(buffer.length));
        res.send(buffer);
        return;
      }

      const response = await fetch(asset.url);
      if (!response.ok) {
        res.status(502).json(apiError(`Image asset download failed: HTTP ${response.status}`, 'IMAGE_ASSET_DOWNLOAD_FAILED'));
        return;
      }
      const contentType = response.headers.get('content-type') || asset.mimeType || 'image/png';
      if (!contentType.toLowerCase().startsWith('image/')) {
        res.status(502).json(apiError('Image asset download returned non-image content.', 'IMAGE_ASSET_DOWNLOAD_INVALID_CONTENT'));
        return;
      }
      res.setHeader('Content-Type', contentType);
      const buffer = Buffer.from(await response.arrayBuffer());
      res.setHeader('Content-Length', String(buffer.length));
      res.send(buffer);
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

  router.post('/models/:id/optimize', requireAuth, async (
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

      const processingAsset = await updateOptimizationProcessing(asset);
      startModelOptimization(asset.id, { force: true });
      res.json(apiOk({ asset: processingAsset }));
    } catch (error) {
      next(error);
    }
  });

  router.post('/models/:id/convert', requireAuth, async (
    req: Request,
    res: Response<ApiResponse<{ asset: ModelAsset; message?: string }>>,
    next: NextFunction,
  ) => {
    try {
      console.info('Model conversion request received', {
        assetId: req.params.id,
        userId: getRequiredCurrentUser(req).id,
        modelConversionEnabledRaw: process.env.MODEL_CONVERSION_ENABLED,
      });
      const user = getRequiredCurrentUser(req);
      const asset = await getModelAsset(req.params.id, user.id);
      if (!asset) {
        res.status(404).json(apiError('Model asset not found.', 'MODEL_ASSET_NOT_FOUND'));
        return;
      }

      if (asset.fileType === 'glb' || asset.fileType === 'gltf') {
        res.json(apiOk({ asset, message: '该格式无需转换' }));
        return;
      }

      if (asset.fileType !== 'dae' && asset.fileType !== 'obj' && asset.fileType !== 'zip') {
        res.status(400).json(apiError('仅支持 DAE / OBJ / ZIP 资源包转换为 GLB。', 'MODEL_CONVERSION_TYPE_UNSUPPORTED'));
        return;
      }

      if (getConversionStatus(asset) === 'converting') {
        res.json(apiOk({ asset, message: '模型正在转换中' }));
        return;
      }

      await assertModelConversionAvailable();

      const convertingAsset = await updateModelConversionState(asset, {
        conversionStatus: 'converting',
        conversionStartedAt: new Date().toISOString(),
        conversionError: null,
      });

      let materializedInput: Awaited<ReturnType<typeof materializeModelInput>> | null = null;
      try {
        materializedInput = await materializeModelInput(asset);
        const converted = await convertModelToGlb({
          inputPath: materializedInput.inputPath,
          fileType: materializedInput.fileType,
          workingDirectory: materializedInput.workingDirectory,
        });
        const storedFile = await fileStorageProvider.uploadModel({
          content: converted.content,
          filename: createStoredFilename('glb', `converted-${asset.id}`),
          mimeType: getDefaultModelMimeType('glb'),
          userId: user.id,
        });
        const convertedAt = new Date().toISOString();
        const updated = await updateModelConversionState(convertingAsset, {
          convertedUrl: storedFile.url,
          convertedFormat: 'glb',
          conversionStatus: 'succeeded',
          conversionError: null,
          convertedAt,
          conversionWarning: converted.conversionWarning || materializedInput.archive?.selectionWarning,
          missingImageCount: converted.missingImageCount,
        });

        res.json(apiOk({ asset: updated }));
      } catch (conversionError) {
        const message = conversionError instanceof Error ? conversionError.message : '模型转换失败。';
        console.error('Model conversion failed after Blender execution started.', {
          assetId: asset.id,
          fileType: asset.fileType,
          message,
        });
        await updateModelConversionState(convertingAsset, {
          conversionStatus: 'failed',
          conversionError: message,
        });
        if (conversionError instanceof ModelConversionUnavailableError) {
          res.status(503).json(apiError(message, 'MODEL_CONVERSION_UNAVAILABLE'));
          return;
        }
        res.status(500).json(apiError(message, 'MODEL_CONVERSION_FAILED'));
      } finally {
        await materializedInput?.cleanup();
      }
    } catch (error) {
      if (error instanceof ModelConversionDisabledError) {
        console.warn('Model conversion request rejected because service is disabled.', {
          modelConversionEnabledRaw: process.env.MODEL_CONVERSION_ENABLED,
          modelConversionEnabled: getModelConversionConfig().enabled,
          blenderBin: getModelConversionConfig().blenderBin,
          modelConversionTimeoutMs: getModelConversionConfig().timeoutMs,
        });
        res.status(503).json(apiError(error.message, 'MODEL_CONVERSION_DISABLED'));
        return;
      }

      if (error instanceof ModelConversionUnavailableError) {
        res.status(503).json(apiError(error.message, 'MODEL_CONVERSION_UNAVAILABLE'));
        return;
      }

      if (error instanceof ModelConversionExecutionError) {
        res.status(500).json(apiError(error.message, 'MODEL_CONVERSION_FAILED'));
        return;
      }

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

async function removeFlatBackground(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cornerIndexes = [
    0,
    (info.width - 1) * 4,
    (info.height - 1) * info.width * 4,
    ((info.height - 1) * info.width + info.width - 1) * 4,
  ];
  const background = cornerIndexes.reduce((sum, index) => ({
    r: sum.r + data[index],
    g: sum.g + data[index + 1],
    b: sum.b + data[index + 2],
  }), { r: 0, g: 0, b: 0 });
  background.r /= cornerIndexes.length;
  background.g /= cornerIndexes.length;
  background.b /= cornerIndexes.length;
  for (let index = 0; index < data.length; index += 4) {
    const distance = Math.sqrt(
      (data[index] - background.r) ** 2
      + (data[index + 1] - background.g) ** 2
      + (data[index + 2] - background.b) ** 2,
    );
    const foregroundAlpha = Math.max(0, Math.min(1, (distance - 22) / 48));
    data[index + 3] = Math.round(data[index + 3] * foregroundAlpha);
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

function getConversionStatus(asset: ModelAsset): ModelAsset['conversionStatus'] {
  return asset.conversionStatus || asset.metadata?.conversionStatus || 'idle';
}

function buildDownloadFilename(asset: ImageAsset, requestedFilename: unknown): string {
  const extension = getImageExtension(asset.mimeType || 'image/png');
  if (typeof requestedFilename === 'string' && requestedFilename.trim()) {
    return ensureFilenameExtension(sanitizeDownloadFilename(requestedFilename), extension);
  }
  const basename = path.basename(asset.filename || asset.id).replace(/\.[^.]+$/u, '') || asset.id;
  return `${sanitizeDownloadFilename(basename)}.${extension}`;
}

function ensureFilenameExtension(filename: string, extension: string): string {
  const currentExtension = path.extname(filename).replace(/^\./u, '').toLowerCase();
  if (currentExtension) return filename;
  return `${filename}.${extension}`;
}

function sanitizeDownloadFilename(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/gu, '-')
    .replace(/\s+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 120);
  return sanitized || 'archai-image';
}

function escapeHeaderFilename(value: string): string {
  return value.replace(/["\\]/gu, '_');
}

async function updateModelConversionState(
  asset: ModelAsset,
  patch: Pick<Partial<ModelAsset>, 'convertedUrl' | 'convertedFormat' | 'conversionStatus' | 'conversionError' | 'convertedAt'> & {
    conversionStartedAt?: string;
    conversionWarning?: string | null;
    missingImageCount?: number;
  },
): Promise<ModelAsset> {
  const metadata = {
    ...(asset.metadata || buildInitialModelOptimizationMetadata({
      url: asset.url,
      fileType: asset.fileType,
      size: asset.size,
    })),
    originalUrl: asset.originalUrl || asset.metadata?.originalUrl || asset.url,
    convertedUrl: patch.convertedUrl ?? asset.convertedUrl ?? asset.metadata?.convertedUrl,
    convertedFormat: patch.convertedFormat ?? asset.convertedFormat ?? asset.metadata?.convertedFormat,
    conversionStatus: patch.conversionStatus ?? getConversionStatus(asset),
    conversionError: patch.conversionError === undefined
      ? asset.conversionError ?? asset.metadata?.conversionError
      : patch.conversionError,
    convertedAt: patch.convertedAt ?? asset.convertedAt ?? asset.metadata?.convertedAt,
    conversionStartedAt: patch.conversionStartedAt ?? asset.metadata?.conversionStartedAt,
    conversionWarning: patch.conversionWarning === undefined
      ? asset.metadata?.conversionWarning
      : patch.conversionWarning,
    missingImageCount: patch.missingImageCount ?? asset.metadata?.missingImageCount,
  };

  const updated = await updateModelAsset(asset.id, {
    originalUrl: metadata.originalUrl,
    convertedUrl: metadata.convertedUrl,
    convertedFormat: metadata.convertedFormat,
    conversionStatus: metadata.conversionStatus,
    conversionError: metadata.conversionError,
    convertedAt: metadata.convertedAt,
    metadata,
  });
  return updated || { ...asset, ...patch, metadata };
}

async function updateOptimizationProcessing(asset: ModelAsset): Promise<ModelAsset> {
  const updated = await updateModelAsset(asset.id, {
    metadata: {
      ...(asset.metadata || buildInitialModelOptimizationMetadata({
        url: asset.url,
        fileType: asset.fileType,
        size: asset.size,
      })),
      optimizationStatus: 'processing',
      optimizationStartedAt: new Date().toISOString(),
      optimizationError: undefined,
    },
  });
  return updated || asset;
}
