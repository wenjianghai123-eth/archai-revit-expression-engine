import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { DEV_AUTH_USER_ID } from '../auth';
import {
  AppDatabase,
  AdminDashboard,
  ClaimGenerationJobInput,
  CreateGenerationJobInput,
  CreateGenerationRecordInput,
  CreateGenerationResultInput,
  CreateImageAssetInput,
  CreateFloorPlanRegionSetInput,
  SaveFloorPlanRegionMaterialInput,
  CreatePromptTemplateInput,
  CreateModelAssetInput,
  CreateProjectInput,
  CreateShareLinkInput,
  CreditBalance,
  CreditTransaction,
  CreditTransactionInput,
  CreateUserProfileInput,
  GenerationJob,
  GenerationRecord,
  GenerationResult,
  ImageAsset,
  FloorPlanRegion, FloorPlanRegionSet, FloorPlanRegionMaterial,
  PromptTemplateFilters,
  PromptTemplateRecord,
  ModelAsset,
  UpdateModelAssetInput,
  Project,
  ShareLink,
  StorageAdapter,
  UpdateGenerationJobInput,
  UpdateGenerationResultInput,
  UpdateProjectInput,
  UpdateUserProfileInput,
  UserProfile,
  EditSession, EditMessage, AssetVersion, CreateEditSessionInput, CreateEditMessageInput, CreateAssetVersionInput,
  DesignWorkflow, DesignWorkflowNode, CreateDesignWorkflowInput, CreateDesignWorkflowNodeInput,
  UpdateDesignWorkflowInput, UpdateDesignWorkflowNodeInput,
} from './types';

const dataDir = path.resolve(process.cwd(), process.env.DATA_DIR || 'data');
const dbPath = path.join(dataDir, 'app-db.json');
const emptyDatabase: AppDatabase = {
  profiles: [],
  projects: [],
  generationRecords: [],
  generationResults: [],
  generationJobs: [],
  imageAssets: [],
  promptTemplates: [],
  modelAssets: [],
  shareLinks: [],
  creditBalances: [],
  creditTransactions: [],
  editSessions: [],
  editMessages: [],
  assetVersions: [],
  floorPlanRegionSets: [],
  floorPlanRegionMaterials: [],
  designWorkflows: [],
  designWorkflowNodes: [],
};

let writeQueue: Promise<void> = Promise.resolve();
let atomicMutationQueue: Promise<void> = Promise.resolve();

export class JsonStorageAdapter implements StorageAdapter {
  ensureReady(): Promise<void> {
    return ensureAppDatabase();
  }

  ensureFloorPlanSchemaReady(): Promise<void> {
    return Promise.resolve();
  }

  listUserProfiles(): Promise<UserProfile[]> {
    return listUserProfiles();
  }

  getUserProfile(id: string): Promise<UserProfile | null> {
    return getUserProfile(id);
  }

  getUserProfileByEmail(email: string): Promise<UserProfile | null> {
    return getUserProfileByEmail(email);
  }

  createUserProfile(input: CreateUserProfileInput): Promise<UserProfile> {
    return createUserProfile(input);
  }

  updateUserProfile(id: string, input: UpdateUserProfileInput): Promise<UserProfile | null> {
    return updateUserProfile(id, input);
  }

  listProjects(userId: string): Promise<Project[]> {
    return listProjects(userId);
  }

  createProject(input: CreateProjectInput): Promise<Project> {
    return createProject(input);
  }

  getProject(id: string, userId?: string): Promise<Project | null> {
    return getProject(id, userId);
  }

  updateProject(id: string, userId: string, input: UpdateProjectInput): Promise<Project | null> {
    return updateProject(id, userId, input);
  }

  softDeleteProject(id: string, userId: string): Promise<Project | null> {
    return softDeleteProject(id, userId);
  }

  listProjectGenerations(projectId: string, userId: string): Promise<GenerationRecord[]> {
    return listProjectGenerations(projectId, userId);
  }

  createGenerationRecord(input: CreateGenerationRecordInput): Promise<GenerationRecord | null> {
    return createGenerationRecord(input);
  }

  listGenerationResults(jobId: string, userId?: string): Promise<GenerationResult[]> {
    return listGenerationResults(jobId, userId);
  }

  createGenerationResult(input: CreateGenerationResultInput): Promise<GenerationResult | null> {
    return createGenerationResult(input);
  }

  updateGenerationResult(id: string, userId: string, input: UpdateGenerationResultInput): Promise<GenerationResult | null> {
    return updateGenerationResult(id, userId, input);
  }

  createDesignWorkflow(input: CreateDesignWorkflowInput) { return createDesignWorkflow(input); }
  getActiveDesignWorkflow(projectId: string, userId: string) { return getActiveDesignWorkflow(projectId, userId); }
  getDesignWorkflow(id: string, projectId: string, userId: string) { return getDesignWorkflow(id, projectId, userId); }
  updateDesignWorkflow(id: string, projectId: string, userId: string, input: UpdateDesignWorkflowInput) { return updateDesignWorkflow(id, projectId, userId, input); }
  listDesignWorkflowNodes(workflowId: string, projectId: string, userId: string) { return listDesignWorkflowNodes(workflowId, projectId, userId); }
  getDesignWorkflowNode(id: string, workflowId: string, projectId: string, userId: string) { return getDesignWorkflowNode(id, workflowId, projectId, userId); }
  createDesignWorkflowNode(input: CreateDesignWorkflowNodeInput) { return createDesignWorkflowNode(input); }
  updateDesignWorkflowNode(id: string, input: UpdateDesignWorkflowNodeInput) { return updateDesignWorkflowNode(id, input); }

  createGenerationJob(input: CreateGenerationJobInput): Promise<GenerationJob | null> {
    return createGenerationJob(input);
  }

  getGenerationJob(id: string, userId?: string): Promise<GenerationJob | null> {
    return getGenerationJob(id, userId);
  }

  getGenerationJobByIdempotencyKey(userId: string, idempotencyKey: string): Promise<GenerationJob | null> {
    return getGenerationJobByIdempotencyKey(userId, idempotencyKey);
  }

  listRunnableGenerationJobs(): Promise<GenerationJob[]> {
    return listRunnableGenerationJobs();
  }

  claimGenerationJob(input: ClaimGenerationJobInput): Promise<GenerationJob | null> {
    return claimGenerationJob(input);
  }

  renewGenerationJobLease(id: string, workerId: string, leaseDurationMs: number): Promise<boolean> {
    return renewGenerationJobLease(id, workerId, leaseDurationMs);
  }

  updateGenerationJobWithLease(id: string, workerId: string, input: UpdateGenerationJobInput): Promise<GenerationJob | null> {
    return updateGenerationJobWithLease(id, workerId, input);
  }

  updateGenerationJob(id: string, input: UpdateGenerationJobInput): Promise<GenerationJob | null> {
    return updateGenerationJob(id, input);
  }

  cancelGenerationJob(id: string, userId?: string): Promise<GenerationJob | null> {
    return cancelGenerationJob(id, userId);
  }

  createImageAsset(input: CreateImageAssetInput): Promise<ImageAsset> {
    return createImageAsset(input);
  }

  getImageAsset(id: string, userId?: string): Promise<ImageAsset | null> {
    return getImageAsset(id, userId);
  }

  listImageAssets(userId: string, limit = 40): Promise<ImageAsset[]> {
    return listImageAssets(userId, limit);
  }

  createFloorPlanRegionSet(input: CreateFloorPlanRegionSetInput) { return createFloorPlanRegionSet(input); }
  getFloorPlanRegionSet(id: string, userId: string) { return getFloorPlanRegionSet(id, userId); }
  getLatestFloorPlanRegionSet(sourceAssetId: string, userId: string) { return getLatestFloorPlanRegionSet(sourceAssetId, userId); }
  updateFloorPlanRegionSet(id: string, userId: string, input: { regions?: FloorPlanRegion[]; autoRegions?: FloorPlanRegion[]; overlayAssetId?: string | null; overlayUrl?: string | null; status?: FloorPlanRegionSet['status']; confirmedAt?: string | null; lockedAt?: string | null }) { return updateFloorPlanRegionSet(id, userId, input); }
  listFloorPlanRegionMaterials(regionSetId: string, userId: string) { return listFloorPlanRegionMaterials(regionSetId, userId); }
  saveFloorPlanRegionMaterials(regionSetId: string, userId: string, materials: SaveFloorPlanRegionMaterialInput[]) { return saveFloorPlanRegionMaterials(regionSetId, userId, materials); }

