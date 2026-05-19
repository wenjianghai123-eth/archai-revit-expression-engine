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

export type GenerationMode = 'floorplan' | 'style-render' | 'inpaint' | 'model-render' | 'design-variants' | 'material-replace' | 'plan-colorize';
export type VariantGenerationStrategy = 'style-matrix' | 'same-style';
export type VariantStyleKey =
  | 'modern-minimal'
  | 'wabi-sabi'
  | 'cream-style'
  | 'light-luxury'
  | 'industrial'
  | 'commercial-showroom'
  | 'hotel-lobby'
  | 'office-space'
  | 'natural-wood'
  | 'premium-gray'
  | 'custom';

export interface ModelSnapshotMetadata {
  sourceType: 'model-snapshot';
  sourceModelAssetId: string;
  width: number;
  height: number;
  camera?: {
    position?: number[];
    rotation?: number[];
    target?: number[];
    fov?: number;
  };
  viewMode?: 'orbit' | 'walkthrough';
  clippingEnabled?: boolean;
  clippingHeight?: number;
  xrayEnabled?: boolean;
  edgesEnabled?: boolean;
  createdAt: string;
}

export interface GenerationRecord {
  id: string;
  userId: string;
  projectId: string;
  jobId?: string | null;
  mode: GenerationMode;
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
  modelSnapshotMetadata?: ModelSnapshotMetadata | null;
}

export interface GenerationJob {
  id: string;
  userId: string;
  projectId: string;
  mode: GenerationMode;
  prompt: string;
  config: Record<string, unknown>;
  inputAssetIds: string[];
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
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
  sourceModelAssetId?: string | null;
  snapshotAssetId?: string | null;
  modelSnapshotMetadata?: ModelSnapshotMetadata | null;
}

export type GenerationJobPhase =
  | 'queued'
  | 'prepare-input'
  | 'provider-request'
  | 'postprocess'
  | 'save-result'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface GenerationJobDiagnostics {
  phase?: GenerationJobPhase;
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
    retryCount?: number;
    fallbackProvider?: string;
    fallbackReason?: string;
  };
  images?: {
    inputImages?: number;
    referenceImages?: number;
    inputBytesBefore?: number;
    inputBytesAfter?: number;
    referenceBytesBefore?: number;
    referenceBytesAfter?: number;
    payloadBytesApprox?: number;
    localInpaintEnabled?: boolean;
    originalWidth?: number;
    originalHeight?: number;
    maskWidth?: number;
    maskHeight?: number;
    furnitureReferenceCount?: number;
    maskBbox?: { x: number; y: number; width: number; height: number };
    prepared?: Array<{
      role: string;
      width: number;
      height: number;
      originalWidth: number;
      originalHeight: number;
      originalBytes: number;
      outputBytes: number;
      mime: string;
    }>;
  };
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

