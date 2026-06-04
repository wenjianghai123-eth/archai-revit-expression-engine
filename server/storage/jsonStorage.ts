import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { DEV_AUTH_USER_ID } from '../auth';
import {
  AppDatabase,
  AdminDashboard,
  CreateGenerationJobInput,
  CreateGenerationRecordInput,
  CreateGenerationResultInput,
  CreateImageAssetInput,
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
  modelAssets: [],
  shareLinks: [],
  creditBalances: [],
  creditTransactions: [],
};

let writeQueue: Promise<void> = Promise.resolve();

export class JsonStorageAdapter implements StorageAdapter {
  ensureReady(): Promise<void> {
    return ensureAppDatabase();
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

  createGenerationJob(input: CreateGenerationJobInput): Promise<GenerationJob | null> {
    return createGenerationJob(input);
  }

  getGenerationJob(id: string, userId?: string): Promise<GenerationJob | null> {
    return getGenerationJob(id, userId);
  }

  listRunnableGenerationJobs(): Promise<GenerationJob[]> {
    return listRunnableGenerationJobs();
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

async function createGenerationJob(input: {
  userId: string;
  projectId: string;
  mode: GenerationJob['mode'];
  step?: GenerationJob['step'];
  prompt: string;
  config: Record<string, unknown>;
  inputAssetIds: string[];
  provider: string;
  creditCost?: number;
}): Promise<GenerationJob | null> {
  const db = await readDatabase();
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

async function listRunnableGenerationJobs(): Promise<GenerationJob[]> {
  const db = await readDatabase();
  return db.generationJobs
    .filter(job => job.status === 'queued' || job.status === 'running')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
  if (input.diagnostics !== undefined) job.diagnostics = input.diagnostics;
  job.updatedAt = new Date().toISOString();

  await writeDatabase(db);
  return job;
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
    modelAssets: normalizeUserScopedItems(Array.isArray(parsed.modelAssets) ? parsed.modelAssets : []),
    shareLinks: Array.isArray(parsed.shareLinks) ? parsed.shareLinks : [],
    creditBalances: Array.isArray(parsed.creditBalances) ? parsed.creditBalances : [],
    creditTransactions: Array.isArray(parsed.creditTransactions) ? parsed.creditTransactions : [],
  };
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
  }));
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
    || value === 'object_insert';
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