  createEditSession(input: CreateEditSessionInput, sourceAsset: ImageAsset) { return createEditSession(input, sourceAsset); }
  listEditSessions(userId: string, projectId?: string | null) { return listEditSessions(userId, projectId); }
  getEditSession(id: string, userId: string) { return getEditSession(id, userId); }
  updateEditSession(id: string, userId: string, input: Partial<Pick<EditSession, 'currentVersionId' | 'primaryVersionId' | 'finalVersionId' | 'status' | 'title'>>) { return updateEditSession(id, userId, input); }
  listAssetVersions(sessionId: string, userId: string) { return listAssetVersions(sessionId, userId); }
  getAssetVersion(id: string, sessionId: string, userId: string) { return getAssetVersion(id, sessionId, userId); }
  createAssetVersion(input: CreateAssetVersionInput) { return createAssetVersion(input); }
  updateAssetVersion(id: string, sessionId: string, userId: string, input: Partial<Pick<AssetVersion, 'displayName' | 'note' | 'exportedAt'>>) { return updateAssetVersion(id, sessionId, userId, input); }
  createEditMessage(input: CreateEditMessageInput) { return createEditMessage(input); }
  getEditMessage(id: string) { return getEditMessage(id); }
  getEditMessageByClientRequest(sessionId: string, clientRequestId: string) { return getEditMessageByClientRequest(sessionId, clientRequestId); }
  listEditMessages(sessionId: string, userId: string) { return listEditMessages(sessionId, userId); }
  updateEditMessage(id: string, input: Partial<Pick<EditMessage, 'outputVersionId' | 'generationJobId' | 'status' | 'errorCode' | 'errorMessage'>>) { return updateEditMessage(id, input); }

  listPromptTemplates(filters?: PromptTemplateFilters): Promise<PromptTemplateRecord[]> {
    return listPromptTemplates(filters);
  }

  getPromptTemplate(id: string): Promise<PromptTemplateRecord | null> {
    return getPromptTemplate(id);
  }

  createPromptTemplate(input: CreatePromptTemplateInput): Promise<PromptTemplateRecord> {
    return createPromptTemplate(input);
  }

  deletePromptTemplate(id: string): Promise<PromptTemplateRecord | null> {
    return deletePromptTemplate(id);
  }

  listModelAssets(userId: string): Promise<ModelAsset[]> {
    return listModelAssets(userId);
  }

  getModelAsset(id: string, userId?: string): Promise<ModelAsset | null> {
    return getModelAsset(id, userId);
  }

  createModelAsset(input: CreateModelAssetInput): Promise<ModelAsset> {
    return createModelAsset(input);
  }

  updateModelAsset(id: string, input: UpdateModelAssetInput): Promise<ModelAsset | null> {
    return updateModelAsset(id, input);
  }

  deleteModelAsset(id: string, userId: string): Promise<ModelAsset | null> {
    return deleteModelAsset(id, userId);
  }

  createShareLink(input: CreateShareLinkInput): Promise<ShareLink | null> {
    return createShareLink(input);
  }

  listProjectShareLinks(projectId: string, userId: string): Promise<ShareLink[]> {
    return listProjectShareLinks(projectId, userId);
  }

  getShareLinkByToken(token: string): Promise<ShareLink | null> {
    return getShareLinkByToken(token);
  }

  revokeShareLink(projectId: string, userId: string, shareLinkId: string): Promise<ShareLink | null> {
    return revokeShareLink(projectId, userId, shareLinkId);
  }

  getCreditBalance(userId: string): Promise<CreditBalance> {
    return getCreditBalance(userId);
  }

  listCreditTransactions(userId: string): Promise<CreditTransaction[]> {
    return listCreditTransactions(userId);
  }

  adjustCredits(input: CreditTransactionInput): Promise<{ balance: CreditBalance; transaction: CreditTransaction } | null> {
    return adjustCredits(input);
  }

  getCreditTransactionByReference(userId: string, type: CreditTransaction['type'], referenceId: string): Promise<CreditTransaction | null> {
    return getCreditTransactionByReference(userId, type, referenceId);
  }

  refundGenerationJobOnce(jobId: string): Promise<boolean> {
    return refundGenerationJobOnce(jobId);
  }

  getAdminDashboard(): Promise<AdminDashboard> {
    return getAdminDashboard();
  }
}

async function ensureAppDatabase(): Promise<void> {
  await mkdir(dataDir, { recursive: true });

  try {
    await readFile(dbPath, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      await writeDatabase(emptyDatabase);
      return;
    }

    throw error;
  }
}

async function listProjects(userId: string): Promise<Project[]> {
  const db = await readDatabase();
  return db.projects.filter(project => project.userId === userId && !project.deletedAt);
}

