import sharp from 'sharp';

import type {
  GenerationQualityIssue,
  GenerationQualityMetrics,
  GenerationQualityReport,
} from '../../src/types';
import { parseImageDataUrl } from './imageMetadata';

const analysisSize = 256;

export interface AnalyzeGenerationQualityInput {
  sourceImageDataUrl: string;
  resultImageDataUrl: string;
  maskImageDataUrl?: string;
  sourceOriginalWidth?: number;
  sourceOriginalHeight?: number;
  expectedWidth?: number;
  expectedHeight?: number;
  preserveStructure?: boolean;
}

interface AnalysisImage {
  width: number;
  height: number;
  rgb: Buffer;
  luminance: Float32Array;
  edges: Uint8Array;
}

export async function analyzeGenerationQuality(input: AnalyzeGenerationQualityInput): Promise<GenerationQualityReport> {
  const [source, result, mask] = await Promise.all([
    prepareAnalysisImage(input.sourceImageDataUrl),
    prepareAnalysisImage(input.resultImageDataUrl),
    input.maskImageDataUrl ? prepareMask(input.maskImageDataUrl) : Promise.resolve(null),
  ]);

  const sourceWidth = input.sourceOriginalWidth || source.width;
  const sourceHeight = input.sourceOriginalHeight || source.height;
  const sourceAspectRatio = sourceWidth / sourceHeight;
  const resultAspectRatio = result.width / result.height;
  const aspectRatioChangeRatio = Math.abs(resultAspectRatio - sourceAspectRatio) / sourceAspectRatio;
  const overallDifference = meanRgbDifference(source.rgb, result.rgb);
  const structureEdgeDifference = edgeDifference(source.edges, result.edges);
  const outsideMaskDifference = mask ? meanRgbDifference(source.rgb, result.rgb, mask) : null;
  const border = analyzeBorders(result.luminance);
  const seamScore = analyzeSeams(result.luminance);
  const watermarkSuspicionScore = analyzeWatermarkSuspicion(result.luminance, result.edges);
  const sharpnessScore = calculateSharpness(result.luminance);
  const exposure = analyzeExposure(result.luminance);

  const metrics: GenerationQualityMetrics = {
    source: { width: sourceWidth, height: sourceHeight, aspectRatio: round(sourceAspectRatio) },
    result: { width: result.width, height: result.height, aspectRatio: round(resultAspectRatio) },
    ...(input.expectedWidth ? { expectedWidth: input.expectedWidth } : {}),
    ...(input.expectedHeight ? { expectedHeight: input.expectedHeight } : {}),
    aspectRatioChangeRatio: round(aspectRatioChangeRatio),
    overallDifference: round(overallDifference),
    structureEdgeDifference: round(structureEdgeDifference),
    ...(outsideMaskDifference === null ? {} : { outsideMaskDifference: round(outsideMaskDifference) }),
    blackBorderRatio: round(border.black),
    whiteBorderRatio: round(border.white),
    seamScore: round(seamScore),
    watermarkSuspicionScore: round(watermarkSuspicionScore),
    sharpnessScore: round(sharpnessScore),
    meanLuminance: round(exposure.mean),
    darkPixelRatio: round(exposure.darkRatio),
    brightPixelRatio: round(exposure.brightRatio),
  };

  const issues = buildIssues(metrics, input.preserveStructure === true);
  const status = issues.some(issue => issue.severity === 'error')
    ? 'failed'
    : issues.some(issue => issue.severity === 'warning')
      ? 'warning'
      : 'passed';
  const score = Math.max(0, 100 - issues.reduce((sum, issue) => sum + (issue.severity === 'error' ? 24 : issue.severity === 'warning' ? 10 : 2), 0));

  return {
    version: 1,
    status,
    score,
    checkedAt: new Date().toISOString(),
    issues,
    warnings: issues.filter(issue => issue.severity !== 'info').map(issue => issue.message),
    metrics,
  };
}

export function createUnavailableQualityReport(error: unknown): GenerationQualityReport {
  void error;
  const issue: GenerationQualityIssue = {
    code: 'QUALITY_CHECK_UNAVAILABLE',
    severity: 'warning',
    title: '质量检查暂不可用',
    message: '结果已正常保留，但自动质量检查未完成，请人工核对后再用于交付。',
  };
  return {
    version: 1,
    status: 'warning',
    score: 80,
    checkedAt: new Date().toISOString(),
    issues: [issue],
    warnings: [issue.message],
    metrics: {
      source: { width: 0, height: 0, aspectRatio: 0 },
      result: { width: 0, height: 0, aspectRatio: 0 },
      aspectRatioChangeRatio: 0,
      overallDifference: 0,
      structureEdgeDifference: 0,
      blackBorderRatio: 0,
      whiteBorderRatio: 0,
      seamScore: 0,
      watermarkSuspicionScore: 0,
      sharpnessScore: 0,
      meanLuminance: 0,
      darkPixelRatio: 0,
      brightPixelRatio: 0,
    },
  };
}

