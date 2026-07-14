import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { uploadsDir } from './fileStorage';
import type { ImageAsset } from './storage';

export interface SegmentedRegion {
  polygon: [number, number][];
  areaRatio: number;
  confidence: number;
  mask: Buffer;
}

export interface FloorPlanSegmentationResult {
  width: number;
  height: number;
  regions: SegmentedRegion[];
  overlay: Buffer;
}

export interface RenderedFloorPlanMasks {
  masks: Buffer[];
  overlay: Buffer;
}

const COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export async function readOwnedImageAsset(asset: ImageAsset): Promise<Buffer> {
  if (asset.url.startsWith('/uploads/')) {
    const relative = decodeURIComponent(asset.url.replace(/^\/uploads\//u, ''));
    const filePath = path.resolve(uploadsDir, relative);
    const relativeToRoot = path.relative(uploadsDir, filePath);
    if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) throw new SegmentationError('图片存储路径无效。', 'FLOOR_PLAN_ASSET_PATH_INVALID');
    return readFile(filePath);
  }
  let url: URL;
  try { url = new URL(asset.url); } catch { throw new SegmentationError('图片资产地址无效。', 'FLOOR_PLAN_ASSET_URL_INVALID'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new SegmentationError('图片资产协议不受支持。', 'FLOOR_PLAN_ASSET_URL_INVALID');
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new SegmentationError(`读取平面图失败（HTTP ${response.status}）。`, 'FLOOR_PLAN_ASSET_DOWNLOAD_FAILED');
  return Buffer.from(await response.arrayBuffer());
}

export async function segmentFloorPlan(input: Buffer): Promise<FloorPlanSegmentationResult> {
  let metadata: sharp.Metadata;
  try { metadata = await sharp(input).metadata(); } catch { throw new SegmentationError('无法解析图片，请上传 PNG、JPG 或 WebP 平面图。', 'FLOOR_PLAN_IMAGE_INVALID'); }
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  if (!width || !height) throw new SegmentationError('无法读取图片尺寸。', 'FLOOR_PLAN_IMAGE_INVALID');

  const scale = Math.min(1, 1400 / Math.max(width, height));
  const workWidth = Math.max(1, Math.round(width * scale));
  const workHeight = Math.max(1, Math.round(height * scale));
  const { data } = await sharp(input).resize(workWidth, workHeight, { fit: 'fill' }).greyscale().normalize().raw().toBuffer({ resolveWithObject: true });
  const dark = adaptiveDarkMask(data, workWidth, workHeight);
  const radius = Math.max(1, Math.round(Math.min(workWidth, workHeight) / 500));
  const walls = erode(dilate(dark, workWidth, workHeight, radius + 1), workWidth, workHeight, radius);
  const components = findInteriorComponents(walls, workWidth, workHeight);
  const minArea = Math.max(80, Math.round(workWidth * workHeight * 0.0015));
  const maxArea = workWidth * workHeight * 0.8;
  const candidates = components
    .filter(component => !component.touchesBorder && component.pixels.length >= minArea && component.pixels.length <= maxArea)
    .map(component => ({ ...component, polygon: tracePolygon(component.pixelSet, workWidth, workHeight) }))
    .filter(component => component.polygon.length >= 3)
    .sort((a, b) => a.minY - b.minY || a.minX - b.minX)
    .slice(0, 80);

  if (!candidates.length) throw new SegmentationError('未识别到封闭地面区域。请确认墙线闭合、图纸清晰且留有白色房间内部。', 'FLOOR_PLAN_NO_REGIONS');

  const regions: SegmentedRegion[] = [];
  for (const candidate of candidates) {
    const normalized = simplifyPolygon(candidate.polygon, 1.5).map(([x, y]) => [clamp01(x / workWidth), clamp01(y / workHeight)] as [number, number]);
    const polygonPoints = normalized.map(([x, y]) => `${(x * width).toFixed(2)},${(y * height).toFixed(2)}`).join(' ');
    const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/><polygon points="${polygonPoints}" fill="white"/></svg>`;
    const mask = await sharp(Buffer.from(maskSvg)).png().toBuffer();
    const areaRatio = candidate.pixels.length / (workWidth * workHeight);
    regions.push({ polygon: normalized, areaRatio, confidence: Math.min(0.95, 0.68 + Math.min(0.22, areaRatio * 2)), mask });
  }

  const shapes = regions.map((region, index) => {
    const points = region.polygon.map(([x, y]) => `${(x * width).toFixed(2)},${(y * height).toFixed(2)}`).join(' ');
    return `<polygon points="${points}" fill="${COLORS[index % COLORS.length]}" fill-opacity="0.34" stroke="${COLORS[index % COLORS.length]}" stroke-width="${Math.max(2, width / 700)}"/>`;
  }).join('');
  const overlay = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="transparent"/>${shapes}</svg>`)).png().toBuffer();
  return { width, height, regions, overlay };
}

export async function renderFloorPlanRegionMasks(
  width: number,
  height: number,
  regions: Array<{ polygon: [number, number][] }>,
): Promise<RenderedFloorPlanMasks> {
  const masks = await Promise.all(regions.map(region => renderFloorPlanRegionMask(width, height, region.polygon)));
  const shapes = regions.map((region, index) => {
    const points = region.polygon.map(([x, y]) => `${(clamp01(x) * width).toFixed(2)},${(clamp01(y) * height).toFixed(2)}`).join(' ');
    return `<polygon points="${points}" fill="${COLORS[index % COLORS.length]}" fill-opacity="0.34" stroke="${COLORS[index % COLORS.length]}" stroke-width="${Math.max(2, width / 700)}"/>`;
  }).join('');
  const overlay = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="transparent"/>${shapes}</svg>`)).png().toBuffer();
  return { masks, overlay };
}

export class SegmentationError extends Error {
  constructor(message: string, readonly code: string) { super(message); }
}

export function renderFloorPlanRegionMask(width: number, height: number, polygon: [number, number][]): Promise<Buffer> {
  const points = polygon.map(([x, y]) => `${(clamp01(x) * width).toFixed(2)},${(clamp01(y) * height).toFixed(2)}`).join(' ');
  const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/><polygon points="${points}" fill="white"/></svg>`;
  return sharp(Buffer.from(maskSvg)).png().toBuffer();
}

function adaptiveDarkMask(source: Buffer, width: number, height: number): Uint8Array {
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let row = 0;
    for (let x = 0; x < width; x += 1) {
      row += source[y * width + x];
      integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1] + row;
    }
  }
  const radius = Math.max(8, Math.round(Math.min(width, height) / 45));
  const result = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const x0 = Math.max(0, x - radius); const x1 = Math.min(width - 1, x + radius);
    const y0 = Math.max(0, y - radius); const y1 = Math.min(height - 1, y + radius);
    const sum = integral[(y1 + 1) * (width + 1) + x1 + 1] - integral[y0 * (width + 1) + x1 + 1] - integral[(y1 + 1) * (width + 1) + x0] + integral[y0 * (width + 1) + x0];
    const mean = sum / ((x1 - x0 + 1) * (y1 - y0 + 1));
    result[y * width + x] = source[y * width + x] < Math.min(190, mean - 14) ? 1 : 0;
  }
  return result;
}