async function listUserProfiles(): Promise<UserProfile[]> {
  const db = await readDatabase();
  return [...db.profiles].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function getUserProfile(id: string): Promise<UserProfile | null> {
  const db = await readDatabase();
  return db.profiles.find(profile => profile.id === id) ?? null;
}

async function getUserProfileByEmail(email: string): Promise<UserProfile | null> {
  const db = await readDatabase();
  const normalizedEmail = email.trim().toLowerCase();
  return db.profiles.find(profile => profile.email.toLowerCase() === normalizedEmail) ?? null;
}

async function createUserProfile(input: CreateUserProfileInput): Promise<UserProfile> {
  const db = await readDatabase();
  const now = new Date().toISOString();
  const existing = db.profiles.find(profile => profile.id === input.id);

  if (existing) {
    existing.email = input.email.trim().toLowerCase();
    existing.name = input.name.trim();
    existing.role = input.role ?? existing.role;
    existing.status = input.status ?? existing.status;
    existing.updatedAt = now;
    await writeDatabase(db);
    return existing;
  }

  const profile: UserProfile = {
    id: input.id,
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    role: input.role ?? 'member',
    status: input.status ?? 'active',
    createdAt: now,
    updatedAt: now,
  };

  db.profiles.unshift(profile);
  await writeDatabase(db);
  return profile;
}

async function updateUserProfile(id: string, input: UpdateUserProfileInput): Promise<UserProfile | null> {
  const db = await readDatabase();
  const profile = db.profiles.find(item => item.id === id);
  if (!profile) return null;

  if (input.email !== undefined) profile.email = input.email.trim().toLowerCase();
  if (input.name !== undefined) profile.name = input.name.trim();
  if (input.role !== undefined) profile.role = input.role;
  if (input.status !== undefined) profile.status = input.status;
  profile.updatedAt = new Date().toISOString();

  await writeDatabase(db);
  return profile;
}

async function createProject(input: {
  userId: string;
  name: string;
  description?: string;
  status?: Project['status'];
  coverImageUrl?: string | null;
}): Promise<Project> {
  const now = new Date().toISOString();
  const project: Project = {
    id: `project_${randomUUID()}`,
    userId: input.userId,
    name: input.name,
    description: input.description ?? '',
    status: input.status ?? 'active',
    coverImageUrl: input.coverImageUrl ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  const db = await readDatabase();
  db.projects.unshift(project);
  await writeDatabase(db);
  return project;
}

async function getProject(id: string, userId?: string): Promise<Project | null> {
  const db = await readDatabase();
  return db.projects.find(project => project.id === id && (!userId || project.userId === userId) && !project.deletedAt) ?? null;
}

async function updateProject(
  id: string,
  userId: string,
  input: Partial<Pick<Project, 'name' | 'description' | 'status' | 'coverImageUrl'>>,
): Promise<Project | null> {
  const db = await readDatabase();
  const project = db.projects.find(item => item.id === id && item.userId === userId && !item.deletedAt);

  if (!project) {
    return null;
  }

  if (input.name !== undefined) project.name = input.name;
  if (input.description !== undefined) project.description = input.description;
  if (input.status !== undefined) project.status = input.status;
  if (input.coverImageUrl !== undefined) project.coverImageUrl = input.coverImageUrl;
  project.updatedAt = new Date().toISOString();

  await writeDatabase(db);
  return project;
}

async function softDeleteProject(id: string, userId: string): Promise<Project | null> {
  const db = await readDatabase();
  const project = db.projects.find(item => item.id === id && item.userId === userId && !item.deletedAt);

  if (!project) {
    return null;
  }

  const now = new Date().toISOString();
  project.deletedAt = now;
  project.status = 'archived';
  project.updatedAt = now;

  await writeDatabase(db);
  return project;
}

async function listProjectGenerations(projectId: string, userId: string): Promise<GenerationRecord[]> {
  const db = await readDatabase();
  return db.generationRecords
    .filter(record => record.userId === userId && record.projectId === projectId)
    .map(record => ({
      ...record,
      results: record.jobId ? db.generationResults.filter(result => result.userId === userId && result.jobId === record.jobId) : [],
    }));
}

async function createGenerationRecord(input: {
  userId: string;
  projectId: string;
  jobId?: string | null;
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
  modelSnapshotMetadata?: GenerationRecord['modelSnapshotMetadata'];
}): Promise<GenerationRecord | null> {
  const db = await readDatabase();
  const project = db.projects.find(item => item.id === input.projectId && item.userId === input.userId && !item.deletedAt);

  if (!project) {
    return null;
  }

  const now = new Date().toISOString();
  const record: GenerationRecord = {
    id: `generation_${randomUUID()}`,
    userId: input.userId,
    projectId: input.projectId,
    jobId: input.jobId ?? null,
    mode: input.mode,
    step: input.step ?? null,
    prompt: input.prompt,
    inputImageUrl: input.inputImageUrl ?? null,
    inputImageDataPreview: input.inputImageDataPreview ?? null,
    outputImageUrl: input.outputImageUrl ?? null,
    outputImageDataPreview: input.outputImageDataPreview ?? null,
    provider: input.provider,
    status: input.status ?? 'succeeded',
    createdAt: now,
    updatedAt: now,
    sourceModelAssetId: input.sourceModelAssetId ?? null,
    snapshotAssetId: input.snapshotAssetId ?? null,
    modelSnapshotMetadata: input.modelSnapshotMetadata ?? null,
  };

  db.generationRecords.unshift(record);
  project.updatedAt = now;
  if (!project.coverImageUrl && record.outputImageDataPreview) {
    project.coverImageUrl = record.outputImageDataPreview;
  }

  await writeDatabase(db);
  return record;
}

async function listGenerationResults(jobId: string, userId?: string): Promise<GenerationResult[]> {
  const db = await readDatabase();
  return db.generationResults
    .filter(result => result.jobId === jobId && (!userId || result.userId === userId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function createGenerationResult(input: CreateGenerationResultInput): Promise<GenerationResult | null> {
  const db = await readDatabase();
  const project = db.projects.find(item => item.id === input.projectId && item.userId === input.userId && !item.deletedAt);
  const job = db.generationJobs.find(item => item.id === input.jobId && item.userId === input.userId);

  if (!project || !job) {
    return null;
  }
  if (input.resultKey) {
    const existing = db.generationResults.find(item => item.jobId === input.jobId && item.resultKey === input.resultKey);
    if (existing) return existing;
  }

  const now = new Date().toISOString();
  const result: GenerationResult = {
    id: `result_${randomUUID()}`,
    userId: input.userId,
    projectId: input.projectId,
    jobId: input.jobId,
    assetId: input.assetId,
    imageUrl: input.imageUrl,
    isSelected: input.isSelected ?? false,
    isFavorite: input.isFavorite ?? false,
    resultKey: input.resultKey ?? null,
    metadata: input.metadata,
    createdAt: now,
    updatedAt: now,
  };

  if (result.isSelected) {
    for (const item of db.generationResults) {
      if (item.jobId === input.jobId && item.userId === input.userId) {
        item.isSelected = false;
        item.updatedAt = now;
      }
    }
  }

  db.generationResults.unshift(result);
  await writeDatabase(db);
  return result;
}

async function updateGenerationResult(id: string, userId: string, input: UpdateGenerationResultInput): Promise<GenerationResult | null> {
  const db = await readDatabase();
  const result = db.generationResults.find(item => item.id === id && item.userId === userId);

  if (!result) {
    return null;
  }

  const now = new Date().toISOString();
  if (input.isSelected !== undefined) {
    if (input.isSelected) {
      for (const item of db.generationResults) {
        if (item.jobId === result.jobId && item.userId === userId) {
          item.isSelected = false;
          item.updatedAt = now;
        }
      }
    }
    result.isSelected = input.isSelected;
  }
  if (input.isFavorite !== undefined) result.isFavorite = input.isFavorite;
  if (input.metadata !== undefined) {
    result.metadata = {
      ...(result.metadata || {}),
      ...input.metadata,
    };
  }
  result.updatedAt = now;

  await writeDatabase(db);
  return result;
}

async function createGenerationJob(input: CreateGenerationJobInput): Promise<GenerationJob | null> {
  const db = await readDatabase();
  if (input.idempotencyKey) {
    const existing = db.generationJobs.find(item => item.userId === input.userId && item.idempotencyKey === input.idempotencyKey);
    if (existing) return existing;
  }
  const project = db.projects.find(item => item.id === input.projectId && item.userId === input.userId && !item.deletedAt);

  if (!project) {
    return null;
  }

  const now = new Date().toISOString();
  const step = input.step ?? readGenerationJobStep(input.config) ?? null;
  const job: GenerationJob = {
    id: `job_${randomUUID()}`,
    userId: input.userId,
    projectId: input.projectId,
    mode: input.mode,
    step,
    prompt: input.prompt,
    config: step && input.config.step === undefined ? { ...input.config, step } : input.config,
    inputAssetIds: input.inputAssetIds,
    status: 'queued',
    progress: 0,
    provider: input.provider,
    outputAssetId: null,
    outputAssetIds: [],
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
    creditCost: input.creditCost ?? 0,
    creditRefunded: false,
    failureReason: null,
    idempotencyKey: input.idempotencyKey ?? null,
    attemptCount: 0,
    maxAttempts: Math.max(1, input.maxAttempts ?? readPositiveInteger(process.env.GENERATION_JOB_MAX_ATTEMPTS, 3)),
    nextAttemptAt: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
    executionTimeoutAt: null,
    providerStartedAt: null,
    providerFinishedAt: null,
    providerDurationMs: null,
    lastErrorCode: null,
    lastErrorCategory: null,
    lastErrorRetryable: null,
    diagnostics: {
      phase: 'queued',
      timing: { jobCreatedAt: now },
    },
  };

  db.generationJobs.unshift(job);
  project.updatedAt = now;
  await writeDatabase(db);
  return job;
}

async function getGenerationJob(id: string, userId?: string): Promise<GenerationJob | null> {
  const db = await readDatabase();
  return db.generationJobs.find(job => job.id === id && (!userId || job.userId === userId)) ?? null;
}

async function getGenerationJobByIdempotencyKey(userId: string, idempotencyKey: string): Promise<GenerationJob | null> {
  const db = await readDatabase();
  return db.generationJobs.find(job => job.userId === userId && job.idempotencyKey === idempotencyKey) ?? null;
}

async function listRunnableGenerationJobs(): Promise<GenerationJob[]> {
  const db = await readDatabase();
  const now = Date.now();
  return db.generationJobs
    .filter(job => (
      job.status === 'queued'
        ? !job.nextAttemptAt || new Date(job.nextAttemptAt).getTime() <= now
        : job.status === 'running' && (!job.leaseExpiresAt || new Date(job.leaseExpiresAt).getTime() <= now)
    ))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function claimGenerationJob(input: ClaimGenerationJobInput): Promise<GenerationJob | null> {
  return runAtomicMutation(() => claimGenerationJobInternal(input));
}

async function claimGenerationJobInternal(input: ClaimGenerationJobInput): Promise<GenerationJob | null> {
  const db = await readDatabase();
  const now = new Date();
  const job = db.generationJobs
    .filter(item => (
      (!input.preferredJobId || item.id === input.preferredJobId)
      && (
        (item.status === 'queued'
          && item.attemptCount < item.maxAttempts
          && (!item.nextAttemptAt || new Date(item.nextAttemptAt).getTime() <= now.getTime()))
        || (item.status === 'running'
          && item.attemptCount <= item.maxAttempts
          && (!item.leaseExpiresAt || new Date(item.leaseExpiresAt).getTime() <= now.getTime()))
      )
    ))
    .sort((a, b) => {
      if (input.preferredJobId) {
        if (a.id === input.preferredJobId) return -1;
        if (b.id === input.preferredJobId) return 1;
      }
      return a.createdAt.localeCompare(b.createdAt);
    })[0];
  if (!job) return null;

  job.status = 'running';
  job.attemptCount += 1;
  job.leaseOwner = input.workerId;
  job.leaseExpiresAt = new Date(now.getTime() + input.leaseDurationMs).toISOString();
  job.heartbeatAt = now.toISOString();
  job.executionTimeoutAt = new Date(now.getTime() + input.executionTimeoutMs).toISOString();
  job.startedAt = job.startedAt || now.toISOString();
  job.nextAttemptAt = null;
  job.finishedAt = null;
  job.updatedAt = now.toISOString();
  await writeDatabase(db);
  return job;
}

function renewGenerationJobLease(id: string, workerId: string, leaseDurationMs: number): Promise<boolean> {
  return runAtomicMutation(() => renewGenerationJobLeaseInternal(id, workerId, leaseDurationMs));
}

async function renewGenerationJobLeaseInternal(id: string, workerId: string, leaseDurationMs: number): Promise<boolean> {
  const db = await readDatabase();
  const job = db.generationJobs.find(item => item.id === id && item.status === 'running' && item.leaseOwner === workerId);
  if (!job) return false;
  const now = new Date();
  job.heartbeatAt = now.toISOString();
  job.leaseExpiresAt = new Date(now.getTime() + leaseDurationMs).toISOString();
  job.updatedAt = now.toISOString();
  await writeDatabase(db);
  return true;
}

function updateGenerationJobWithLease(
  id: string,
  workerId: string,
  input: UpdateGenerationJobInput,
): Promise<GenerationJob | null> {
  return runAtomicMutation(() => updateGenerationJobWithLeaseInternal(id, workerId, input));
}

async function updateGenerationJobWithLeaseInternal(
  id: string,
  workerId: string,
  input: UpdateGenerationJobInput,
): Promise<GenerationJob | null> {
  const db = await readDatabase();
  const job = db.generationJobs.find(item => item.id === id && item.leaseOwner === workerId);
  if (!job) return null;
  applyGenerationJobUpdate(job, input);
  await writeDatabase(db);
  return job;
}

async function updateGenerationJob(
  id: string,
  input: UpdateGenerationJobInput,
): Promise<GenerationJob | null> {
  const db = await readDatabase();
  const job = db.generationJobs.find(item => item.id === id);

  if (!job) {
    return null;
  }

  applyGenerationJobUpdate(job, input);
  await writeDatabase(db);
  return job;
}

function applyGenerationJobUpdate(job: GenerationJob, input: UpdateGenerationJobInput): void {
  if (input.status !== undefined) job.status = input.status;
  if (input.progress !== undefined) job.progress = input.progress;
  if (input.outputAssetId !== undefined) job.outputAssetId = input.outputAssetId;
  if (input.outputAssetIds !== undefined) job.outputAssetIds = input.outputAssetIds;
  if (input.errorMessage !== undefined) job.errorMessage = input.errorMessage;
  if (input.startedAt !== undefined) job.startedAt = input.startedAt;
  if (input.finishedAt !== undefined) job.finishedAt = input.finishedAt;
  if (input.creditCost !== undefined) job.creditCost = input.creditCost;
  if (input.creditRefunded !== undefined) job.creditRefunded = input.creditRefunded;
  if (input.failureReason !== undefined) job.failureReason = input.failureReason;
  if (input.attemptCount !== undefined) job.attemptCount = input.attemptCount;
  if (input.maxAttempts !== undefined) job.maxAttempts = input.maxAttempts;
  if (input.nextAttemptAt !== undefined) job.nextAttemptAt = input.nextAttemptAt;
  if (input.leaseOwner !== undefined) job.leaseOwner = input.leaseOwner;
  if (input.leaseExpiresAt !== undefined) job.leaseExpiresAt = input.leaseExpiresAt;
  if (input.heartbeatAt !== undefined) job.heartbeatAt = input.heartbeatAt;
  if (input.executionTimeoutAt !== undefined) job.executionTimeoutAt = input.executionTimeoutAt;
  if (input.providerStartedAt !== undefined) job.providerStartedAt = input.providerStartedAt;
  if (input.providerFinishedAt !== undefined) job.providerFinishedAt = input.providerFinishedAt;
  if (input.providerDurationMs !== undefined) job.providerDurationMs = input.providerDurationMs;
  if (input.lastErrorCode !== undefined) job.lastErrorCode = input.lastErrorCode;
  if (input.lastErrorCategory !== undefined) job.lastErrorCategory = input.lastErrorCategory;
  if (input.lastErrorRetryable !== undefined) job.lastErrorRetryable = input.lastErrorRetryable;
  if (input.diagnostics !== undefined) job.diagnostics = input.diagnostics;
  job.updatedAt = new Date().toISOString();
}

async function cancelGenerationJob(id: string, userId?: string): Promise<GenerationJob | null> {
  const db = await readDatabase();
  const job = db.generationJobs.find(item => item.id === id && (!userId || item.userId === userId));

  if (!job) {
    return null;
  }

  if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled' || job.status === 'timeout') {
    return job;
  }

  const now = new Date().toISOString();
  job.status = 'cancelled';
  job.progress = Math.min(job.progress, 99);
  job.failureReason = 'cancelled';
  job.leaseOwner = null;
  job.leaseExpiresAt = null;
  job.heartbeatAt = null;
  job.updatedAt = now;
  job.finishedAt = now;
  await writeDatabase(db);
  return job;
}

async function createImageAsset(input: {
  userId: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}): Promise<ImageAsset> {
  const now = new Date().toISOString();
  const asset: ImageAsset = {
    id: `image_${randomUUID()}`,
    userId: input.userId,
    url: input.url,
    publicUrl: input.url,
    thumbnailUrl: input.url,
    path: input.filename,
    storageProvider: input.url.startsWith('/uploads/') ? 'local' : 'supabase',
    filename: input.filename,
    mimeType: input.mimeType,
    size: input.size,
    createdAt: now,
  };

  const db = await readDatabase();
  db.imageAssets.unshift(asset);
  await writeDatabase(db);
  return asset;
}

async function getImageAsset(id: string, userId?: string): Promise<ImageAsset | null> {
  const db = await readDatabase();
  return db.imageAssets.find(asset => asset.id === id && (!userId || asset.userId === userId)) ?? null;
}

async function createDesignWorkflow(input: CreateDesignWorkflowInput): Promise<DesignWorkflow> {
  const db = await readDatabase();
  const now = new Date().toISOString();
  const workflow: DesignWorkflow = {
    id: `design_workflow_${randomUUID()}`,
    userId: input.userId,
    projectId: input.projectId,
    title: input.title,
    status: 'active',
    currentNodeId: null,
    createdAt: now,
    updatedAt: now,
  };
  db.designWorkflows.unshift(workflow);
  await writeDatabase(db);
  return workflow;
}

async function getActiveDesignWorkflow(projectId: string, userId: string) {
  const db = await readDatabase();
  return db.designWorkflows
    .filter(item => item.projectId === projectId && item.userId === userId && item.status !== 'archived')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] || null;
}

async function getDesignWorkflow(id: string, projectId: string, userId: string) {
  const db = await readDatabase();
  return db.designWorkflows.find(item => (
    item.id === id && item.projectId === projectId && item.userId === userId
  )) || null;
}

async function updateDesignWorkflow(
  id: string,
  projectId: string,
  userId: string,
  input: UpdateDesignWorkflowInput,
) {
  const db = await readDatabase();
  const workflow = db.designWorkflows.find(item => (
    item.id === id && item.projectId === projectId && item.userId === userId
  ));
  if (!workflow) return null;
  Object.assign(workflow, input, { updatedAt: new Date().toISOString() });
  await writeDatabase(db);
  return workflow;
}

async function listDesignWorkflowNodes(workflowId: string, projectId: string, userId: string) {
  const workflow = await getDesignWorkflow(workflowId, projectId, userId);
  if (!workflow) return [];
  const db = await readDatabase();
  return db.designWorkflowNodes
    .filter(node => node.workflowId === workflowId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function getDesignWorkflowNode(
  id: string,
  workflowId: string,
  projectId: string,
  userId: string,
) {
  const nodes = await listDesignWorkflowNodes(workflowId, projectId, userId);
  return nodes.find(node => node.id === id) || null;
}

async function createDesignWorkflowNode(
  input: CreateDesignWorkflowNodeInput,
): Promise<DesignWorkflowNode> {
  const db = await readDatabase();
  const now = new Date().toISOString();
  const node: DesignWorkflowNode = {
    ...input,
    id: `design_workflow_node_${randomUUID()}`,
    createdAt: now,
    updatedAt: now,
  };
  db.designWorkflowNodes.push(node);
  await writeDatabase(db);
  return node;
}

async function updateDesignWorkflowNode(id: string, input: UpdateDesignWorkflowNodeInput) {
  const db = await readDatabase();
  const node = db.designWorkflowNodes.find(item => item.id === id);
  if (!node) return null;
  Object.assign(node, input, {
    metadata: input.metadata ? { ...node.metadata, ...input.metadata } : node.metadata,
    updatedAt: new Date().toISOString(),
  });
  await writeDatabase(db);
  return node;
}

async function listImageAssets(userId: string, limit = 40): Promise<ImageAsset[]> {
  const db = await readDatabase();
  return db.imageAssets
    .filter(asset => asset.userId === userId)
    .slice(0, Math.max(1, Math.min(100, limit)));
}

async function createFloorPlanRegionSet(input: CreateFloorPlanRegionSetInput): Promise<FloorPlanRegionSet> {
  const now = new Date().toISOString();
  const item: FloorPlanRegionSet = { ...input, id: `floor_regions_${randomUUID()}`, autoRegions: input.autoRegions.length ? input.autoRegions : input.regions, status: input.status ?? 'recognized', versionNumber: input.versionNumber ?? 1, baseRegionSetId: input.baseRegionSetId ?? null, lockedAt: input.lockedAt ?? null, confirmedAt: input.confirmedAt ?? null, createdAt: now, updatedAt: now };
  const db = await readDatabase();
  db.floorPlanRegionSets.unshift(item);
  await writeDatabase(db);
  return item;
}

async function getFloorPlanRegionSet(id: string, userId: string): Promise<FloorPlanRegionSet | null> {
  const db = await readDatabase();
  return db.floorPlanRegionSets.find(item => item.id === id && item.userId === userId) || null;
}

async function getLatestFloorPlanRegionSet(sourceAssetId: string, userId: string): Promise<FloorPlanRegionSet | null> {
  const db = await readDatabase();
  return db.floorPlanRegionSets
    .filter(item => item.sourceAssetId === sourceAssetId && item.userId === userId)
    .sort((a, b) => b.versionNumber - a.versionNumber || b.updatedAt.localeCompare(a.updatedAt))[0] || null;
}

async function updateFloorPlanRegionSet(id: string, userId: string, input: { regions?: FloorPlanRegion[]; autoRegions?: FloorPlanRegion[]; overlayAssetId?: string | null; overlayUrl?: string | null; status?: FloorPlanRegionSet['status']; confirmedAt?: string | null; lockedAt?: string | null }): Promise<FloorPlanRegionSet | null> {
  const db = await readDatabase();
  const item = db.floorPlanRegionSets.find(candidate => candidate.id === id && candidate.userId === userId);
  if (!item) return null;
  if (input.regions) item.regions = input.regions;
  if (input.autoRegions) item.autoRegions = input.autoRegions;
  if (input.overlayAssetId !== undefined) item.overlayAssetId = input.overlayAssetId;
  if (input.overlayUrl !== undefined) item.overlayUrl = input.overlayUrl;
  if (input.status) item.status = input.status;
  if (input.confirmedAt !== undefined) item.confirmedAt = input.confirmedAt;
  if (input.lockedAt !== undefined) item.lockedAt = input.lockedAt;
  item.updatedAt = new Date().toISOString();
  await writeDatabase(db);
  return item;
}

async function listFloorPlanRegionMaterials(regionSetId: string, userId: string): Promise<FloorPlanRegionMaterial[]> {
  const db = await readDatabase();
  return db.floorPlanRegionMaterials
    .filter(material => material.regionSetId === regionSetId && material.userId === userId)
    .map(material => ({
      ...material,
      materialUrl: material.materialAssetId
        ? db.imageAssets.find(asset => asset.id === material.materialAssetId && asset.userId === userId)?.url || null
        : null,
    }));
}

async function saveFloorPlanRegionMaterials(regionSetId: string, userId: string, materials: SaveFloorPlanRegionMaterialInput[]): Promise<FloorPlanRegionMaterial[]> {
  const db = await readDatabase();
  const now = new Date().toISOString();
  const existing = new Map(
    db.floorPlanRegionMaterials
      .filter(material => material.regionSetId === regionSetId && material.userId === userId)
      .map(material => [material.regionId, material]),
  );
  const saved = materials.map(input => {
    const previous = existing.get(input.regionId);
    const materialUrl = input.materialAssetId
      ? db.imageAssets.find(asset => asset.id === input.materialAssetId && asset.userId === userId)?.url || null
      : null;
    return {
      id: previous?.id || `floor_material_${randomUUID()}`,
      userId,
      regionSetId,
      ...input,
      materialUrl,
      createdAt: previous?.createdAt || now,
      updatedAt: now,
    } satisfies FloorPlanRegionMaterial;
  });
  db.floorPlanRegionMaterials = [
    ...db.floorPlanRegionMaterials.filter(material => material.regionSetId !== regionSetId || material.userId !== userId),
    ...saved,
  ];
  await writeDatabase(db);
  return saved;
}

async function createEditSession(input: CreateEditSessionInput, sourceAsset: ImageAsset): Promise<{ session: EditSession; version: AssetVersion }> {
  const db = await readDatabase();
  const now = new Date().toISOString();
  const sessionId = `edit_session_${randomUUID()}`;
  const versionId = `asset_version_${randomUUID()}`;
  const version: AssetVersion = {
    id: versionId, assetId: sourceAsset.id, sessionId, parentVersionId: null, restoredFromVersionId: null, versionNumber: 0,
    displayName: '原图', note: '',
    storagePath: sourceAsset.path || sourceAsset.filename, publicUrl: sourceAsset.publicUrl || sourceAsset.url,
    userInstruction: '', compiledPrompt: '', provider: null, model: null, generationJobId: null,
    createdBy: input.userId, createdAt: now, exportedAt: null,
  };
  const session: EditSession = {
    id: sessionId, userId: input.userId, projectId: input.projectId, sourceAssetId: input.sourceAssetId,
    originalVersionId: versionId, currentVersionId: versionId, primaryVersionId: null, finalVersionId: null, title: input.title,
    permanentConstraints: input.permanentConstraints, aspectRatio: input.aspectRatio, status: 'active', createdAt: now, updatedAt: now,
  };
  db.editSessions.unshift(session); db.assetVersions.push(version); await writeDatabase(db);
  return { session, version };
}

async function listEditSessions(userId: string, projectId?: string | null) {
  const db = await readDatabase();
  return db.editSessions
    .filter(item => item.userId === userId && (!projectId || item.projectId === projectId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
async function getEditSession(id: string, userId: string) { const db = await readDatabase(); return db.editSessions.find(item => item.id === id && item.userId === userId) || null; }
async function updateEditSession(id: string, userId: string, input: Partial<Pick<EditSession, 'currentVersionId' | 'primaryVersionId' | 'finalVersionId' | 'status' | 'title'>>) {
  const db = await readDatabase(); const item = db.editSessions.find(value => value.id === id && value.userId === userId); if (!item) return null;
  Object.assign(item, input, { updatedAt: new Date().toISOString() }); await writeDatabase(db); return item;
}
async function listAssetVersions(sessionId: string, userId: string) { const db = await readDatabase(); const session = db.editSessions.find(item => item.id === sessionId && item.userId === userId); return session ? db.assetVersions.filter(item => item.sessionId === sessionId).sort((a,b) => a.versionNumber-b.versionNumber) : []; }
async function getAssetVersion(id: string, sessionId: string, userId: string) { const versions = await listAssetVersions(sessionId, userId); return versions.find(item => item.id === id) || null; }
async function createAssetVersion(input: CreateAssetVersionInput) { const db = await readDatabase(); const item: AssetVersion = { ...input, id: `asset_version_${randomUUID()}`, createdAt: new Date().toISOString() }; db.assetVersions.push(item); await writeDatabase(db); return item; }
async function updateAssetVersion(id: string, sessionId: string, userId: string, input: Partial<Pick<AssetVersion, 'displayName' | 'note' | 'exportedAt'>>) {
  const db = await readDatabase();
  const session = db.editSessions.find(item => item.id === sessionId && item.userId === userId);
  if (!session) return null;
  const item = db.assetVersions.find(version => version.id === id && version.sessionId === sessionId);
  if (!item) return null;
  Object.assign(item, input);
  await writeDatabase(db);
  return item;
}
async function createEditMessage(input: CreateEditMessageInput) { const db = await readDatabase(); const existing=input.clientRequestId?db.editMessages.find(item=>item.sessionId===input.sessionId&&item.clientRequestId===input.clientRequestId):null;if(existing)return existing;const item: EditMessage = { ...input, id: `edit_message_${randomUUID()}`, outputVersionId: null, generationJobId: null, errorCode:null,errorMessage:null,createdAt: new Date().toISOString() }; db.editMessages.push(item); await writeDatabase(db); return item; }
async function getEditMessage(id: string) { const db = await readDatabase(); return db.editMessages.find(item => item.id === id) || null; }
async function getEditMessageByClientRequest(sessionId:string,clientRequestId:string){const db=await readDatabase();return db.editMessages.find(item=>item.sessionId===sessionId&&item.clientRequestId===clientRequestId)||null;}
async function listEditMessages(sessionId: string, userId: string) { const db = await readDatabase(); const session = db.editSessions.find(item => item.id === sessionId && item.userId === userId); return session ? db.editMessages.filter(item => item.sessionId === sessionId).sort((a,b) => a.createdAt.localeCompare(b.createdAt)) : []; }
async function updateEditMessage(id: string, input: Partial<Pick<EditMessage, 'outputVersionId' | 'generationJobId' | 'status' | 'errorCode' | 'errorMessage'>>) { const db = await readDatabase(); const item = db.editMessages.find(value => value.id === id); if (!item) return null; Object.assign(item, input); await writeDatabase(db); return item; }

async function listPromptTemplates(filters: PromptTemplateFilters = {}): Promise<PromptTemplateRecord[]> {
  const db = await readDatabase();
  return [...db.promptTemplates]
    .filter(template => template.isPublic !== false)
    .filter(template => matchesPromptTemplateFilters(template, filters))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

async function getPromptTemplate(id: string): Promise<PromptTemplateRecord | null> {
  const db = await readDatabase();
  return db.promptTemplates.find(template => template.id === id && template.isPublic !== false) ?? null;
}

async function createPromptTemplate(input: CreatePromptTemplateInput): Promise<PromptTemplateRecord> {
  const now = new Date().toISOString();
  const template: PromptTemplateRecord = {
    id: `prompt_template_${randomUUID()}`,
    name: input.name,
    description: input.description || '',
    generationStep: input.generationStep,
    feature: input.feature,
    featureName: input.featureName,
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    config: input.config,
    inputAssetIds: input.inputAssetIds || [],
    referenceAssetIds: input.referenceAssetIds || [],
    materialAssetIds: input.materialAssetIds || [],
    sourceAssetId: input.sourceAssetId || null,
    placementPreviewAssetId: input.placementPreviewAssetId || null,
    outputAssetId: input.outputAssetId || null,
    outputUrl: input.outputUrl,
    previewAssetId: input.previewAssetId || input.outputAssetId || null,
    tags: input.tags || [],
    isPublic: input.isPublic !== false,
    createdBy: input.createdBy,
    createdFromGenerationRecordId: input.createdFromGenerationRecordId || null,
    createdFromJobId: input.createdFromJobId || null,
    inputPreviews: input.inputPreviews || [],
    outputPreview: input.outputPreview || {},
    parameterSummary: input.parameterSummary || {},
    templateSource: input.templateSource || 'generation_result',
    coverAssetId: input.coverAssetId || input.outputAssetId || input.previewAssetId || null,
    coverUrl: input.coverUrl || input.outputUrl || null,
    createdAt: now,
    updatedAt: now,
  };

  const db = await readDatabase();
  db.promptTemplates.unshift(template);
  await writeDatabase(db);
  return template;
}

async function deletePromptTemplate(id: string): Promise<PromptTemplateRecord | null> {
  const db = await readDatabase();
  const index = db.promptTemplates.findIndex(template => template.id === id);
  if (index === -1) return null;
  const [template] = db.promptTemplates.splice(index, 1);
  await writeDatabase(db);
  return template ?? null;
}

function matchesPromptTemplateFilters(template: PromptTemplateRecord, filters: PromptTemplateFilters): boolean {
  if (filters.generationStep && template.generationStep !== filters.generationStep) return false;
  if (filters.tag && !template.tags.some(tag => tag.toLowerCase() === filters.tag?.toLowerCase())) return false;
  if (filters.search) {
    const keyword = filters.search.toLowerCase();
    const text = [
      template.name,
      template.description,
      template.featureName,
      template.prompt,
      template.tags.join(' '),
    ].join(' ').toLowerCase();
    if (!text.includes(keyword)) return false;
  }
  return true;
}

async function listModelAssets(userId: string): Promise<ModelAsset[]> {
  const db = await readDatabase();
  return db.modelAssets.filter(asset => asset.userId === userId && !asset.deletedAt);
}

async function getModelAsset(id: string, userId?: string): Promise<ModelAsset | null> {
  const db = await readDatabase();
  return db.modelAssets.find(asset => asset.id === id && (!userId || asset.userId === userId) && !asset.deletedAt) ?? null;
}

async function createModelAsset(input: {
  userId: string;
  url: string;
  previewUrl?: string;
  optimizedUrl?: string;
  thumbnailUrl?: string;
  filename: string;
  originalFilename: string;
  fileType: ModelAsset['fileType'];
  mimeType: string;
  size: number;
  metadata?: ModelAsset['metadata'];
}): Promise<ModelAsset> {
  const now = new Date().toISOString();
  const asset: ModelAsset = {
    id: `model_${randomUUID()}`,
    userId: input.userId,
    url: input.url,
    originalUrl: input.url,
    conversionStatus: input.fileType === 'obj' || input.fileType === 'dae' || input.fileType === 'zip' ? 'idle' : undefined,
    previewUrl: input.previewUrl,
    optimizedUrl: input.optimizedUrl,
    thumbnailUrl: input.thumbnailUrl,
    filename: input.filename,
    originalFilename: input.originalFilename,
    fileType: input.fileType,
    format: input.fileType,
    mimeType: input.mimeType,
    size: input.size,
    metadata: input.metadata,
    createdAt: now,
    deletedAt: null,
  };

  const db = await readDatabase();
  db.modelAssets.unshift(asset);
  await writeDatabase(db);
  return asset;
}

async function updateModelAsset(id: string, input: UpdateModelAssetInput): Promise<ModelAsset | null> {
  const db = await readDatabase();
  const asset = db.modelAssets.find(item => item.id === id && !item.deletedAt);
  if (!asset) return null;

  if (input.previewUrl !== undefined) asset.previewUrl = input.previewUrl;
  if (input.originalUrl !== undefined) asset.originalUrl = input.originalUrl;
  if (input.convertedUrl !== undefined) asset.convertedUrl = input.convertedUrl;
  if (input.convertedFormat !== undefined) asset.convertedFormat = input.convertedFormat;
  if (input.conversionStatus !== undefined) asset.conversionStatus = input.conversionStatus;
  if (input.conversionError !== undefined) asset.conversionError = input.conversionError;
  if (input.convertedAt !== undefined) asset.convertedAt = input.convertedAt;
  if (input.optimizedUrl !== undefined) asset.optimizedUrl = input.optimizedUrl;
  if (input.thumbnailUrl !== undefined) asset.thumbnailUrl = input.thumbnailUrl;
  if (input.metadata !== undefined) asset.metadata = input.metadata;

  await writeDatabase(db);
  return asset;
}

async function deleteModelAsset(id: string, userId: string): Promise<ModelAsset | null> {
  const db = await readDatabase();
  const asset = db.modelAssets.find(item => item.id === id && item.userId === userId && !item.deletedAt);

  if (!asset) {
    return null;
  }

  asset.deletedAt = new Date().toISOString();
  await writeDatabase(db);
  return asset;
}

async function createShareLink(input: CreateShareLinkInput): Promise<ShareLink | null> {
  const db = await readDatabase();
  const project = db.projects.find(item => item.id === input.projectId && item.userId === input.userId && !item.deletedAt);

  if (!project) {
    return null;
  }

  const now = new Date().toISOString();
  const shareLink: ShareLink = {
    id: `share_${randomUUID()}`,
    projectId: input.projectId,
    token: input.token,
    permission: 'view',
    expiresAt: input.expiresAt,
    createdAt: now,
    revokedAt: null,
  };

  db.shareLinks.unshift(shareLink);
  await writeDatabase(db);
  return shareLink;
}

async function listProjectShareLinks(projectId: string, userId: string): Promise<ShareLink[]> {
  const db = await readDatabase();
  const project = db.projects.find(item => (
    item.id === projectId && item.userId === userId && !item.deletedAt
  ));
  if (!project) return [];
  return db.shareLinks
    .filter(link => link.projectId === projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function getShareLinkByToken(token: string): Promise<ShareLink | null> {
  const db = await readDatabase();
  return db.shareLinks.find(link => link.token === token) ?? null;
}

async function revokeShareLink(projectId: string, userId: string, shareLinkId: string): Promise<ShareLink | null> {
  const db = await readDatabase();
  const project = db.projects.find(item => item.id === projectId && item.userId === userId && !item.deletedAt);
  if (!project) {
    return null;
  }

  const shareLink = db.shareLinks.find(item => item.id === shareLinkId && item.projectId === projectId);
  if (!shareLink) {
    return null;
  }

  shareLink.revokedAt = shareLink.revokedAt || new Date().toISOString();
  await writeDatabase(db);
  return shareLink;
}

async function getCreditBalance(userId: string): Promise<CreditBalance> {
  const db = await readDatabase();
  const balance = ensureCreditBalance(db, userId);
  await writeDatabase(db);
  return balance;
}

async function listCreditTransactions(userId: string): Promise<CreditTransaction[]> {
  const db = await readDatabase();
  ensureCreditBalance(db, userId);
  await writeDatabase(db);
  return db.creditTransactions
    .filter(transaction => transaction.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function adjustCredits(input: CreditTransactionInput): Promise<{ balance: CreditBalance; transaction: CreditTransaction } | null> {
  const db = await readDatabase();
  const balance = ensureCreditBalance(db, input.userId);

  if (input.referenceId) {
    const existingTransaction = db.creditTransactions.find(transaction => (
      transaction.userId === input.userId &&
      transaction.type === input.type &&
      transaction.referenceId === input.referenceId
    ));

    if (existingTransaction) {
      await writeDatabase(db);
      return { balance, transaction: existingTransaction };
    }
  }

  const nextBalance = balance.balance + input.amount;

  if (nextBalance < 0) {
    await writeDatabase(db);
    return null;
  }

  const now = new Date().toISOString();
  balance.balance = nextBalance;
  balance.updatedAt = now;

  const transaction: CreditTransaction = {
    id: `credit_tx_${randomUUID()}`,
    userId: input.userId,
    type: input.type,
    amount: input.amount,
    balanceAfter: nextBalance,
    reason: input.reason,
    referenceType: input.referenceType ?? null,
    referenceId: input.referenceId ?? null,
    createdAt: now,
  };

  db.creditTransactions.unshift(transaction);
  await writeDatabase(db);
  return { balance, transaction };
}

async function getCreditTransactionByReference(
  userId: string,
  type: CreditTransaction['type'],
  referenceId: string,
): Promise<CreditTransaction | null> {
  const db = await readDatabase();
  return db.creditTransactions.find(transaction => (
    transaction.userId === userId &&
    transaction.type === type &&
    transaction.referenceId === referenceId
  )) ?? null;
}

function refundGenerationJobOnce(jobId: string): Promise<boolean> {
  return runAtomicMutation(() => refundGenerationJobOnceInternal(jobId));
}

async function refundGenerationJobOnceInternal(jobId: string): Promise<boolean> {
  const db = await readDatabase();
  const job = db.generationJobs.find(item => item.id === jobId);
  if (!job || !isRefundableStatus(job.status)) return false;

  const existingRefund = db.creditTransactions.find(transaction => (
    transaction.userId === job.userId
    && (transaction.type === 'generate_refund' || transaction.type === 'refund')
    && transaction.referenceId === job.id
  ));
  if (existingRefund) {
    job.creditRefunded = true;
    job.updatedAt = new Date().toISOString();
    await writeDatabase(db);
    return false;
  }

  const debit = db.creditTransactions.find(transaction => (
    transaction.userId === job.userId
    && (transaction.type === 'generate_charge' || transaction.type === 'debit')
    && transaction.referenceId === job.id
    && transaction.amount < 0
  ));
  if (!debit) return false;

  const balance = ensureCreditBalance(db, job.userId);
  const now = new Date().toISOString();
  balance.balance += Math.abs(debit.amount);
  balance.updatedAt = now;
  db.creditTransactions.unshift({
    id: `credit_tx_${randomUUID()}`,
    userId: job.userId,
    type: 'generate_refund',
    amount: Math.abs(debit.amount),
    balanceAfter: balance.balance,
    reason: `Refund generation job ${job.mode}: ${job.failureReason || job.errorMessage || job.status}`,
    referenceType: 'generation_job',
    referenceId: job.id,
    createdAt: now,
  });
  job.creditRefunded = true;
  job.updatedAt = now;
  await writeDatabase(db);
  return true;
}

function ensureCreditBalance(db: AppDatabase, userId: string): CreditBalance {
  let balance = db.creditBalances.find(item => item.userId === userId);
  if (balance) {
    return balance;
  }

  const now = new Date().toISOString();
  const initialCredits = userId === DEV_AUTH_USER_ID ? 1000 : 0;
  balance = {
    userId,
    balance: initialCredits,
    updatedAt: now,
  };
  db.creditBalances.push(balance);

  if (initialCredits > 0) {
    db.creditTransactions.unshift({
      id: `credit_tx_${randomUUID()}`,
      userId,
      type: 'admin_grant',
      amount: initialCredits,
      balanceAfter: initialCredits,
      reason: 'Development user initial credits',
      referenceType: 'system',
      referenceId: 'dev_initial_credits',
      createdAt: now,
    });
  }

  return balance;
}

async function getAdminDashboard(): Promise<AdminDashboard> {
  const db = await readDatabase();
  const userIds = new Set<string>();

  for (const profile of db.profiles) userIds.add(profile.id);
  for (const project of db.projects) userIds.add(project.userId);
  for (const job of db.generationJobs) userIds.add(job.userId);
  for (const asset of db.imageAssets) userIds.add(asset.userId);
  for (const asset of db.modelAssets) userIds.add(asset.userId);
  for (const balance of db.creditBalances) userIds.add(balance.userId);
  for (const transaction of db.creditTransactions) userIds.add(transaction.userId);

  const recentJobs = [...db.generationJobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
  const recentErrorJobs = db.generationJobs
    .filter(job => job.status === 'failed' || job.status === 'timeout')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 20);
  const now = Date.now();
  const providerDurations = db.generationJobs
    .map(job => job.providerDurationMs)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0);

  return {
    stats: {
      userCount: userIds.size,
      projectCount: db.projects.filter(project => !project.deletedAt).length,
      generationJobCount: db.generationJobs.length,
      succeededJobCount: db.generationJobs.filter(job => job.status === 'succeeded').length,
      failedJobCount: db.generationJobs.filter(job => job.status === 'failed' || job.status === 'timeout').length,
      totalCreditsConsumed: db.creditTransactions.reduce((total, transaction) => {
        if (transaction.type === 'generate_charge' || transaction.type === 'debit') return total + Math.abs(transaction.amount);
        if (transaction.type === 'generate_refund' || transaction.type === 'refund') return total - Math.abs(transaction.amount);
        return total;
      }, 0),
      queuedJobCount: db.generationJobs.filter(job => job.status === 'queued').length,
      runningJobCount: db.generationJobs.filter(job => job.status === 'running').length,
      retryingJobCount: db.generationJobs.filter(job => job.status === 'queued' && job.attemptCount > 0).length,
      expiredLeaseJobCount: db.generationJobs.filter(job => (
        job.status === 'running' && (!job.leaseExpiresAt || new Date(job.leaseExpiresAt).getTime() <= now)
      )).length,
      leasedJobCount: db.generationJobs.filter(job => job.status === 'running' && Boolean(job.leaseOwner)).length,
      averageProviderDurationMs: providerDurations.length > 0
        ? Math.round(providerDurations.reduce((sum, value) => sum + value, 0) / providerDurations.length)
        : 0,
    },
    recentJobs,
    recentErrorJobs,
  };
}

async function readDatabase(): Promise<AppDatabase> {
  await ensureAppDatabase();
  await writeQueue.catch(() => undefined);
  const content = await readFile(dbPath, 'utf8');
  const parsed = JSON.parse(content) as Partial<AppDatabase>;

  return {
    profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
    projects: normalizeUserScopedItems(Array.isArray(parsed.projects) ? parsed.projects : []),
    generationRecords: normalizeUserScopedItems(Array.isArray(parsed.generationRecords) ? parsed.generationRecords : []),
    generationResults: normalizeUserScopedItems(Array.isArray(parsed.generationResults) ? parsed.generationResults : []),
    generationJobs: normalizeGenerationJobs(normalizeUserScopedItems(Array.isArray(parsed.generationJobs) ? parsed.generationJobs : [])),
    imageAssets: normalizeUserScopedItems(Array.isArray(parsed.imageAssets) ? parsed.imageAssets : []),
    promptTemplates: normalizePromptTemplates(Array.isArray(parsed.promptTemplates) ? parsed.promptTemplates : []),
    modelAssets: normalizeUserScopedItems(Array.isArray(parsed.modelAssets) ? parsed.modelAssets : []),
    shareLinks: Array.isArray(parsed.shareLinks) ? parsed.shareLinks : [],
    creditBalances: Array.isArray(parsed.creditBalances) ? parsed.creditBalances : [],
    creditTransactions: Array.isArray(parsed.creditTransactions) ? parsed.creditTransactions : [],
    editSessions: Array.isArray(parsed.editSessions) ? parsed.editSessions : [],
    editMessages: Array.isArray(parsed.editMessages) ? parsed.editMessages.map(message=>({...message,clientRequestId:message.clientRequestId||null,errorCode:message.errorCode||null,errorMessage:message.errorMessage||null})) : [],
    assetVersions: Array.isArray(parsed.assetVersions) ? parsed.assetVersions : [],
    floorPlanRegionSets: normalizeFloorPlanRegionSets(Array.isArray(parsed.floorPlanRegionSets) ? parsed.floorPlanRegionSets : []),
    floorPlanRegionMaterials: Array.isArray(parsed.floorPlanRegionMaterials) ? parsed.floorPlanRegionMaterials : [],
    designWorkflows: Array.isArray(parsed.designWorkflows) ? parsed.designWorkflows : [],
    designWorkflowNodes: Array.isArray(parsed.designWorkflowNodes) ? parsed.designWorkflowNodes : [],
  };
}

function normalizeFloorPlanRegionSets(items: FloorPlanRegionSet[]): FloorPlanRegionSet[] {
  return items.map(item => ({
    ...item,
    regions: Array.isArray(item.regions) ? item.regions.map(normalizeFloorPlanRegion) : [],
    autoRegions: Array.isArray(item.autoRegions) && item.autoRegions.length ? item.autoRegions.map(normalizeFloorPlanRegion) : (Array.isArray(item.regions) ? item.regions.map(normalizeFloorPlanRegion) : []),
    versionNumber: typeof item.versionNumber === 'number' ? item.versionNumber : 1,
    baseRegionSetId: item.baseRegionSetId ?? null,
    lockedAt: item.lockedAt ?? null,
    confirmedAt: item.confirmedAt ?? null,
  }));
}

function normalizeFloorPlanRegion(region: FloorPlanRegion): FloorPlanRegion {
  return {
    ...region,
    polygon: Array.isArray(region.polygon) ? region.polygon : [],
    name: typeof region.name === 'string' ? region.name : '',
    suggestedName: region.suggestedName ?? null,
    maskAssetId: region.maskAssetId ?? null,
    maskUrl: region.maskUrl ?? null,
  };
}

function normalizePromptTemplates(items: PromptTemplateRecord[]): PromptTemplateRecord[] {
  return items.map(item => ({
    ...item,
    description: item.description || '',
    inputAssetIds: Array.isArray(item.inputAssetIds) ? item.inputAssetIds : [],
    referenceAssetIds: Array.isArray(item.referenceAssetIds) ? item.referenceAssetIds : [],
    materialAssetIds: Array.isArray(item.materialAssetIds) ? item.materialAssetIds : [],
    sourceAssetId: item.sourceAssetId || null,
    placementPreviewAssetId: item.placementPreviewAssetId || null,
    outputAssetId: item.outputAssetId || null,
    outputUrl: item.outputUrl || '',
    previewAssetId: item.previewAssetId || item.outputAssetId || null,
    tags: Array.isArray(item.tags) ? item.tags : [],
    isPublic: item.isPublic !== false,
    createdFromGenerationRecordId: item.createdFromGenerationRecordId || null,
    createdFromJobId: item.createdFromJobId || null,
    inputPreviews: Array.isArray(item.inputPreviews) ? item.inputPreviews : [],
    outputPreview: isPlainObject(item.outputPreview) ? item.outputPreview : {},
    parameterSummary: isPlainObject(item.parameterSummary) ? item.parameterSummary : {},
    templateSource: item.templateSource || 'generation_result',
    coverAssetId: item.coverAssetId || item.outputAssetId || item.previewAssetId || null,
    coverUrl: item.coverUrl || item.outputUrl || null,
    updatedAt: item.updatedAt || item.createdAt,
  })).filter(item => item.outputUrl);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeUserScopedItems<T extends { userId?: string }>(items: T[]): Array<T & { userId: string }> {
  return items.map(item => ({ ...item, userId: item.userId || DEV_AUTH_USER_ID }));
}

function normalizeGenerationJobs(jobs: Array<GenerationJob & { userId: string }>): Array<GenerationJob & { userId: string }> {
  return jobs.map(job => ({
    ...job,
    step: job.step ?? readGenerationJobStep(job.config) ?? null,
    creditCost: typeof job.creditCost === 'number' ? job.creditCost : 0,
    creditRefunded: typeof job.creditRefunded === 'boolean' ? job.creditRefunded : false,
    failureReason: typeof job.failureReason === 'string' ? job.failureReason : null,
    idempotencyKey: typeof job.idempotencyKey === 'string' ? job.idempotencyKey : null,
    attemptCount: typeof job.attemptCount === 'number' ? job.attemptCount : 0,
    maxAttempts: typeof job.maxAttempts === 'number' ? Math.max(1, job.maxAttempts) : readPositiveInteger(process.env.GENERATION_JOB_MAX_ATTEMPTS, 3),
    nextAttemptAt: typeof job.nextAttemptAt === 'string' ? job.nextAttemptAt : null,
    leaseOwner: typeof job.leaseOwner === 'string' ? job.leaseOwner : null,
    leaseExpiresAt: typeof job.leaseExpiresAt === 'string' ? job.leaseExpiresAt : null,
    heartbeatAt: typeof job.heartbeatAt === 'string' ? job.heartbeatAt : null,
    executionTimeoutAt: typeof job.executionTimeoutAt === 'string' ? job.executionTimeoutAt : null,
    providerStartedAt: typeof job.providerStartedAt === 'string' ? job.providerStartedAt : null,
    providerFinishedAt: typeof job.providerFinishedAt === 'string' ? job.providerFinishedAt : null,
    providerDurationMs: typeof job.providerDurationMs === 'number' ? job.providerDurationMs : null,
    lastErrorCode: typeof job.lastErrorCode === 'string' ? job.lastErrorCode : null,
    lastErrorCategory: job.lastErrorCategory || null,
    lastErrorRetryable: typeof job.lastErrorRetryable === 'boolean' ? job.lastErrorRetryable : null,
  }));
}

function isRefundableStatus(status: GenerationJob['status']): boolean {
  return status === 'failed' || status === 'cancelled' || status === 'timeout';
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function runAtomicMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = atomicMutationQueue.then(operation, operation);
  atomicMutationQueue = result.then(() => undefined, () => undefined);
  return result;
}

function readGenerationJobStep(config: Record<string, unknown> | undefined): GenerationJob['step'] {
  const value = config?.step;
  if (isGenerationJobStep(value)) return value;
  return typeof config?.objectInsert === 'object' && config.objectInsert !== null && !Array.isArray(config.objectInsert)
    ? 'object_insert'
    : null;
}

function isGenerationJobStep(value: unknown): value is NonNullable<GenerationJob['step']> {
  return value === 'floorplan_to_3d'
    || value === 'style_render'
    || value === 'local_inpainting'
    || value === 'model_snapshot_render'
    || value === 'design_variants'
    || value === 'material_replace'
    || value === 'plan_colorize'
    || value === 'panorama_quick_render'
    || value === 'object_insert'
    || value === 'free_reference_image'
    || value === 'image_polish';
}

async function writeDatabase(db: AppDatabase): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    await mkdir(dataDir, { recursive: true });
    await writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
  });

  return writeQueue;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

