import crypto from 'node:crypto';
import { GenerateImageInput, GenerateImageOutput, ImageGenerationProvider } from './types';

const providerName = 'grsai-nano-banana';
const defaultBaseUrl = 'https://grsai.dakka.com.cn';
const defaultModel = 'nano-banana-fast';
const defaultAspectRatio = '4:3';
const defaultImageSize = '1K';
const pollIntervalMs = Number(process.env.GRSAI_POLL_INTERVAL_MS || 3000);
const pollTimeoutMs = Number(process.env.GRSAI_POLL_TIMEOUT_MS || 300000);

interface GrsaiProviderOptions {
  apiKey: string;
}

interface GrsaiTaskResult {
  status: string;
  failureReason?: string;
  error?: string;
  content?: string;
  timedOut?: boolean;
}

interface GrsaiResultImage {
  url?: string;
  content?: string;
}

interface GrsaiResultData {
  id?: string;
  status: string;
  progress?: number;
  results?: GrsaiResultImage[];
  failure_reason?: string;
  error?: string;
  content?: string;
}

export function createGrsaiNanoBananaProvider(options: GrsaiProviderOptions): ImageGenerationProvider {
  const baseUrl = normalizeBaseUrl(process.env.GRSAI_BASE_URL || defaultBaseUrl);
  const model = process.env.GRSAI_MODEL || defaultModel;
  const aspectRatio = process.env.GRSAI_ASPECT_RATIO || defaultAspectRatio;
  const imageSize = process.env.GRSAI_IMAGE_SIZE || defaultImageSize;

  return {
    name: providerName,
    async generateImage(input: GenerateImageInput): Promise<GenerateImageOutput> {
      if (input.mode !== 'floorplan' && input.mode !== 'style-render') {
        throw new Error('Grsai Nano Banana provider 当前仅用于平面转三维和风格渲染。');
      }

      const warnings: string[] = [];
      const finalPrompt = input.mode === 'style-render'
        ? buildNanoBananaStyleRenderPrompt(input)
        : buildNanoBananaFloorplanPrompt(input, warnings);

      const taskId = await createTask({
        apiKey: options.apiKey,
        baseUrl,
        body: {
          model,
          prompt: finalPrompt,
          aspectRatio,
          imageSize,
          urls: [input.inputImageDataUrl, input.materialImageDataUrl].filter(isNonEmptyString),
          webHook: '-1',
          shutProgress: true,
        },
      });
      console.info('[grsai] task created', { taskId, model, baseUrl });

      const result = await pollTaskResult({
        apiKey: options.apiKey,
        baseUrl,
        taskId,
      });

      const imageUrl = result.results?.[0]?.url;
      if (!imageUrl) {
        throw new Error('Nano Banana 返回成功，但未提供结果图片 URL。');
      }
      console.info('[grsai] task succeeded', { taskId, imageUrl });

      const resultContent = result.results?.[0]?.content || result.content;
      if (resultContent) {
        warnings.push(`Grsai 返回文本：${resultContent}`);
        console.debug(`Grsai Nano Banana result content: ${resultContent}`);
      }

      let imageDataUrl = imageUrl;
      try {
        imageDataUrl = await remoteImageToDataUrl(imageUrl);
      } catch (error) {
        warnings.push(
          `结果图片下载转码失败，已使用 Grsai 临时 URL 直接展示：${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }

      console.info('[grsai] return imageDataUrl', {
        taskId,
        prefix: imageDataUrl.slice(0, 32),
        length: imageDataUrl.length,
      });

      return {
        id: result.id || taskId || crypto.randomUUID(),
        provider: providerName,
        imageDataUrl,
        createdAt: new Date().toISOString(),
        warnings,
      };
    },
  };
}

export function buildNanoBananaStyleRenderPrompt(input: GenerateImageInput): string {
  const config = input.config || {};

  const style = typeof config.style === 'string' && config.style.trim()
    ? config.style.trim()
    : '现代建筑可视化';

  const lighting = typeof config.lighting === 'string' && config.lighting.trim()
    ? config.lighting.trim()
    : '自然均匀日光';

  const materialStrength = typeof config.materialStrength === 'number'
    ? config.materialStrength
    : 0.8;

  const userPrompt = input.prompt && input.prompt.trim()
    ? input.prompt.trim()
    : '无额外要求。';

  return [
    '你是一名专业建筑与室内空间可视化设计助手。',
    '',
    '任务：',
    '请基于用户上传的参考图，生成指定风格的高质量渲染效果图。',
    '',
    '严格要求：',
    '1. 保持参考图中的主体对象、空间构图、视角关系、比例关系和主要轮廓，不要随意改变结构。',
    '2. 根据所选风格重塑材质、色彩、光影、软装和氛围。',
    '3. 如果参考图是建筑空间，请保持空间功能逻辑合理。',
    '4. 如果参考图是室内空间，请合理优化家具、墙地面材质、灯光和装饰细节。',
    '5. 输出应为高质量设计表达图，真实、干净、专业。',
    '6. 不要生成文字、水印、尺寸标注、边框或额外 UI 元素。',
    '',
    '控制项：',
    `- 目标风格：${style}`,
    `- 光照氛围：${lighting}`,
    `- 风格/材质影响强度：${materialStrength}`,
    '',
    '用户提示词：',
    userPrompt,
  ].join('\n');
}

export function buildNanoBananaFloorplanPrompt(input: GenerateImageInput, warnings: string[]): string {
  const config = input.config || {};

  const style = typeof config.style === 'string' && config.style.trim()
    ? config.style.trim()
    : '现代建筑彩平';

  const lighting = typeof config.lighting === 'string' && config.lighting.trim()
    ? config.lighting.trim()
    : '自然均匀日光';

  const materialStrength = typeof config.materialStrength === 'number'
    ? config.materialStrength
    : 0.8;

  if (!input.materialImageDataUrl) {
    warnings.push('未上传参考材质图，本次根据默认现代建筑材质语义进行生成。');
  }

  const userExtraPrompt = input.prompt && input.prompt.trim()
    ? input.prompt.trim()
    : '无额外要求。';

  return [
    '你是一名专业建筑可视化设计助手。',
    '',
    '任务：',
    '请将输入的黑白建筑平面图转换为“彩色三维效果平面图”。',
    '',
    '严格要求：',
    '1. 输出必须是俯视或轻微斜俯视视角的三维彩平、轴测彩平或 cutaway 风格表现图。',
    '2. 不要生成街景透视图，不要生成建筑外立面图，不要生成纯室内单视角效果图。',
    '3. 必须尽量保留原始平面图中的墙体关系、房间边界、门窗位置、交通流线与主要空间分区。',
    '4. 自动识别常见功能空间，如客厅、卧室、厨房、卫生间、走廊等，并以合理尺度补充家具、材质、地面铺装、柜体、灯光与少量软装。',
    '5. 生成结果应成为可阅读、可汇报的建筑三维彩平，而不是随意改造原始户型。',
    '6. 如果提供了参考材质图，请优先参考其材质风格、色调、纹理语言和整体氛围，并将其自然应用于地面、墙面、柜体与局部家具。',
    '7. 如果没有提供参考材质图，请默认采用现代建筑室内彩平表达：浅木、暖白墙面、浅灰石材、玻璃、少量金属点缀。',
    '8. 保持整体画面专业、干净、明亮、真实，具有建筑设计汇报用图的品质。',
    '9. 输出图像中不要出现文字、水印、尺寸标注、标题栏、边框或额外 UI 元素。',
    '',
    '补充控制项：',
    `- 风格倾向：${style}`,
    `- 光照氛围：${lighting}`,
    `- 材质参考强度：${materialStrength}`,
    '',
    '用户附加要求：',
    userExtraPrompt,
  ].join('\n');
}

async function createTask(input: {
  apiKey: string;
  baseUrl: string;
  body: Record<string, unknown>;
}): Promise<string> {
  const responseBody = await postJson(`${input.baseUrl}/v1/draw/nano-banana`, input.apiKey, input.body);
  const taskId = extractTaskId(responseBody);
  if (!taskId) {
    throw new Error('Grsai Nano Banana 创建任务成功但未返回任务 ID。');
  }

  return taskId;
}

async function pollTaskResult(input: {
  apiKey: string;
  baseUrl: string;
  taskId: string;
}): Promise<GrsaiResultData & GrsaiTaskResult> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < pollTimeoutMs) {
    const responseBody = await postJson(`${input.baseUrl}/v1/draw/result`, input.apiKey, { task_id: input.taskId });
    const result = extractGrsaiResultData(responseBody);
    console.info('[grsai] poll result', {
      taskId: input.taskId,
      status: result.status,
      progress: result.progress,
    });

    if (result.status === 'succeeded') {
      return result;
    }

    if (result.status === 'failed') {
      throw new Error(formatGrsaiFailure(result));
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(`Nano Banana 生成超时：已等待 ${Math.round(pollTimeoutMs / 1000)} 秒，但任务仍未完成。`);
}

async function postJson(url: string, apiKey: string, body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  const responseBody = parseJson(responseText);

  if (!response.ok) {
    throw new Error(`Grsai API 请求失败（HTTP ${response.status}）：${extractErrorMessage(responseBody) || responseText}`);
  }

  return responseBody;
}

async function remoteImageToDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:image/')) {
    return url;
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`下载 Grsai 生成图片失败（HTTP ${response.status}）。`);
  }

  const contentType = response.headers.get('content-type') || 'image/png';
  const arrayBuffer = await response.arrayBuffer();
  const base64Data = Buffer.from(arrayBuffer).toString('base64');

  return `data:${contentType};base64,${base64Data}`;
}

function extractTaskId(value: unknown): string | null {
  const data = getNestedRecord(value, 'data');
  const source = data || (isRecord(value) ? value : null);

  return readString(source, 'id')
    || readString(source, 'taskId')
    || readString(source, 'task_id')
    || readString(source, 'drawId')
    || readString(source, 'jobId');
}

function extractGrsaiResultData(payload: unknown): GrsaiResultData & GrsaiTaskResult {
  const data = getNestedRecord(payload, 'data');
  const source = data || (isRecord(payload) ? payload : null);
  const rawStatus = readString(source, 'status') || readString(source, 'state') || readString(source, 'taskStatus') || '';
  const status = normalizeStatus(rawStatus);
  const failureReason = readString(source, 'failure_reason')
    || readString(source, 'failReason')
    || readString(source, 'failureReason');
  const error = readString(source, 'error')
    || readString(source, 'message')
    || readString(source, 'msg');
  const content = readString(source, 'content');
  const progress = readNumber(source, 'progress');
  const results = extractResults(source);

  return {
    id: readString(source, 'id') || undefined,
    status,
    progress,
    results,
    failure_reason: failureReason || '',
    failureReason,
    error: error || undefined,
    content,
  };
}

function formatGrsaiFailure(result: GrsaiTaskResult): string {
  if (result.timedOut) {
    return '生成超时，请稍后重试。';
  }

  const failureReason = result.failureReason?.trim();
  const error = result.error?.trim();

  if (failureReason === 'output_moderation') {
    return joinMessages([
      '生成结果未通过平台内容安全审核，请调整附加要求后重试。',
      error,
    ]);
  }

  if (failureReason === 'input_moderation') {
    return joinMessages([
      '输入图片或附加要求未通过平台内容安全审核，请检查上传内容后重试。',
      error,
    ]);
  }

  return joinMessages([failureReason, error]) || 'Grsai Nano Banana 任务生成失败。';
}

function joinMessages(messages: Array<string | undefined>): string {
  return messages
    .map(message => message?.trim())
    .filter(isNonEmptyString)
    .join('；');
}

function extractResults(source: Record<string, unknown> | null): GrsaiResultImage[] | undefined {
  if (!source) {
    return undefined;
  }

  const results = source.results;
  if (Array.isArray(results)) {
    return results
      .filter(isRecord)
      .map(result => ({
        url: readString(result, 'url') || readString(result, 'imageUrl') || undefined,
        content: readString(result, 'content') || undefined,
      }));
  }

  const outputImageUrls = source.outputImageUrls;
  if (Array.isArray(outputImageUrls)) {
    const firstUrl = outputImageUrls.find(item => typeof item === 'string' && item.trim().length > 0);
    if (typeof firstUrl === 'string') {
      return [{ url: firstUrl }];
    }
  }

  const url = readString(source, 'url') || readString(source, 'imageUrl');
  return url ? [{ url, content: readString(source, 'content') || undefined }] : undefined;
}

function normalizeStatus(status: string): string {
  const normalized = status.toLowerCase();
  if (['succeeded', 'success', 'completed', 'done'].includes(normalized)) {
    return 'succeeded';
  }

  if (['failed', 'fail', 'error', 'canceled', 'cancelled'].includes(normalized)) {
    return 'failed';
  }

  return normalized || 'pending';
}

function parseJson(value: string): unknown {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function extractErrorMessage(value: unknown): string | null {
  const data = getNestedRecord(value, 'data');
  const source = data || (isRecord(value) ? value : null);

  return readString(source, 'error') || readString(source, 'message') || readString(source, 'msg');
}

function getNestedRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }

  const nested = value[key];
  return isRecord(nested) ? nested : null;
}

function readString(source: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = source?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readNumber(source: Record<string, unknown> | null | undefined, key: string): number | undefined {
  const value = source?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/u, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}
