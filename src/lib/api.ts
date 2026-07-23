import { buildApiUrl, isRelativeApiPath } from './apiBaseUrl';
import { parseApiResponse, readApiErrorMessage } from './apiResponse';
import { getAccessToken } from './authToken';
import { isAbortError } from '../utils/apiConnectionStatus';
import { logAssetUploadSuccess } from '../utils/assetUrl';
import { compressImageBeforeUpload } from '../utils/imageCompression';
import type {
  AssetVersion,
  EditMessage,
  EditSession,
  FloorPlanRegion,
  FloorPlanRegionMaterial,
  FloorPlanRegionSet,
  SaveFloorPlanRegionMaterialInput,
} from '../types';

const fileUploadCache = new WeakMap<File, Promise<ImageAsset>>();

const BACKEND_UNAVAILABLE_MESSAGE = '后端服务暂不可用，请稍后重试或检查 VITE_API_BASE_URL 是否指向已部署的 Express 后端。';
const SAFE_INTERNAL_SERVICE_ERROR_MESSAGE = '当前服务暂时不可用，请稍后重试。';
const INTERNAL_ERROR_CODES = new Set([
  'SUPABASE_SCHEMA_MISMATCH',
  'PGRST205',
  'INTERNAL_SERVICE_ERROR',
]);
const INTERNAL_ERROR_PATTERNS = [
  /SUPABASE_SCHEMA_MISMATCH/iu,
  /PGRST205/iu,
  /public\.project_design_workflows/iu,
  /schema cache/iu,
  /SUPABASE_SETUP\.md/iu,
  /service_role/iu,
];

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member';
  status: 'active' | 'disabled';
  createdAt: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member';
  status: 'active' | 'disabled';
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string;
  status: 'active' | 'archived';
  coverImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface ProjectInput {
  name: string;
  description?: string;
  status?: Project['status'];
  coverImageUrl?: string | null;
}

export type GenerationMode = 'floorplan' | 'style-render' | 'inpaint' | 'model-render' | 'design-variants' | 'material-replace' | 'plan-colorize' | 'panorama-roam-render';
export type GenerationJobStep =
  | 'floorplan_to_3d'
  | 'style_render'
  | 'local_inpainting'
  | 'model_snapshot_render'
  | 'design_variants'
  | 'material_replace'
  | 'plan_colorize'
  | 'panorama_quick_render'
  | 'object_insert'
  | 'free_reference_image'
  | 'image_polish';
export type PromptTemplateFeature =
  | 'floorplan'
  | 'style-render'
  | 'design-variants'
  | 'material-replace'
  | 'object-insert'
  | 'free-reference-image'
  | 'image-polish';

export interface GenerationRecord {
  id: string;
  userId: string;
  projectId: string;
  jobId?: string | null;
  mode: GenerationMode;
  step?: GenerationJobStep | null;
  prompt: string;
  inputImageUrl?: string | null;
  inputImageDataPreview?: string | null;
  outputImageUrl?: string | null;
  outputImageDataPreview?: string | null;
  provider: string;
  status: 'succeeded' | 'failed';
  createdAt: string;
  updatedAt: string;
  results?: GenerationResult[];
  sourceModelAssetId?: string | null;
  snapshotAssetId?: string | null;
  modelSnapshotMetadata?: Record<string, unknown> | null;
}