function dilate(source: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const output = new Uint8Array(source.length);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    let value = 0;
    for (let dy = -radius; dy <= radius && !value; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
      const nx = x + dx; const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && source[ny * width + nx]) { value = 1; break; }
    }
    output[y * width + x] = value;
  }
  return output;
}

function erode(source: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const output = new Uint8Array(source.length);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    let value = 1;
    for (let dy = -radius; dy <= radius && value; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
      const nx = x + dx; const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height || !source[ny * width + nx]) { value = 0; break; }
    }
    output[y * width + x] = value;
  }
  return output;
}

function findInteriorComponents(walls: Uint8Array, width: number, height: number) {
  const seen = new Uint8Array(walls.length); const result: Array<{ pixels: number[]; pixelSet: Set<number>; minX: number; minY: number; touchesBorder: boolean }> = [];
  for (let start = 0; start < walls.length; start += 1) {
    if (walls[start] || seen[start]) continue;
    const queue = [start]; seen[start] = 1; const pixels: number[] = []; let minX = width; let minY = height; let touchesBorder = false;
    for (let head = 0; head < queue.length; head += 1) {
      const index = queue[head]; pixels.push(index); const x = index % width; const y = Math.floor(index / width);
      minX = Math.min(minX, x); minY = Math.min(minY, y); if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) { const nx = x + dx; const ny = y + dy; if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue; const next = ny * width + nx; if (!walls[next] && !seen[next]) { seen[next] = 1; queue.push(next); } }
    }
    result.push({ pixels, pixelSet: new Set(pixels), minX, minY, touchesBorder });
  }
  return result;
}

function tracePolygon(pixels: Set<number>, width: number, height: number): [number, number][] {
  const edges = new Map<string, [number, number][]>();
  const add = (a: [number, number], b: [number, number]) => { const key = `${a[0]},${a[1]}`; const list = edges.get(key) || []; list.push(b); edges.set(key, list); };
  for (const index of pixels) { const x = index % width; const y = Math.floor(index / width); if (y === 0 || !pixels.has(index - width)) add([x, y], [x + 1, y]); if (x === width - 1 || !pixels.has(index + 1)) add([x + 1, y], [x + 1, y + 1]); if (y === height - 1 || !pixels.has(index + width)) add([x + 1, y + 1], [x, y + 1]); if (x === 0 || !pixels.has(index - 1)) add([x, y + 1], [x, y]); }
  const startKey = [...edges.keys()].sort((a, b) => { const [ax, ay] = a.split(',').map(Number); const [bx, by] = b.split(',').map(Number); return ay - by || ax - bx; })[0];
  if (!startKey) return [];
  const start = startKey.split(',').map(Number) as [number, number]; const polygon: [number, number][] = [start]; let current = start;
  for (let guard = 0; guard < edges.size + 5; guard += 1) { const next = edges.get(`${current[0]},${current[1]}`)?.shift(); if (!next) break; if (next[0] === start[0] && next[1] === start[1]) break; polygon.push(next); current = next; }
  return polygon;
}

function simplifyPolygon(points: [number, number][], epsilon: number): [number, number][] {
  if (points.length < 4) return points;
  let maxDistance = 0; let index = 0;
  for (let i = 1; i < points.length - 1; i += 1) { const distance = pointLineDistance(points[i], points[0], points[points.length - 1]); if (distance > maxDistance) { maxDistance = distance; index = i; } }
  if (maxDistance <= epsilon) return [points[0], points[points.length - 1]];
  return [...simplifyPolygon(points.slice(0, index + 1), epsilon).slice(0, -1), ...simplifyPolygon(points.slice(index), epsilon)];
}

function pointLineDistance(point: [number, number], start: [number, number], end: [number, number]): number {
  const dx = end[0] - start[0]; const dy = end[1] - start[1]; if (!dx && !dy) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  return Math.abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]) / Math.hypot(dx, dy);
}

function clamp01(value: number) { return Math.max(0, Math.min(1, value)); }
