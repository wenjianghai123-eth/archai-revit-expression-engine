import path from 'node:path';
import Busboy from 'busboy';
import { Request } from 'express';
import { ApiError } from './http';
import { ModelAsset } from './storage';

export async function readMultipartImage(
  req: Request,
  maxImageMb: number,
): Promise<
  | { ok: true; value: { content: Buffer; mimeType: string; originalFilename: string } }
  | { ok: false; status: number; error: ApiError }
> {
  const parsed = await readMultipartFile(req, maxImageMb * 1024 * 1024 + 1024 * 1024, maxImageMb);
  if (parsed.ok === false) return parsed;

  if (parsed.value.content.length > maxImageMb * 1024 * 1024) {
    return {
      ok: false,
      status: 413,
      error: { message: `Image file cannot exceed ${maxImageMb}MB.`, code: 'UPLOAD_FILE_TOO_LARGE' },
    };
  }

  const sniffedMimeType = sniffImageMimeType(parsed.value.content);
  if (!sniffedMimeType || sniffedMimeType !== parsed.value.mimeType) {
    return {
      ok: false,
      status: 400,
      error: { message: 'Only PNG, JPG, JPEG, and WEBP images are supported.', code: 'UPLOAD_IMAGE_TYPE_INVALID' },
    };
  }

  return {
    ok: true,
    value: {
      content: parsed.value.content,
      mimeType: sniffedMimeType,
      originalFilename: parsed.value.originalFilename,
    },
  };
}

export async function readMultipartFile(
  req: Request,
  maxBytes: number,
  displayMaxMb: number,
): Promise<
  | { ok: true; value: { content: Buffer; mimeType: string; originalFilename: string } }
  | { ok: false; status: number; error: ApiError }