export interface GenerationResult {
  id: string;
  userId: string;
  projectId: string;
  jobId: string;
  assetId: string;
  imageUrl: string;
  isSelected: boolean;
  isFavorite: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface GenerationRecordInput {
  mode: GenerationRecord['mode'];
  step?: GenerationRecord['step'];
  prompt: string;
  inputImageUrl?: string | null;
  inputImageDataPreview?: string | null;
  outputImageUrl?: string | null;
  outputImageDataPreview?: string | null;
  provider: string;
  status?: GenerationRecord['status'];
  sourceModelAssetId?: string | null;
  snapshotAssetId?: string | null;
  modelSnapshotMetadata?: Record<string, unknown> | null;
}

export interface ImageAsset {
  id: string;
  userId: string;
  url: string;
  publicUrl?: string;
  thumbnailUrl?: string;
  path?: string;
  storageProvider?: 'local' | 'supabase';
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface LoginResponse {
  user: AuthUser;
  accessToken: string;
  tokenType: 'Bearer';
}

export interface PromptTemplateInputPreview {
  label: string;
  url: string;
  assetId?: string;
}

export interface PromptTemplateRecord {
  id: string;
  name: string;
  description: string;
  generationStep: GenerationJobStep;
  feature: PromptTemplateFeature;
  featureName: string;
  prompt: string;
  negativePrompt?: string;
  config: Record<string, unknown>;
  inputAssetIds: string[];
  referenceAssetIds: string[];
  materialAssetIds: string[];
  sourceAssetId?: string | null;
  placementPreviewAssetId?: string | null;
  outputAssetId?: string | null;
  outputUrl: string;
  previewAssetId?: string | null;
  tags: string[];
  isPublic: boolean;
  createdBy: string;
  createdFromGenerationRecordId?: string | null;
  createdFromJobId?: string | null;
  inputPreviews: PromptTemplateInputPreview[];
  outputPreview?: Record<string, unknown>;
  parameterSummary?: Record<string, unknown>;
  templateSource?: string | null;
  coverAssetId?: string | null;
  coverUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PromptTemplateCreateInput = Omit<PromptTemplateRecord, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>;

export interface ModelAssetRecord {
  id: string;
  userId: string;
  url: string;
  originalUrl?: string;
  convertedUrl?: string;
  convertedFormat?: 'glb' | 'gltf';
  conversionStatus?: 'idle' | 'converting' | 'succeeded' | 'failed';
  conversionError?: string | null;
  convertedAt?: string;
  previewUrl?: string;
  optimizedUrl?: string;
  thumbnailUrl?: string;
  filename: string;
  originalFilename: string;
  fileType: 'glb' | 'gltf' | 'obj' | 'dae' | 'stl' | 'zip';
  format?: 'glb' | 'gltf' | 'obj' | 'dae' | 'stl' | 'zip';
  mimeType: string;
  size: number;
  metadata?: {
    originalUrl: string;
    convertedUrl?: string;
    convertedFormat?: 'glb' | 'gltf';
    conversionStatus?: 'idle' | 'converting' | 'succeeded' | 'failed';
    conversionError?: string | null;
    convertedAt?: string;
    conversionStartedAt?: string;
    previewUrl?: string;
    optimizedUrl?: string;
    thumbnailUrl?: string;
    format: 'glb' | 'gltf' | 'obj' | 'dae' | 'stl' | 'zip';
    archiveMainModelPath?: string;
    archiveMainModelFileType?: 'glb' | 'gltf' | 'dae' | 'obj';
    archiveModelFileCount?: number;
    archiveSelectionWarning?: string;
    conversionWarning?: string | null;
    missingImageCount?: number;
    originalFileSize: number;
    optimizedFileSize?: number;
    optimizationStatus: 'pending' | 'processing' | 'succeeded' | 'failed' | 'skipped';
    optimizationStartedAt?: string;
    optimizationError?: string;
    faceCount?: number;
    optimizedFaceCount?: number;
    createdAt?: string;
    completedAt?: string;
  };
  createdAt: string;
  deletedAt?: string | null;
}

export interface GenerationJob {
  id: string;
  userId: string;
  projectId: string;
  mode: GenerationMode;
  step?: GenerationJobStep | null;
  prompt: string;
  config: Record<string, unknown>;
  inputAssetIds: string[];
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timeout';
  progress: number;
  provider: string;
  outputAssetId: string | null;
  outputAssetIds?: string[];
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  diagnostics?: GenerationJobDiagnostics;
  results?: GenerationResult[];
  creditCost: number;
  creditRefunded: boolean;
  failureReason: string | null;
  idempotencyKey: string | null;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  heartbeatAt: string | null;
  executionTimeoutAt: string | null;
  providerStartedAt: string | null;
  providerFinishedAt: string | null;
  providerDurationMs: number | null;
  lastErrorCode: string | null;
  lastErrorCategory: string | null;
  lastErrorRetryable: boolean | null;
}

export interface GenerationJobDiagnostics {
  phase?: 'queued' | 'prepare-input' | 'provider-request' | 'postprocess' | 'save-result' | 'succeeded' | 'failed' | 'cancelled' | 'timeout';
  timing?: {
    jobCreatedAt?: string;
    jobStartedAt?: string;
    prepareInputStartedAt?: string;
    prepareInputFinishedAt?: string;
    providerRequestStartedAt?: string;
    providerRequestFinishedAt?: string;
    postprocessStartedAt?: string;
    postprocessFinishedAt?: string;
    saveResultStartedAt?: string;
    saveResultFinishedAt?: string;
    jobFinishedAt?: string;
    providerMs?: number;
    prepareInputDurationMs?: number;
    providerDurationMs?: number;
    postprocessDurationMs?: number;
    saveResultDurationMs?: number;
    totalDurationMs?: number;
  };
  provider?: {
    name?: string;
    model?: string;
    httpStatus?: number;
    statusCode?: number;
    retryCount?: number;
    fallbackProvider?: string;
    fallbackReason?: string;
    providerError?: string;
    providerStatus?: string;
    userMessage?: string;
    rawSnippet?: string;
    providerMs?: number;
    providerModel?: string;
  };
  images?: {
    qualityMode?: 'draft' | 'fast' | 'balanced' | 'high';
    inputImages?: number;
    referenceImages?: number;
    referenceCount?: number;
    inputBytesBefore?: number;
    inputBytesAfter?: number;
    inputWidthBefore?: number;
    inputHeightBefore?: number;
    inputWidthAfter?: number;
    inputHeightAfter?: number;
    referenceBytesBefore?: number;
    referenceBytesAfter?: number;
    payloadBytesApprox?: number;
  };
}

export interface GenerationJobInput {
  projectId: string;
  mode: GenerationJob['mode'];
  step?: GenerationJob['step'];
  provider: 'grsai-banana2' | 'apiyi-nano-banana2-edit';
  prompt: string;
  generationStep?: GenerationJob['step'];
  featureName?: string;
  config: Record<string, unknown>;
  inputAssetIds: string[];
  idempotencyKey?: string;
}

export interface AiProviderOption {
  value: 'grsai-banana2' | 'apiyi-nano-banana2-edit';
  label: string;
  enabled: boolean;
  missingConfig: string[];
}

export interface AiProvidersConfig {
  defaultProvider: AiProviderOption['value'];
  providers: AiProviderOption[];
}

export interface ShareLink {
  id: string;
  projectId: string;
  token: string;
  permission: 'view';
  expiresAt: string;
  createdAt: string;
  revokedAt?: string | null;
}

export interface PublicSharePayload {
  link: {
    permission: ShareLink['permission'];
    expiresAt: string;
    createdAt: string;
  };
  project: {
    name: string;
    description: string;
  };
  generations: PublicShareGeneration[];
}

export interface PublicShareGeneration {
  id: string;
  mode: GenerationRecord['mode'];
  step?: GenerationRecord['step'];
  prompt: string;
  inputImageUrl: string | null;
  inputImageDataPreview: string | null;
  outputImageUrl: string | null;
  outputImageDataPreview: string | null;
  createdAt: string;
  results: PublicShareGenerationResult[];
}

export interface PublicShareGenerationResult {
  id: string;
  imageUrl: string;
  isSelected: boolean;
  isFavorite: boolean;
  createdAt: string;
}

export interface CreditBalance {
  userId: string;
  balance: number;
  updatedAt: string;
}

type CreditBalanceResponseData = {
  data?: {
    balance?: unknown;
    creditBalance?: unknown;
  };
  balance?: number | CreditBalance;
  creditBalance?: CreditBalance;
  credits?: unknown;
};

type UploadImageAssetOptions = {
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
};

type ApiRequestOptions = Pick<RequestInit, 'signal'>;

export interface RefineMaskInput {
  imageAssetId?: string;
  image?: string;
  roughMask: string;
  maskMode: 'smart' | 'precise';
  targetObject?: string;
  targetType?: string;
  previousMask?: string;
  positivePoints?: Array<{ x: number; y: number }>;
  negativePoints?: Array<{ x: number; y: number }>;
  positiveStrokes?: string[];
  negativeStrokes?: string[];
}

export interface RefineMaskResult {
  refinedMask: string;
  detectedObject: string;
  confidence: number;
  method: string;
}

export async function refineImageMask(
  input: RefineMaskInput,
  options: ApiRequestOptions = {},
): Promise<RefineMaskResult> {
  return request<RefineMaskResult>('/api/image/refine-mask', {
    method: 'POST',
    body: JSON.stringify(input),
    signal: options.signal,
  });
}

export interface CreditTransaction {
  id: string;
  userId: string;
  type: 'admin_grant' | 'generate_charge' | 'generate_refund' | 'grant' | 'debit' | 'refund';
  amount: number;
  balanceAfter: number;
  reason: string;
  referenceType?: 'generation_job' | 'system' | null;
  referenceId?: string | null;
  createdAt: string;
}

export interface AdminDashboard {
  stats: {
    userCount: number;
    projectCount: number;
    generationJobCount: number;
    succeededJobCount: number;
    failedJobCount: number;
    totalCreditsConsumed: number;
    queuedJobCount: number;
    runningJobCount: number;
    retryingJobCount: number;
    expiredLeaseJobCount: number;
    leasedJobCount: number;
    averageProviderDurationMs: number;
  };
  recentJobs: GenerationJob[];
  recentErrorJobs: GenerationJob[];
}

export interface PromptPolishInput {
  rawText: string;
  generationStep: GenerationJobStep | string;
  context?: Record<string, unknown>;
}

export interface PromptPolishResult {
  polishedPrompt: string;
  negativePrompt?: string;
  notes?: string[];
}

export async function updateGenerationResult(
  id: string,
  input: Partial<Pick<GenerationResult, 'isSelected' | 'isFavorite' | 'metadata'>>,
): Promise<GenerationResult> {
  const response = await request<{ result: GenerationResult }>(`/api/generation-results/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return response.result;
}

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiErrorResponse };

interface ApiErrorResponse {
  message: string;
  code?: string;
  provider?: string;
  statusCode?: number;
  rawSnippet?: string;
}

export async function polishPrompt(input: PromptPolishInput): Promise<PromptPolishResult> {
  return request<PromptPolishResult>('/api/prompts/polish', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getCurrentUser(accessToken?: string): Promise<AuthUser> {
  const response = await request<{ user: AuthUser }>('/api/me', {}, accessToken);
  return response.user;
}

export async function loginWithPassword(input: { email: string; password: string }): Promise<LoginResponse> {
  return request<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  }, null);
}

export async function getCreditBalance(): Promise<CreditBalance> {
  const response = await request<CreditBalanceResponseData>('/api/credits', { cache: 'no-store' });
  return normalizeCreditBalanceResponse(response);
}

function normalizeCreditBalanceResponse(response: CreditBalanceResponseData): CreditBalance {
  const creditBalance = readCreditBalanceObject(response.data?.creditBalance)
    || readCreditBalanceObject(response.creditBalance)
    || readCreditBalanceObject(response.data?.balance)
    || readCreditBalanceObject(response.balance);
  const balance = normalizeCreditBalanceNumber(response);
  return {
    userId: creditBalance?.userId || '',
    balance,
    updatedAt: creditBalance?.updatedAt || new Date().toISOString(),
  };
}

export function normalizeCreditBalanceNumber(response: unknown): number {
  const record = isRecord(response) ? response : {};
  const data = isRecord(record.data) ? record.data : {};
  const dataCreditBalance = isRecord(data.creditBalance) ? data.creditBalance : {};
  const value = data.balance
    ?? dataCreditBalance.balance
    ?? record.balance
    ?? record.credits
    ?? 0;

  if (typeof value === 'number') return value;
  if (isRecord(value) && typeof value.balance === 'number') return value.balance;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readCreditBalanceObject(value: unknown): CreditBalance | null {
  if (!isRecord(value) || typeof value.balance !== 'number') return null;
  return {
    userId: typeof value.userId === 'string' ? value.userId : '',
    balance: value.balance,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
  };
}

export async function listCreditTransactions(): Promise<CreditTransaction[]> {
  const response = await request<{ transactions: CreditTransaction[] }>('/api/billing/transactions');
  return response.transactions;
}

export async function getAdminDashboard(): Promise<AdminDashboard> {
  const response = await request<{ dashboard: AdminDashboard }>('/api/admin/dashboard');
  return response.dashboard;
}

export async function grantUserCredits(input: { userId: string; amount: number; reason?: string }): Promise<{ balance: CreditBalance; transaction: CreditTransaction }> {
  return request<{ balance: CreditBalance; transaction: CreditTransaction }>('/api/admin/credits/grant', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function listAdminUsers(): Promise<UserProfile[]> {
  const response = await request<{ users: UserProfile[] }>('/api/admin/users');
  return response.users;
}

export async function createAdminUser(input: {
  name: string;
  email: string;
  password: string;
  role: UserProfile['role'];
  initialCredits: number;
}): Promise<{ user: UserProfile; balance: CreditBalance }> {
  return request<{ user: UserProfile; balance: CreditBalance }>('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateAdminUser(id: string, input: Partial<Pick<UserProfile, 'name' | 'email' | 'role' | 'status'>>): Promise<UserProfile> {
  const response = await request<{ user: UserProfile }>(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return response.user;
}

export async function resetAdminUserPassword(id: string, password: string): Promise<void> {
  await request<{ ok: true }>(`/api/admin/users/${encodeURIComponent(id)}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function grantAdminUserCredits(id: string, input: { amount: number; reason?: string }): Promise<{ balance: CreditBalance; transaction: CreditTransaction }> {
  return request<{ balance: CreditBalance; transaction: CreditTransaction }>(`/api/admin/users/${encodeURIComponent(id)}/credits`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function listProjects(): Promise<Project[]> {
  const response = await request<{ projects: Project[] }>('/api/projects');
  return response.projects;
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const response = await request<{ project: Project }>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return response.project;
}

export async function createAutoProject(): Promise<Project> {
  const response = await request<{ project: Project }>('/api/projects/auto', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return response.project;
}

export async function getProject(id: string): Promise<Project> {
  const response = await request<{ project: Project }>(`/api/projects/${encodeURIComponent(id)}`);
  return response.project;
}

export async function updateProject(id: string, input: Partial<ProjectInput>): Promise<Project> {
  const response = await request<{ project: Project }>(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return response.project;
}

export async function deleteProject(id: string): Promise<Project> {
  const response = await request<{ project: Project }>(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return response.project;
}

export async function listProjectGenerations(projectId: string): Promise<GenerationRecord[]> {
  const response = await request<{ generations: GenerationRecord[] }>(
    `/api/projects/${encodeURIComponent(projectId)}/generations`,
  );
  return response.generations;
}

export async function createProjectGeneration(projectId: string, input: GenerationRecordInput): Promise<GenerationRecord> {
  const response = await request<{ generation: GenerationRecord }>(
    `/api/projects/${encodeURIComponent(projectId)}/generations`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
  return response.generation;
}

export async function uploadImageAsset(file: Blob, filename = 'image.png', options: UploadImageAssetOptions = {}): Promise<ImageAsset> {
  if (file instanceof File && !options.signal) {
    const existing = fileUploadCache.get(file);
    if (existing) return existing;

    const uploadPromise = uploadImageAssetUncached(file, filename || file.name, options)
      .catch(error => {
        fileUploadCache.delete(file);
        throw error;
      });
    fileUploadCache.set(file, uploadPromise);
    return uploadPromise;
  }

  return uploadImageAssetUncached(file, filename, options);
}

async function uploadImageAssetUncached(file: Blob, filename = 'image.png', options: UploadImageAssetOptions = {}): Promise<ImageAsset> {
  const uploadFile = file instanceof File ? await compressImageBeforeUpload(file) : file;
  const uploadFilename = uploadFile instanceof File ? uploadFile.name : filename;
  const formData = new FormData();
  formData.append('file', uploadFile, uploadFilename);

  const response = await uploadFormDataWithProgress<{ asset: ImageAsset }>('/api/assets/images', formData, options.onProgress, options.signal);
  logAssetUploadSuccess(response.asset);
  return response.asset;
}

function uploadFormDataWithProgress<T>(path: string, formData: FormData, onProgress?: (percent: number) => void, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const accessToken = getAccessToken();
    const abortUpload = () => xhr.abort();
    const cleanup = () => signal?.removeEventListener('abort', abortUpload);
    if (signal?.aborted) {
      reject(new DOMException('The upload was aborted.', 'AbortError'));
      return;
    }
    xhr.open('POST', buildApiUrl(path));
    if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    signal?.addEventListener('abort', abortUpload, { once: true });

    xhr.upload.onprogress = event => {
      if (!event.lengthComputable) return;
      onProgress?.(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = async () => {
      cleanup();
      try {
        const body = xhr.responseText ? JSON.parse(xhr.responseText) as unknown : null;
        if (!isApiResponse<T>(body)) {
          reject(new Error(readApiErrorMessage(body) || `请求失败（HTTP ${xhr.status}）。`));
          return;
        }
        if (body.ok === false) {
          reject(new Error(formatApiError(body.error)));
          return;
        }
        onProgress?.(100);
        resolve(body.data);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('图片上传失败，请重试。'));
      }
    };

    xhr.onerror = () => {
      cleanup();
      reject(new Error(BACKEND_UNAVAILABLE_MESSAGE));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new DOMException('The upload was aborted.', 'AbortError'));
    };
    xhr.send(formData);
  });
}

export async function getImageAsset(id: string): Promise<ImageAsset> {
  const response = await request<{ asset: ImageAsset }>(`/api/assets/images/${encodeURIComponent(id)}`);
  return response.asset;
}

export async function listImageAssets(limit = 40): Promise<ImageAsset[]> {
  const response = await request<{ assets: ImageAsset[] }>(`/api/assets/images?limit=${Math.max(1, Math.min(100, Math.round(limit)))}`);
  return response.assets;
}

export async function removeImageAssetBackground(id: string): Promise<ImageAsset> {
  const response = await request<{ asset: ImageAsset }>(`/api/assets/images/${encodeURIComponent(id)}/remove-background`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return response.asset;
}

export async function segmentFloorPlan(assetId: string, options: ApiRequestOptions = {}): Promise<FloorPlanRegionSet> {
  const response = await request<{ regionSet: FloorPlanRegionSet }>('/api/floor-plan/segment', { method: 'POST', body: JSON.stringify({ assetId }), signal: options.signal });
  return response.regionSet;
}

export async function getLatestFloorPlanSegmentation(assetId: string, options: ApiRequestOptions = {}): Promise<FloorPlanRegionSet | null> {
  const response = await request<{ regionSet: FloorPlanRegionSet | null }>(`/api/floor-plan/segments/latest?assetId=${encodeURIComponent(assetId)}`, { signal: options.signal });
  return response.regionSet;
}

export async function updateFloorPlanRegionNames(regionSetId: string, names: Record<string, string>): Promise<FloorPlanRegionSet> {
  const response = await request<{ regionSet: FloorPlanRegionSet }>(`/api/floor-plan/segments/${encodeURIComponent(regionSetId)}`, { method: 'PATCH', body: JSON.stringify({ names }) });
  return response.regionSet;
}

export async function updateFloorPlanRegions(regionSetId: string, regions: FloorPlanRegion[], options: ApiRequestOptions = {}): Promise<FloorPlanRegionSet> {
  const response = await request<{ regionSet: FloorPlanRegionSet }>(`/api/floor-plan/segments/${encodeURIComponent(regionSetId)}`, { method: 'PATCH', body: JSON.stringify({ regions }), signal: options.signal });
  return response.regionSet;
}

export async function restoreFloorPlanAutoRegions(regionSetId: string, options: ApiRequestOptions = {}): Promise<FloorPlanRegionSet> {
  const response = await request<{ regionSet: FloorPlanRegionSet }>(`/api/floor-plan/segments/${encodeURIComponent(regionSetId)}/restore-auto`, { method: 'POST', body: JSON.stringify({}), signal: options.signal });
  return response.regionSet;
}

export async function confirmFloorPlanRegions(regionSetId: string, regions?: FloorPlanRegion[], options: ApiRequestOptions = {}): Promise<FloorPlanRegionSet> {
  const response = await request<{ regionSet: FloorPlanRegionSet }>(`/api/floor-plan/segments/${encodeURIComponent(regionSetId)}/confirm`, { method: 'POST', body: JSON.stringify({ regions }), signal: options.signal });
  return response.regionSet;
}

export async function getFloorPlanRegionMaterials(regionSetId: string, options: ApiRequestOptions = {}): Promise<FloorPlanRegionMaterial[]> {
  const response = await request<{ materials: FloorPlanRegionMaterial[] }>(`/api/floor-plan/segments/${encodeURIComponent(regionSetId)}/materials`, { signal: options.signal });
  return response.materials;
}

export async function saveFloorPlanRegionMaterials(regionSetId: string, materials: SaveFloorPlanRegionMaterialInput[], options: ApiRequestOptions = {}): Promise<FloorPlanRegionMaterial[]> {
  const response = await request<{ materials: FloorPlanRegionMaterial[] }>(`/api/floor-plan/segments/${encodeURIComponent(regionSetId)}/materials`, {
    method: 'PUT',
    body: JSON.stringify({ materials }),
    signal: options.signal,
  });
  return response.materials;
}

export async function generateFloorPlanMaterialPreview(
  sourceAssetId: string,
  regionSetId: string,
  assignments: SaveFloorPlanRegionMaterialInput[],
  options: ApiRequestOptions = {},
): Promise<ImageAsset> {
  const response = await request<{ controlAsset: ImageAsset }>('/api/floor-plan/material-preview', {
    method: 'POST',
    body: JSON.stringify({ sourceAssetId, regionSetId, assignments }),
    signal: options.signal,
  });
  return response.controlAsset;
}

export async function listPromptTemplates(filters: { generationStep?: GenerationJobStep; search?: string; tag?: string } = {}): Promise<PromptTemplateRecord[]> {
  const params = new URLSearchParams();
  if (filters.generationStep) params.set('generationStep', filters.generationStep);
  if (filters.search?.trim()) params.set('search', filters.search.trim());
  if (filters.tag?.trim()) params.set('tag', filters.tag.trim());
  const query = params.toString();
  const response = await request<{ templates: PromptTemplateRecord[] }>(`/api/prompt-templates${query ? `?${query}` : ''}`);
  return response.templates;
}

export async function createPromptTemplate(input: PromptTemplateCreateInput): Promise<PromptTemplateRecord> {
  const response = await request<{ template: PromptTemplateRecord }>('/api/prompt-templates', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return response.template;
}

export async function getPromptTemplate(id: string): Promise<PromptTemplateRecord> {
  const response = await request<{ template: PromptTemplateRecord }>(`/api/prompt-templates/${encodeURIComponent(id)}`);
  return response.template;
}

export async function deletePromptTemplate(id: string): Promise<PromptTemplateRecord> {
  const response = await request<{ template: PromptTemplateRecord }>(`/api/prompt-templates/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return response.template;
}

export async function createGenerationJob(input: GenerationJobInput): Promise<GenerationJob> {
  const idempotencyKey = input.idempotencyKey || globalThis.crypto?.randomUUID?.();
  const { idempotencyKey: _ignored, ...body } = input;
  const response = await request<{ job: GenerationJob }>('/api/generation-jobs', {
    method: 'POST',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify(body),
  });
  return response.job;
}

export async function getGenerationJob(id: string): Promise<GenerationJob> {
  const response = await request<{ job: GenerationJob }>(`/api/generation-jobs/${encodeURIComponent(id)}`);
  return response.job;
}

export async function cancelGenerationJob(id: string): Promise<GenerationJob> {
  const response = await request<{ job: GenerationJob }>(`/api/generation-jobs/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  });
  return response.job;
}

export async function listModelAssets(): Promise<ModelAssetRecord[]> {
  const response = await request<{ assets: ModelAssetRecord[] }>('/api/assets/models');
  return response.assets;
}

export async function getModelAsset(id: string): Promise<ModelAssetRecord> {
  const response = await request<{ asset: ModelAssetRecord }>(`/api/assets/models/${encodeURIComponent(id)}`);
  return response.asset;
}

export async function optimizeModelAsset(id: string): Promise<ModelAssetRecord> {
  const response = await request<{ asset: ModelAssetRecord }>(`/api/assets/models/${encodeURIComponent(id)}/optimize`, {
    method: 'POST',
  });
  return response.asset;
}

export async function uploadModelAsset(file: File): Promise<ModelAssetRecord> {
  const formData = new FormData();
  formData.append('file', file, file.name);

  const response = await request<{ asset: ModelAssetRecord }>('/api/assets/models', {
    method: 'POST',
    body: formData,
  });
  return response.asset;
}

export async function deleteModelAsset(id: string): Promise<ModelAssetRecord> {
  const response = await request<{ asset: ModelAssetRecord }>(`/api/assets/models/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return response.asset;
}

export async function createShareLink(projectId: string, expiresAt?: string): Promise<{ shareLink: ShareLink; url: string }> {
  return request<{ shareLink: ShareLink; url: string }>(`/api/projects/${encodeURIComponent(projectId)}/share-links`, {
    method: 'POST',
    body: JSON.stringify({ expiresAt }),
  });
}

export async function listProjectShareLinks(projectId: string): Promise<ShareLink[]> {
  const response = await request<{ shareLinks: ShareLink[] }>(
    `/api/projects/${encodeURIComponent(projectId)}/share-links`,
  );
  return response.shareLinks;
}

export async function revokeShareLink(projectId: string, shareLinkId: string): Promise<ShareLink> {
  const response = await request<{ shareLink: ShareLink }>(
    `/api/projects/${encodeURIComponent(projectId)}/share-links/${encodeURIComponent(shareLinkId)}`,
    { method: 'DELETE' },
  );
  return response.shareLink;
}

export async function getPublicShare(token: string): Promise<PublicSharePayload> {
  const response = await request<{ share: PublicSharePayload }>(`/api/share/${encodeURIComponent(token)}`);
  return response.share;
}

async function request<T>(path: string, init: RequestInit = {}, authTokenOverride?: string | null): Promise<T> {
  let response: Response;
  const accessToken = authTokenOverride === undefined ? getAccessToken() : authTokenOverride;
  const headers = new Headers(init.headers);
  const url = buildApiUrl(path);

  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  if (import.meta.env.DEV) {
    console.debug('[api] request', {
      path,
      url,
      hasToken: Boolean(accessToken),
    });
  }

  try {
    response = await fetch(url, {
      ...init,
      headers,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new Error(BACKEND_UNAVAILABLE_MESSAGE);
  }

  if (isRelativeApiPath(path) && isLikelySpaFallbackResponse(response)) {
    throw new Error(BACKEND_UNAVAILABLE_MESSAGE);
  }

  const body = await parseApiResponse<unknown>(response);

  if (body === null) {
    if (response.ok) {
      return null as T;
    }

    throw new Error(`请求失败（HTTP ${response.status}）。`);
  }

  if (!isApiResponse<T>(body)) {
    throw new Error(readApiErrorMessage(body) || `请求失败（HTTP ${response.status}）。`);
  }

  if (body.ok === false) {
    throw new Error(formatApiError(body.error));
  }

  return body.data;
}

function isApiResponse<T>(value: unknown): value is ApiResponse<T> {
  if (!isRecord(value) || typeof value.ok !== 'boolean') {
    return false;
  }

  if (value.ok === true) {
    return 'data' in value;
  }

  return isRecord(value.error) && typeof value.error.message === 'string';
}

function readApiError(value: unknown): string | null {
  if (!isRecord(value)) return null;
  if (typeof value.error === 'string') return value.error;
  if (isRecord(value.error) && typeof value.error.message === 'string') return value.error.message;
  return null;
}

export interface EditSessionDetail { session: EditSession; versions: AssetVersion[]; messages: EditMessage[]; }
export async function listProjectEditSessions(projectId: string): Promise<EditSessionDetail[]> {
  const response = await request<{ sessions: EditSessionDetail[] }>(
    `/api/edit-sessions?projectId=${encodeURIComponent(projectId)}`,
  );
  return response.sessions;
}
export async function createEditSession(input: { sourceAssetId: string; projectId?: string | null; title?: string; permanentConstraints?: Record<string, unknown>; aspectRatio?: string | null }): Promise<EditSessionDetail> {
  const response = await request<{ session: EditSession; version: AssetVersion; versions: AssetVersion[]; messages: EditMessage[] }>('/api/edit-sessions', { method: 'POST', body: JSON.stringify(input) });
  if (!response.session?.id) throw new Error('后端未返回连续修改会话 ID。');
  if (!Array.isArray(response.versions) || response.versions.length === 0) throw new Error('后端未返回连续修改版本列表。');
  return { session: response.session, versions: response.versions, messages: response.messages };
}
export async function getEditSession(id: string): Promise<EditSessionDetail> { return request<EditSessionDetail>(`/api/edit-sessions/${encodeURIComponent(id)}`); }
export async function createEditMessage(sessionId: string, input: { instruction: string; baseVersionId: string; imageSize?: '1K'|'2K'|'4K'; generationKind?:'preview-edit'|'final-render'; maskAssetId?:string; constraints?: Record<string, unknown>; clientRequestId:string }): Promise<{ sessionId:string; message:EditMessage; jobId:string; status:string; creditCost:number; idempotent?:boolean }> { return request(`/api/edit-sessions/${encodeURIComponent(sessionId)}/messages`, { method:'POST', body:JSON.stringify(input) }); }
export async function selectEditVersion(sessionId:string,versionId:string):Promise<{session:EditSession;currentVersionId:string}>{return request(`/api/edit-sessions/${encodeURIComponent(sessionId)}/select-version`,{method:'POST',body:JSON.stringify({versionId})});}
export async function updateEditVersion(
  sessionId: string,
  versionId: string,
  input: { displayName?: string | null; note?: string | null },
): Promise<AssetVersion> {
  const response = await request<{ version: AssetVersion }>(
    `/api/edit-sessions/${encodeURIComponent(sessionId)}/versions/${encodeURIComponent(versionId)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
  return response.version;
}
export async function restoreEditVersion(sessionId: string, versionId: string): Promise<{ session: EditSession; version: AssetVersion }> {
  return request(`/api/edit-sessions/${encodeURIComponent(sessionId)}/versions/${encodeURIComponent(versionId)}/restore`, {
    method: 'POST',
  });
}
export async function setPrimaryEditVersion(sessionId: string, versionId: string): Promise<EditSession> {
  const response = await request<{ session: EditSession }>(
    `/api/edit-sessions/${encodeURIComponent(sessionId)}/versions/${encodeURIComponent(versionId)}/set-primary`,
    { method: 'POST' },
  );
  return response.session;
}
export async function setFinalEditVersion(sessionId: string, versionId: string): Promise<EditSession> {
  const response = await request<{ session: EditSession }>(
    `/api/edit-sessions/${encodeURIComponent(sessionId)}/versions/${encodeURIComponent(versionId)}/set-final`,
    { method: 'POST' },
  );
  return response.session;
}
export async function markEditVersionExported(sessionId: string, versionId: string): Promise<AssetVersion> {
  const response = await request<{ version: AssetVersion }>(
    `/api/edit-sessions/${encodeURIComponent(sessionId)}/versions/${encodeURIComponent(versionId)}/exported`,
    { method: 'POST' },
  );
  return response.version;
}

export async function getAiProviders(init: RequestInit = {}): Promise<AiProvidersConfig> {
  return request<AiProvidersConfig>('/api/ai-providers', init);
}

export async function convertModelAsset(id: string): Promise<ModelAssetRecord> {
  const response = await request<{ asset: ModelAssetRecord }>(`/api/assets/models/${encodeURIComponent(id)}/convert`, {
    method: 'POST',
  });
  return response.asset;
}

function formatApiError(error: ApiErrorResponse): string {
  if (isInternalApiError(error)) {
    return SAFE_INTERNAL_SERVICE_ERROR_MESSAGE;
  }
  if (error.code === 'AUTH_REQUIRED') {
    return '请先登录。';
  }
  if (error.code === 'AUTH_INVALID') {
    return '登录已过期，请重新登录。';
  }
  if (error.code === 'TOKEN_EXPIRED') {
    return '登录状态已失效，请重新登录。';
  }
  if (error.code === 'API_ROUTE_NOT_FOUND') {
    return '接口地址不存在，请检查前后端 API 路径或后端部署配置。';
  }
  if (error.code === 'EDIT_SCHEMA_NOT_READY') {
    return '连续修改数据表尚未创建，请执行 Supabase migration 后重试。';
  }
  if (error.code === 'EDIT_SESSION_SOURCE_NOT_FOUND') {
    return '当前图片资产不存在或无权访问，请重新上传图片后重试。';
  }
  if (error.code === 'BACKEND_NOT_CONFIGURED') {
    return '后端服务暂不可用，请检查 VITE_API_BASE_URL 是否指向已部署的 Express 后端。';
  }
  if (error.code === 'AUTH_LOGIN_FAILED') {
    return '账号或密码错误';
  }
  if (error.code === 'AUTH_PROFILE_REQUIRED') {
    return '账号尚未由管理员激活，请联系管理员。';
  }
  if (error.code === 'AUTH_USER_DISABLED') {
    return '账号已停用，请联系管理员。';
  }
  if (error.code === 'UPLOAD_IMAGE_TYPE_INVALID') {
    return '图片格式不支持。请上传 PNG、JPG、JPEG 或 WEBP 图片。';
  }
  const parts = [error.code ? `${error.code}: ${error.message}` : error.message];
  if (error.provider) parts.push(`provider=${error.provider}`);
  if (typeof error.statusCode === 'number') parts.push(`statusCode=${error.statusCode}`);
  if (error.rawSnippet) parts.push(`raw=${error.rawSnippet}`);
  return parts.join(' | ');
}

function isInternalApiError(error: ApiErrorResponse): boolean {
  return Boolean(
    (error.code && INTERNAL_ERROR_CODES.has(error.code))
    || containsInternalErrorText(error.message)
    || containsInternalErrorText(error.rawSnippet)
  );
}

function containsInternalErrorText(value: unknown): boolean {
  return typeof value === 'string' && INTERNAL_ERROR_PATTERNS.some(pattern => pattern.test(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLikelySpaFallbackResponse(response: Response): boolean {
  const contentType = response.headers.get('Content-Type') || '';
  return response.ok && contentType.toLowerCase().includes('text/html');
}
