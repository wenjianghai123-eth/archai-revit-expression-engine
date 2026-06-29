import path from 'node:path';

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

export function normalizeImageMimeType(value: string): string {
  const mimeType = value.split(';')[0].trim().toLowerCase();
  if (mimeType === 'image/jpg' || mimeType === 'image/pjpeg') return 'image/jpeg';
  if (mimeType === 'image/x-png') return 'image/png';
  return mimeType;
}

export function getImageFileExtension(filename: string): string {
  return path.extname(filename.trim()).toLowerCase();
}

export function inferImageMimeTypeFromFilename(filename: string): string | null {
  const extension = getImageFileExtension(filename);
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg' || extension === '.jfif') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  return null;
}

export function sniffImageMimeType(content: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (
    content.length >= 8
    && content[0] === 0x89
    && content[1] === 0x50
    && content[2] === 0x4e
    && content[3] === 0x47
    && content[4] === 0x0d
    && content[5] === 0x0a
    && content[6] === 0x1a
    && content[7] === 0x0a
  ) return 'image/png';

  if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    content.length >= 12
    && content.subarray(0, 4).toString('ascii') === 'RIFF'
    && content.subarray(8, 12).toString('ascii') === 'WEBP'
  ) return 'image/webp';

  return null;
}

export function describeUnsupportedImageType(filename: string, mimeType: string): string {
  const actualType = getImageFileExtension(filename) || mimeType;
  return actualType
    ? `当前文件类型：${actualType}，仅支持 PNG、JPG、JPEG、WEBP。`
    : IMAGE_TYPE_INVALID_MESSAGE;
}
