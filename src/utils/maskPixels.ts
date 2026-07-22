/**
 * Reads a committed mask once and reports whether it contains selected pixels.
 * This is intentionally asynchronous and must not be called during React render.
 */
export async function maskHasVisiblePixels(maskUrl: string): Promise<boolean> {
  if (!maskUrl) return false;

  const image = await loadMaskImage(maskUrl);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || canvas.width === 0 || canvas.height === 0) return false;

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] > 10 || pixels[index + 1] > 10 || pixels[index + 2] > 10) return true;
  }
  return false;
}

function loadMaskImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('蒙版图片无法读取。'));
    image.src = src;
  });
}