function buildIssues(metrics: GenerationQualityMetrics, preserveStructure: boolean): GenerationQualityIssue[] {
  const issues: GenerationQualityIssue[] = [];
  const add = (issue: GenerationQualityIssue) => issues.push(issue);

  if (metrics.aspectRatioChangeRatio > 0.05) {
    add(issue('ASPECT_RATIO_CHANGED', 'error', '画幅发生变化', '结果图画幅与原图明显不一致，请检查模型是否改变了构图或画布。', metrics.aspectRatioChangeRatio, 0.05));
  } else if (metrics.aspectRatioChangeRatio > 0.02) {
    add(issue('ASPECT_RATIO_DRIFT', 'warning', '画幅轻微偏移', '结果图画幅与原图存在轻微偏差，交付前建议人工确认。', metrics.aspectRatioChangeRatio, 0.02));
  }

  if (metrics.expectedWidth && metrics.expectedHeight) {
    const widthRatio = metrics.result.width / metrics.expectedWidth;
    const heightRatio = metrics.result.height / metrics.expectedHeight;
    const minimumRatio = Math.min(widthRatio, heightRatio);
    if (minimumRatio < 0.75) {
      add(issue('OUTPUT_SIZE_TOO_SMALL', 'error', '输出尺寸不足', `结果尺寸为 ${metrics.result.width}×${metrics.result.height}，低于本次要求的 ${metrics.expectedWidth}×${metrics.expectedHeight}。`, minimumRatio, 0.75));
    } else if (minimumRatio < 0.9) {
      add(issue('OUTPUT_SIZE_BELOW_TARGET', 'warning', '输出尺寸略低', `结果尺寸为 ${metrics.result.width}×${metrics.result.height}，未完全达到 ${metrics.expectedWidth}×${metrics.expectedHeight}。`, minimumRatio, 0.9));
    }
  } else if (Math.min(metrics.result.width, metrics.result.height) < 512) {
    add(issue('OUTPUT_RESOLUTION_LOW', 'warning', '图像尺寸偏低', '结果图短边低于 512px，放大或汇报输出时可能不够清晰。', Math.min(metrics.result.width, metrics.result.height), 512));
  }

  const structureWarningThreshold = preserveStructure ? 0.42 : 0.55;
  const structureErrorThreshold = preserveStructure ? 0.62 : 0.72;
  if (metrics.structureEdgeDifference > structureErrorThreshold) {
    add(issue('STRUCTURE_EDGE_CHANGED', 'error', '主要结构边缘变化明显', '原图与结果图的主要边缘差异较大，墙体、轮廓、家具或构图可能发生了非预期变化。', metrics.structureEdgeDifference, structureErrorThreshold));
  } else if (metrics.structureEdgeDifference > structureWarningThreshold) {
    add(issue('STRUCTURE_EDGE_DRIFT', 'warning', '结构边缘存在偏移', '检测到较多边缘变化，请重点核对墙体、门窗、家具轮廓和相机位置。', metrics.structureEdgeDifference, structureWarningThreshold));
  }

  if (metrics.overallDifference > 0.62) {
    add(issue('OVERALL_DIFFERENCE_HIGH', 'warning', '整体差异较大', '结果与原图整体差异较大，请确认是否符合本次修改范围。', metrics.overallDifference, 0.62));
  } else if (metrics.overallDifference < 0.015) {
    add(issue('OVERALL_DIFFERENCE_TOO_LOW', 'info', '整体变化很小', '结果与原图非常接近，可能未充分执行本次生成指令。', metrics.overallDifference, 0.015));
  }

  if (metrics.outsideMaskDifference !== undefined) {
    if (metrics.outsideMaskDifference > 0.24) {
      add(issue('MASK_OUTSIDE_CHANGED', 'error', '遮罩外变化过大', '遮罩外区域发生明显变化，不符合局部修改的保护预期。', metrics.outsideMaskDifference, 0.24));
    } else if (metrics.outsideMaskDifference > 0.1) {
      add(issue('MASK_OUTSIDE_DRIFT', 'warning', '遮罩外存在变化', '遮罩外区域存在可见差异，请在保留结果前核对。', metrics.outsideMaskDifference, 0.1));
    }
  }

  if (metrics.blackBorderRatio > 0.5) {
    add(issue('BLACK_BORDER_DETECTED', 'error', '检测到异常黑边', '结果图边缘存在大面积黑色区域，可能是画布、缩放或拼贴异常。', metrics.blackBorderRatio, 0.5));
  } else if (metrics.whiteBorderRatio > 0.65) {
    add(issue('WHITE_BORDER_DETECTED', 'warning', '检测到异常白边', '结果图边缘存在大面积白色区域，请确认是否为预期画布。', metrics.whiteBorderRatio, 0.65));
  }

  if (metrics.seamScore > 0.42) {
    add(issue('POSSIBLE_COMPOSITE_SEAM', 'warning', '疑似拼贴接缝', '图像中检测到突出的横向或纵向接缝，可能存在拼贴或局部合成痕迹。', metrics.seamScore, 0.42));
  }

  if (metrics.watermarkSuspicionScore > 0.72) {
    add(issue('POSSIBLE_TEXT_OR_WATERMARK', 'warning', '疑似异常文字或水印', '图像边角检测到高密度高对比细节，可能出现异常文字、水印或标记，请人工确认。', metrics.watermarkSuspicionScore, 0.72));
  }

  if (metrics.sharpnessScore < 5) {
    add(issue('IMAGE_BLURRY', 'warning', '图像可能偏糊', '结果图边缘清晰度偏低，可能存在低清或过度平滑。', metrics.sharpnessScore, 5));
  }
  if (metrics.meanLuminance < 38 || metrics.darkPixelRatio > 0.7) {
    add(issue('IMAGE_TOO_DARK', 'warning', '图像可能过暗', '结果图整体亮度偏低或暗部占比过高。', metrics.meanLuminance, 38));
  }
  if (metrics.meanLuminance > 222 || metrics.brightPixelRatio > 0.72) {
    add(issue('IMAGE_OVEREXPOSED', 'warning', '图像可能过曝', '结果图整体亮度偏高或高光占比过大。', metrics.meanLuminance, 222));
  }

  return issues;
}

