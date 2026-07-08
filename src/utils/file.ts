import { UploadedImage } from '../types';
import {
  inferImageMimeTypeFromFilename,
  normalizeImageMimeType,
  validateImageFileType,
} from './imageValidation';

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

export function validateImageFile(file: File, feature?: string): string | null {
  return validateImageFileType(file, { feature, maxSizeBytes: MAX_IMAGE_SIZE_BYTES });
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const normalizedMimeType = normalizeImageMimeType(file.type) || inferImageMimeTypeFromFilename(file.name);
    const readableFile = normalizedMimeType && normalizedMimeType !== file.type
      ? new Blob([file], { type: normalizedMimeType })
      : file;

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('无法读取图片文件。'));
    };

    reader.onerror = () => {
      reject(new Error('图片读取失败，请重试。'));
    };

    reader.readAsDataURL(readableFile);
  });
}

function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };

    image.onerror = () => {
      reject(new Error('无法读取图片尺寸。'));
    };

    image.src = dataUrl;
  });
}

export async function createUploadedImage(file: File): Promise<UploadedImage> {
  const previewUrl = URL.createObjectURL(file);
  const dataUrl = await readFileAsDataUrl(file);
  let dimensions: { width: number; height: number } | null = null;

  try {
    dimensions = await getImageDimensions(dataUrl);
  } catch {
    dimensions = null;
  }

  return {
    id: `${Date.now()}-${file.name}`,
    name: file.name,
    type: normalizeImageMimeType(file.type) || inferImageMimeTypeFromFilename(file.name) || file.type,
    size: file.size,
    dataUrl,
    previewUrl,
    uploadStatus: 'local-preview',
    width: dimensions?.width,
    height: dimensions?.height,
  };
}

export function createLocalPreviewImage(file: File): UploadedImage {
  const normalizedType = normalizeImageMimeType(file.type) || inferImageMimeTypeFromFilename(file.name) || file.type;
  const previewUrl = URL.createObjectURL(file);
  return {
    id: `${Date.now()}-${file.name}`,
    name: file.name,
    type: normalizedType,
    size: file.size,
    dataUrl: previewUrl,
    previewUrl,
    uploadStatus: 'local-preview',
    uploadProgress: 0,
  };
}

export async function hydrateUploadedImageDataUrl(image: UploadedImage, file: File): Promise<UploadedImage> {
  const dataUrl = await readFileAsDataUrl(file);
  let dimensions: { width: number; height: number } | null = null;

  try {
    dimensions = await getImageDimensions(dataUrl);
  } catch {
    dimensions = null;
  }

  return {
    ...image,
    dataUrl,
    width: dimensions?.width ?? image.width,
    height: dimensions?.height ?? image.height,
  };
}

export function revokeUploadedImagePreview(image: UploadedImage | null | undefined): void {
  if (image?.previewUrl?.startsWith('blob:')) {
    URL.revokeObjectURL(image.previewUrl);
  }
}