> {
  const contentType = req.headers['content-type'];
  if (typeof contentType !== 'string' || !contentType.includes('multipart/form-data')) {
    return {
      ok: false,
      status: 415,
      error: { message: 'Upload must use multipart/form-data.', code: 'UPLOAD_CONTENT_TYPE_INVALID' },
    };
  }

  return new Promise((resolve, reject) => {
    let busboy: ReturnType<typeof Busboy>;
    try {
      busboy = Busboy({
        headers: req.headers,
        defParamCharset: 'utf8',
        limits: {
          fileSize: maxBytes,
          files: 1,
          fields: 10,
          parts: 12,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      resolve({
        ok: false,
        status: 400,
        error: {
          message: message.toLowerCase().includes('boundary')
            ? 'Upload boundary is missing.'
            : 'Upload form data is malformed.',
          code: message.toLowerCase().includes('boundary') ? 'UPLOAD_BOUNDARY_MISSING' : 'UPLOAD_MULTIPART_INVALID',
        },
      });
      return;
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let originalFilename = '';
    let mimeType = '';
    let fileSeen = false;
    let parseError: { status: number; error: ApiError } | null = null;
    let resolved = false;

    const failOnce = (status: number, error: ApiError) => {
      if (!parseError) {
        parseError = { status, error };
      }
    };

    busboy.on('file', (fieldName, file, info) => {
      if (fieldName !== 'file') {
        file.resume();
        return;
      }

      if (fileSeen) {
        failOnce(400, { message: 'Only one upload file is supported.', code: 'UPLOAD_TOO_MANY_FILES' });
        file.resume();
        return;
      }

      fileSeen = true;
      originalFilename = sanitizeUploadFilename(info.filename || '');
      mimeType = normalizeUploadMimeType(info.mimeType || 'application/octet-stream');

      if (!originalFilename) {
        failOnce(400, { message: 'No file was found in the upload.', code: 'UPLOAD_FILE_MISSING' });
      }

      file.on('limit', () => {
        failOnce(413, {
          message: `Upload request cannot exceed ${displayMaxMb}MB.`,
          code: 'UPLOAD_TOO_LARGE',
        });
      });

      file.on('error', () => {
        failOnce(400, { message: 'Upload form data is malformed.', code: 'UPLOAD_MULTIPART_INVALID' });
      });

      file.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > maxBytes) {
          failOnce(413, {
            message: `Upload request cannot exceed ${displayMaxMb}MB.`,
            code: 'UPLOAD_TOO_LARGE',
          });
          return;
        }

        chunks.push(chunk);
      });
    });

    busboy.on('filesLimit', () => {
      failOnce(400, { message: 'Only one upload file is supported.', code: 'UPLOAD_TOO_MANY_FILES' });
    });

    busboy.on('partsLimit', () => {
      failOnce(400, { message: 'Upload form data has too many parts.', code: 'UPLOAD_TOO_MANY_PARTS' });
    });

    busboy.on('error', () => {
      if (resolved) return;
      resolved = true;
      resolve({
        ok: false,
        status: 400,
        error: { message: 'Upload form data is malformed.', code: 'UPLOAD_MULTIPART_INVALID' },
      });
    });

    busboy.on('finish', () => {
      if (resolved) return;
      resolved = true;

      if (parseError) {
        resolve({ ok: false, status: parseError.status, error: parseError.error });
        return;
      }

      if (!fileSeen || chunks.length === 0) {
        resolve({
          ok: false,
          status: 400,
          error: { message: 'No file was found in the upload.', code: 'UPLOAD_FILE_MISSING' },
        });
        return;
      }

      resolve({
        ok: true,
        value: {
          content: Buffer.concat(chunks),
          mimeType,
          originalFilename,
        },
      });
    });

    req.on('error', error => {
      if (!resolved) {
        resolved = true;
        reject(error);
      }
    });

    req.pipe(busboy);
  });
}

export function getImageExtension(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

export function getModelFileType(filename: string): ModelAsset['fileType'] | null {
  const extension = filename.split('.').pop()?.toLowerCase();
  if (extension === 'glb' || extension === 'gltf' || extension === 'obj') {
    return extension;
  }

  return null;
}

export function getDefaultModelMimeType(fileType: ModelAsset['fileType']): string {
  if (fileType === 'glb') return 'model/gltf-binary';
  if (fileType === 'gltf') return 'model/gltf+json';
  return 'model/obj';
}

export function isAllowedModelMimeType(fileType: ModelAsset['fileType'], mimeType: string): boolean {
  const normalizedMimeType = normalizeUploadMimeType(mimeType || getDefaultModelMimeType(fileType));
  const commonBinaryMimeTypes = new Set(['application/octet-stream', 'binary/octet-stream']);

  if (fileType === 'glb') {
    return normalizedMimeType === 'model/gltf-binary' || commonBinaryMimeTypes.has(normalizedMimeType);
  }

  if (fileType === 'gltf') {
    return ['model/gltf+json', 'application/json', 'text/json', 'text/plain'].includes(normalizedMimeType)
      || commonBinaryMimeTypes.has(normalizedMimeType);
  }

  return ['model/obj', 'text/plain', 'application/wavefront-obj'].includes(normalizedMimeType)
    || commonBinaryMimeTypes.has(normalizedMimeType);
}

export function sniffModelFile(fileType: ModelAsset['fileType'], content: Buffer): boolean {
  if (content.length === 0) return false;

  if (fileType === 'glb') {
    return content.length >= 4 && content.slice(0, 4).toString('ascii') === 'glTF';
  }

  const preview = content.subarray(0, Math.min(content.length, 4096));
  if (preview.includes(0)) return false;

  const trimmedPreview = preview.toString('utf8').trimStart();
  if (fileType === 'gltf') {
    return trimmedPreview.startsWith('{');
  }

  return trimmedPreview.length > 0;
}

function normalizeUploadMimeType(mimeType: string): string {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized === 'image/jpg') return 'image/jpeg';
  return normalized;
}

function sanitizeUploadFilename(filename: string): string {
  const basename = path.basename(filename.replace(/\\/g, '/')).trim();
  if (!basename) return '';
  return repairLatin1DecodedUtf8(basename);
}

function repairLatin1DecodedUtf8(value: string): string {
  if (!/[ÃÂÐÑ][\u0080-\u00ff]|[\u00c2-\u00f4][\u0080-\u00bf]/u.test(value)) {
    return value;
  }

  try {
    return Buffer.from(value, 'latin1').toString('utf8');
  } catch {
    return value;
  }
}

function sniffImageMimeType(content: Buffer): string | null {
  if (
    content.length >= 8 &&
    content[0] === 0x89 &&
    content[1] === 0x50 &&
    content[2] === 0x4e &&
    content[3] === 0x47 &&
    content[4] === 0x0d &&
    content[5] === 0x0a &&
    content[6] === 0x1a &&
    content[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    content.length >= 12 &&
    content.slice(0, 4).toString('ascii') === 'RIFF' &&
    content.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}