function issue(code: string, severity: GenerationQualityIssue['severity'], title: string, message: string, metric: number, threshold: number): GenerationQualityIssue {
  return { code, severity, title, message, metric: round(metric), threshold };
}

async function prepareAnalysisImage(dataUrl: string): Promise<AnalysisImage> {
  const parsed = parseImageDataUrl(dataUrl);
  const metadata = await sharp(parsed.content).metadata();
  if (!metadata.width || !metadata.height) throw new Error('Unable to read image dimensions for quality check.');
  const rgb = await sharp(parsed.content)
    .rotate()
    .resize(analysisSize, analysisSize, { fit: 'fill' })
    .flatten({ background: '#ffffff' })
    .removeAlpha()
    .raw()
    .toBuffer();
  const luminance = rgbToLuminance(rgb);
  return { width: metadata.width, height: metadata.height, rgb, luminance, edges: calculateEdges(luminance) };
}

async function prepareMask(dataUrl: string): Promise<Uint8Array> {
  const parsed = parseImageDataUrl(dataUrl);
  const buffer = await sharp(parsed.content)
    .rotate()
    .resize(analysisSize, analysisSize, { fit: 'fill', kernel: sharp.kernel.nearest })
    .greyscale()
    .raw()
    .toBuffer();
  const outside = new Uint8Array(buffer.length);
  for (let index = 0; index < buffer.length; index += 1) outside[index] = buffer[index] < 128 ? 1 : 0;
  return outside;
}

function rgbToLuminance(rgb: Buffer): Float32Array {
  const luminance = new Float32Array(rgb.length / 3);
  for (let pixel = 0; pixel < luminance.length; pixel += 1) {
    const offset = pixel * 3;
    luminance[pixel] = rgb[offset] * 0.2126 + rgb[offset + 1] * 0.7152 + rgb[offset + 2] * 0.0722;
  }
  return luminance;
}

function calculateEdges(luminance: Float32Array): Uint8Array {
  const edges = new Uint8Array(luminance.length);
  for (let y = 1; y < analysisSize - 1; y += 1) {
    for (let x = 1; x < analysisSize - 1; x += 1) {
      const index = y * analysisSize + x;
      const horizontal = Math.abs(luminance[index + 1] - luminance[index - 1]);
      const vertical = Math.abs(luminance[index + analysisSize] - luminance[index - analysisSize]);
      edges[index] = horizontal + vertical > 44 ? 1 : 0;
    }
  }
  return edges;
}

