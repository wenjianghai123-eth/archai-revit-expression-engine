import { buildApiUrl, isApiBaseUrlMissingInProduction, isRelativeApiPath } from './apiBaseUrl';
import { parseApiResponse, readApiErrorMessage } from './apiResponse';
import { getSupabaseAccessToken } from './supabase';

const MISSING_API_BASE_URL_MESSAGE = '后端 API 未配置或不可访问，请配置 VITE_API_BASE_URL。';

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
  | 'free_reference_image';
export type PromptTemplateFeature =
  | 'floorplan'
  | 'style-render'
  | 'design-variants'
  | 'material-replace'
  | 'object-insert'
  | 'free-reference-image';

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
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
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
  prompt: string;
  config: Record<string, unknown>;
  inputAssetIds: string[];
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

export async function getCurrentUser(): Promise<AuthUser> {
  const response = await request<{ user: AuthUser }>('/api/auth/me');
  return response.user;
}

export async function getCreditBalance(): Promise<CreditBalance> {
  const response = await request<{ balance: CreditBalance }>('/api/billing/credits');
  return response.balance;
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

export async function uploadImageAsset(file: Blob, filename = 'image.png'): Promise<ImageAsset> {
  const formData = new FormData();
  formData.append('file', file, filename);

  const response = await request<{ asset: ImageAsset }>('/api/assets/images', {
    method: 'POST',
    body: formData,
  });
  return response.asset;
}

export async function getImageAsset(id: string): Promise<ImageAsset> {
  const response = await request<{ asset: ImageAsset }>(`/api/assets/images/${encodeURIComponent(id)}`);
  return response.asset;
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
  const response = await request<{ job: GenerationJob }>('/api/generation-jobs', {
    method: 'POST',
    body: JSON.stringify(input),
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  const accessToken = await getSupabaseAccessToken();
  const headers = new Headers(init.headers);
  const url = buildApiUrl(path);

  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  try {
    response = await fetch(url, {
      ...init,
      headers,
    });
  } catch {
    if (isMissingProductionApi(path)) {
      throw new Error(MISSING_API_BASE_URL_MESSAGE);
    }
    throw new Error('无法连接后端服务，请确认 npm run dev:server 已启动。');
  }

  if (response.status === 404 && isMissingProductionApi(path)) {
    throw new Error(MISSING_API_BASE_URL_MESSAGE);
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

export async function convertModelAsset(id: string): Promise<ModelAssetRecord> {
  const response = await request<{ asset: ModelAssetRecord }>(`/api/assets/models/${encodeURIComponent(id)}/convert`, {
    method: 'POST',
  });
  return response.asset;
}

function formatApiError(error: ApiErrorResponse): string {
  const parts = [error.code ? `${error.code}: ${error.message}` : error.message];
  if (error.provider) parts.push(`provider=${error.provider}`);
  if (typeof error.statusCode === 'number') parts.push(`statusCode=${error.statusCode}`);
  if (error.rawSnippet) parts.push(`raw=${error.rawSnippet}`);
  return parts.join(' | ');
}

function isMissingProductionApi(path: string): boolean {
  return isApiBaseUrlMissingInProduction() && isRelativeApiPath(path);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
