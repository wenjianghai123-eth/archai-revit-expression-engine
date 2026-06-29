export const IMAGE_UPLOAD_ACCEPT = 'image/png,image/jpeg,image/jpg,image/webp,.png,.jpg,.jpeg,.webp,.jfif';
export const IMAGE_TYPE_INVALID_MESSAGE = '图片格式不支持。请上传 PNG、JPG、JPEG 或 WEBP 图片。';

export const allowedImageMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/x-png',
  'image/pjpeg',
]);

export const allowedImageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.jfif']);

export interface ImageFileValidationOptions {
  feature?: string;
  maxSizeBytes?: number;
}

export function validateImageFileType(file: Pick<File, 'name' | 'type' | 'size'>, options: ImageFileValidationOptions = {}): string | null {
  const mimeType = normalizeImageMimeType(file.type);
  const extension = getImageFileExtension(file.name);
  const rawMimeType = file.type.trim().toLowerCase();
  const isMimeAccepted = Boolean(mimeType && (allowedImageMimeTypes.has(rawMimeType) || allowedImageMimeTypes.has(mimeType)));
  const isExtensionAccepted = allowedImageExtensions.has(extension);
  const shouldUseExtensionFallback = !mimeType || mimeType === 'application/octet-stream';
  const isAccepted = shouldUseExtensionFallback ? isExtensionAccepted : isMimeAccepted;

  if (!isAccepted) {
    logImageTypeInvalid({
      feature: options.feature || 'unknown',
      fileName: file.name,
      fileType: file.type || '',
      extension,
      fileSize: file.size,
      detectedMimeType: mimeType || inferImageMimeTypeFromFilename(file.name),
    });

    const actualType = extension || file.type;
    return actualType
      ? `当前文件类型：${actualType}，仅支持 PNG、JPG、JPEG、WEBP。`
      : IMAGE_TYPE_INVALID_MESSAGE;
  }

  if (options.maxSizeBytes && file.size > options.maxSizeBytes) {
    return `图片不能超过 ${Math.round(options.maxSizeBytes / 1024 / 1024)}MB，请压缩后重新上传。`;
  }
  return null;
}

export function normalizeImageMimeType(value: string): string {
  const mimeType = value.split(';')[0].trim().toLowerCase();
  if (mimeType === 'image/jpg' || mimeType === 'image/pjpeg') return 'image/jpeg';
  if (mimeType === 'image/x-png') return 'image/png';
  return mimeType;
}

export function getImageFileExtension(filename: string): string {
  const match = /(\.[^.]+)$/u.exec(filename.trim());
  return match ? match[1].toLowerCase() : '';
}

export function inferImageMimeTypeFromFilename(filename: string): string {
  const extension = getImageFileExtension(filename);
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg' || extension === '.jfif') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  return '';
}

export function readImageTypeUploadError(error: unknown): string | null {
  const message = error instanceof Error ? error.message : '';
  return message.includes('UPLOAD_IMAGE_TYPE_INVALID')
    || message.includes('Only PNG, JPG, JPEG, and WEBP images are supported')
    || message.includes('图片格式不支持')
    || message.includes('仅支持 PNG、JPG、JPEG、WEBP')
    ? IMAGE_TYPE_INVALID_MESSAGE
    : null;
}

function logImageTypeInvalid(payload: {
  feature: string;
  fileName: string;
  fileType: string;
  extension: string;
  fileSize: number;
  detectedMimeType: string;
}) {
  if (import.meta.env.DEV) {
    console.debug({
      event: 'upload_image_type_invalid',
      ...payload,
    });
  }
}
