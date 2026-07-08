export interface ImageCompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  minSizeBytes?: number;
}

const defaultOptions: Required<ImageCompressionOptions> = {
  maxWidth: 2560,
  maxHeight: 2560,
  quality: 0.85,
  minSizeBytes: 2 * 1024 * 1024,
};

export async function compressImageBeforeUpload(file: File, options: ImageCompressionOptions = {}): Promise<File> {
  const settings = { ...defaultOptions, ...options };
  if (!file.type.startsWith('image/') || file.size < settings.minSizeBytes) return file;
  if (/png$/iu.test(file.type)) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, settings.maxWidth / bitmap.width, settings.maxHeight / bitmap.height);
    if (scale >= 1) {
      bitmap.close();
      return file;
    }

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return file;
    }

    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const outputType = file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
    const blob = await canvasToBlob(canvas, outputType, settings.quality);
    if (!blob || blob.size >= file.size) return file;

    const extension = outputType === 'image/webp' ? 'webp' : 'jpg';
    const compressed = new File([blob], replaceExtension(file.name, extension), {
      type: outputType,
      lastModified: file.lastModified,
    });

    if (import.meta.env.DEV) {
      console.debug('[upload] image compressed', {
        originalSize: file.size,
        compressedSize: compressed.size,
        width,
        height,
      });
    }
    return compressed;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.debug('[upload] image compression skipped', {
        filename: file.name,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    return file;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

function replaceExtension(filename: string, extension: string): string {
  const base = filename.replace(/\.[^.]+$/u, '') || 'image';
  return `${base}.${extension}`;
}