export interface ImageAsset {
  id: string;
  userId: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface ModelAsset {
  id: string;
  userId: string;
  url: string;
  filename: string;
  originalFilename: string;
  fileType: 'glb' | 'gltf' | 'obj' | 'dae' | 'stl';
  format?: 'glb' | 'gltf' | 'obj' | 'dae' | 'stl';
  mimeType: string;
  size: number;
  createdAt: string;
  deletedAt?: string | null;
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

export interface CreditBalance {
  userId: string;
  balance: number;
  updatedAt: string;
}

export interface CreditTransaction {
  id: string;
  userId: string;
  type: 'grant' | 'debit' | 'refund';
  amount: number;
  balanceAfter: number;
  reason: string;
  referenceType?: 'generation_job' | 'system' | null;
  referenceId?: string | null;
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

export interface AppDatabase {
  profiles: UserProfile[];
  projects: Project[];
  generationRecords: GenerationRecord[];
  generationResults: GenerationResult[];
  generationJobs: GenerationJob[];
  imageAssets: ImageAsset[];
  modelAssets: ModelAsset[];
  shareLinks: ShareLink[];
  creditBalances: CreditBalance[];
  creditTransactions: CreditTransaction[];
}

export type CreateUserProfileInput = {
  id: string;
  email: string;
  name: string;
  role?: UserProfile['role'];
  status?: UserProfile['status'];
};

export type UpdateUserProfileInput = Partial<Pick<UserProfile, 'email' | 'name' | 'role' | 'status'>>;

export type CreateProjectInput = {
  userId: string;
  name: string;
  description?: string;
  status?: Project['status'];
  coverImageUrl?: string | null;
};

export type UpdateProjectInput = Partial<Pick<Project, 'name' | 'description' | 'status' | 'coverImageUrl'>>;

export type CreateGenerationRecordInput = {
  userId: string;
  projectId: string;
  jobId?: string | null;
  mode: GenerationRecord['mode'];
  prompt: string;
  inputImageUrl?: string | null;
  inputImageDataPreview?: string | null;
  outputImageUrl?: string | null;
  outputImageDataPreview?: string | null;
  provider: string;
  status?: GenerationRecord['status'];
  sourceModelAssetId?: string | null;
  snapshotAssetId?: string | null;
  modelSnapshotMetadata?: ModelSnapshotMetadata | null;
};

export type CreateGenerationJobInput = {
  userId: string;
  projectId: string;
  mode: GenerationJob['mode'];
  prompt: string;
  config: Record<string, unknown>;
  inputAssetIds: string[];
  provider: string;
};

export type UpdateGenerationJobInput = Partial<
  Pick<GenerationJob, 'status' | 'progress' | 'outputAssetId' | 'outputAssetIds' | 'errorMessage' | 'startedAt' | 'finishedAt'>
> & {
  diagnostics?: GenerationJobDiagnostics;
};

export type CreateGenerationResultInput = {
  userId: string;
  projectId: string;
  jobId: string;
  assetId: string;
  imageUrl: string;
  isSelected?: boolean;
  isFavorite?: boolean;
  metadata?: Record<string, unknown>;
};

export type UpdateGenerationResultInput = Partial<Pick<GenerationResult, 'isSelected' | 'isFavorite' | 'metadata'>>;

export type CreateImageAssetInput = {
  userId: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
};

export type CreateModelAssetInput = {
  userId: string;
  url: string;
  filename: string;
  originalFilename: string;
  fileType: ModelAsset['fileType'];
  mimeType: string;
  size: number;
};

export type CreateShareLinkInput = {
  userId: string;
  projectId: string;
  token: string;
  expiresAt: string;
};

export type CreditTransactionInput = {
  userId: string;
  type: CreditTransaction['type'];
  amount: number;
  reason: string;
  referenceType?: CreditTransaction['referenceType'];
  referenceId?: string | null;
};

export interface StorageAdapter {
  ensureReady(): Promise<void>;

  listUserProfiles(): Promise<UserProfile[]>;
  getUserProfile(id: string): Promise<UserProfile | null>;
  getUserProfileByEmail(email: string): Promise<UserProfile | null>;
  createUserProfile(input: CreateUserProfileInput): Promise<UserProfile>;
  updateUserProfile(id: string, input: UpdateUserProfileInput): Promise<UserProfile | null>;

  listProjects(userId: string): Promise<Project[]>;
  createProject(input: CreateProjectInput): Promise<Project>;
  getProject(id: string, userId?: string): Promise<Project | null>;
  updateProject(id: string, userId: string, input: UpdateProjectInput): Promise<Project | null>;
  softDeleteProject(id: string, userId: string): Promise<Project | null>;

  listProjectGenerations(projectId: string, userId: string): Promise<GenerationRecord[]>;
  createGenerationRecord(input: CreateGenerationRecordInput): Promise<GenerationRecord | null>;
  listGenerationResults(jobId: string, userId?: string): Promise<GenerationResult[]>;
  createGenerationResult(input: CreateGenerationResultInput): Promise<GenerationResult | null>;
  updateGenerationResult(id: string, userId: string, input: UpdateGenerationResultInput): Promise<GenerationResult | null>;

  createGenerationJob(input: CreateGenerationJobInput): Promise<GenerationJob | null>;
  getGenerationJob(id: string, userId?: string): Promise<GenerationJob | null>;
  listRunnableGenerationJobs(): Promise<GenerationJob[]>;
  updateGenerationJob(id: string, input: UpdateGenerationJobInput): Promise<GenerationJob | null>;
  cancelGenerationJob(id: string, userId?: string): Promise<GenerationJob | null>;

  createImageAsset(input: CreateImageAssetInput): Promise<ImageAsset>;
  getImageAsset(id: string, userId?: string): Promise<ImageAsset | null>;

  listModelAssets(userId: string): Promise<ModelAsset[]>;
  getModelAsset(id: string, userId?: string): Promise<ModelAsset | null>;
  createModelAsset(input: CreateModelAssetInput): Promise<ModelAsset>;
  deleteModelAsset(id: string, userId: string): Promise<ModelAsset | null>;

  createShareLink(input: CreateShareLinkInput): Promise<ShareLink | null>;
  getShareLinkByToken(token: string): Promise<ShareLink | null>;
  revokeShareLink(projectId: string, userId: string, shareLinkId: string): Promise<ShareLink | null>;

  getCreditBalance(userId: string): Promise<CreditBalance>;
  listCreditTransactions(userId: string): Promise<CreditTransaction[]>;
  adjustCredits(input: CreditTransactionInput): Promise<{ balance: CreditBalance; transaction: CreditTransaction } | null>;
  getCreditTransactionByReference(userId: string, type: CreditTransaction['type'], referenceId: string): Promise<CreditTransaction | null>;

  getAdminDashboard(): Promise<AdminDashboard>;
}
