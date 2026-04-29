import { UploadedImage } from '../types';

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

export function validateImageFile(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return '仅支持 PNG、JPG 或 WEBP 图片。';
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return '图片不能超过 10MB，请压缩后重新上传。';
  }

  return null;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

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

    reader.readAsDataURL(file);
  });
}

export async function createUploadedImage(file: File): Promise<UploadedImage> {
  const dataUrl = await readFileAsDataUrl(file);

  return {
    id: `${Date.now()}-${file.name}`,
    name: file.name,
    type: file.type,
    size: file.size,
    dataUrl,
  };
}