function meanRgbDifference(left: Buffer, right: Buffer, includePixels?: Uint8Array): number {
  let difference = 0;
  let samples = 0;
  for (let offset = 0; offset < left.length; offset += 3) {
    const pixel = offset / 3;
    if (includePixels && includePixels[pixel] !== 1) continue;
    difference += Math.abs(left[offset] - right[offset]);
    difference += Math.abs(left[offset + 1] - right[offset + 1]);
    difference += Math.abs(left[offset + 2] - right[offset + 2]);
    samples += 3;
  }
  return samples > 0 ? difference / samples / 255 : 0;
}

function edgeDifference(left: Uint8Array, right: Uint8Array): number {
  let union = 0;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] || right[index]) union += 1;
    if (left[index] !== right[index]) mismatch += 1;
  }
  return union > 0 ? mismatch / union : 0;
}

function analyzeBorders(luminance: Float32Array): { black: number; white: number } {
  const borderWidth = Math.max(2, Math.round(analysisSize * 0.025));
  let black = 0;
  let white = 0;
  let samples = 0;
  for (let y = 0; y < analysisSize; y += 1) {
    for (let x = 0; x < analysisSize; x += 1) {
      if (x >= borderWidth && x < analysisSize - borderWidth && y >= borderWidth && y < analysisSize - borderWidth) continue;
      const value = luminance[y * analysisSize + x];
      if (value < 12) black += 1;
      if (value > 246) white += 1;
      samples += 1;
    }
  }
  return { black: black / samples, white: white / samples };
}

function analyzeSeams(luminance: Float32Array): number {
  let strongest = 0;
  for (let x = 4; x < analysisSize - 4; x += 1) {
    let sum = 0;
    for (let y = 0; y < analysisSize; y += 1) sum += Math.abs(luminance[y * analysisSize + x] - luminance[y * analysisSize + x - 1]);
    strongest = Math.max(strongest, sum / analysisSize / 255);
  }
  for (let y = 4; y < analysisSize - 4; y += 1) {
    let sum = 0;
    for (let x = 0; x < analysisSize; x += 1) sum += Math.abs(luminance[y * analysisSize + x] - luminance[(y - 1) * analysisSize + x]);
    strongest = Math.max(strongest, sum / analysisSize / 255);
  }
  return strongest;
}

function analyzeWatermarkSuspicion(luminance: Float32Array, edges: Uint8Array): number {
  const zones = [
    { x0: 0, y0: 0, x1: 0.28, y1: 0.2 },
    { x0: 0.72, y0: 0, x1: 1, y1: 0.2 },
    { x0: 0, y0: 0.8, x1: 0.32, y1: 1 },
    { x0: 0.68, y0: 0.8, x1: 1, y1: 1 },
  ];
  let strongest = 0;
  for (const zone of zones) {
    let edgeCount = 0;
    let highContrast = 0;
    let samples = 0;
    for (let y = Math.floor(zone.y0 * analysisSize); y < Math.ceil(zone.y1 * analysisSize); y += 1) {
      for (let x = Math.floor(zone.x0 * analysisSize); x < Math.ceil(zone.x1 * analysisSize); x += 1) {
        const index = y * analysisSize + x;
        edgeCount += edges[index];
        if (luminance[index] < 35 || luminance[index] > 220) highContrast += 1;
        samples += 1;
      }
    }
    const edgeDensity = edgeCount / Math.max(1, samples);
    const contrastDensity = highContrast / Math.max(1, samples);
    strongest = Math.max(strongest, Math.min(1, edgeDensity * 3 + contrastDensity * 0.35));
  }
  return strongest;
}

function calculateSharpness(luminance: Float32Array): number {
  let sum = 0;
  let sumSquared = 0;
  let samples = 0;
  for (let y = 1; y < analysisSize - 1; y += 1) {
    for (let x = 1; x < analysisSize - 1; x += 1) {
      const index = y * analysisSize + x;
      const laplacian = 4 * luminance[index]
        - luminance[index - 1]
        - luminance[index + 1]
        - luminance[index - analysisSize]
        - luminance[index + analysisSize];
      sum += laplacian;
      sumSquared += laplacian * laplacian;
      samples += 1;
    }
  }
  const mean = sum / samples;
  return Math.sqrt(Math.max(0, sumSquared / samples - mean * mean));
}

function analyzeExposure(luminance: Float32Array): { mean: number; darkRatio: number; brightRatio: number } {
  let sum = 0;
  let dark = 0;
  let bright = 0;
  for (const value of luminance) {
    sum += value;
    if (value < 28) dark += 1;
    if (value > 238) bright += 1;
  }
  return { mean: sum / luminance.length, darkRatio: dark / luminance.length, brightRatio: bright / luminance.length };
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
