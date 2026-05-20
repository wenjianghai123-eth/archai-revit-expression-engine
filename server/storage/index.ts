import { JsonStorageAdapter } from './jsonStorage';
import { SupabaseStorageAdapter } from './supabaseStorage';
import {
  CreateGenerationJobInput,
  AdminDashboard,
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
  GenerationJobDiagnostics,
  GenerationRecord,
  GenerationResult,
  ImageAsset,
  ModelAsset,
  ModelOptimizationMetadata,
  Project,
  ShareLink,
  StorageAdapter,
  UpdateGenerationJobInput,
  UpdateModelAssetInput,
  UpdateGenerationResultInput,
  UpdateProjectInput,
  UpdateUserProfileInput,
  UserProfile,
} from './types';

export type {
  CreateGenerationJobInput,
  AdminDashboard,
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
  GenerationJobDiagnostics,
  GenerationRecord,
  GenerationResult,
  ImageAsset,
  ModelAsset,
  ModelOptimizationMetadata,
  Project,
  ShareLink,
  StorageAdapter,
  UpdateGenerationJobInput,
  UpdateModelAssetInput,
  UpdateGenerationResultInput,
  UpdateProjectInput,
  UpdateUserProfileInput,
  UserProfile,
} from './types';

export const storageAdapter: StorageAdapter = createStorageAdapter();

function createStorageAdapter(): StorageAdapter {
  const dataBackend = process.env.DATA_BACKEND || 'json';

  if (dataBackend === 'json') {
    return new JsonStorageAdapter();
  }

  if (dataBackend === 'supabase') {
    return new SupabaseStorageAdapter();
  }

  throw new Error(`Unsupported DATA_BACKEND=${dataBackend}. Expected "json" or "supabase".`);
}

export function ensureAppDatabase(): Promise<void> {
  return storageAdapter.ensureReady();
}

export function listUserProfiles(): Promise<UserProfile[]> {
  return storageAdapter.listUserProfiles();
}

export function getUserProfile(id: string): Promise<UserProfile | null> {
  return storageAdapter.getUserProfile(id);
}

export function getUserProfileByEmail(email: string): Promise<UserProfile | null> {
  return storageAdapter.getUserProfileByEmail(email);
}

export function createUserProfile(input: CreateUserProfileInput): Promise<UserProfile> {
  return storageAdapter.createUserProfile(input);
}

export function updateUserProfile(id: string, input: UpdateUserProfileInput): Promise<UserProfile | null> {
  return storageAdapter.updateUserProfile(id, input);
}

export function listProjects(userId: string): Promise<Project[]> {
  return storageAdapter.listProjects(userId);
}

export function createProject(input: CreateProjectInput): Promise<Project> {
  return storageAdapter.createProject(input);
}

export function getProject(id: string, userId?: string): Promise<Project | null> {
  return storageAdapter.getProject(id, userId);
}

export function updateProject(id: string, userId: string, input: UpdateProjectInput): Promise<Project | null> {
  return storageAdapter.updateProject(id, userId, input);
}

export function softDeleteProject(id: string, userId: string): Promise<Project | null> {
  return storageAdapter.softDeleteProject(id, userId);
}

export function listProjectGenerations(projectId: string, userId: string): Promise<GenerationRecord[]> {
  return storageAdapter.listProjectGenerations(projectId, userId);
}

export function createGenerationRecord(input: CreateGenerationRecordInput): Promise<GenerationRecord | null> {
  return storageAdapter.createGenerationRecord(input);
}

export function listGenerationResults(jobId: string, userId?: string): Promise<GenerationResult[]> {
  return storageAdapter.listGenerationResults(jobId, userId);
}

export function createGenerationResult(input: CreateGenerationResultInput): Promise<GenerationResult | null> {
  return storageAdapter.createGenerationResult(input);
}

export function updateGenerationResult(id: string, userId: string, input: UpdateGenerationResultInput): Promise<GenerationResult | null> {
  return storageAdapter.updateGenerationResult(id, userId, input);
}

export function createGenerationJob(input: CreateGenerationJobInput): Promise<GenerationJob | null> {
  return storageAdapter.createGenerationJob(input);
}

export function getGenerationJob(id: string, userId?: string): Promise<GenerationJob | null> {
  return storageAdapter.getGenerationJob(id, userId);
}

export function listRunnableGenerationJobs(): Promise<GenerationJob[]> {
  return storageAdapter.listRunnableGenerationJobs();
}

export function updateGenerationJob(id: string, input: UpdateGenerationJobInput): Promise<GenerationJob | null> {
  return storageAdapter.updateGenerationJob(id, input);
}

export function cancelGenerationJob(id: string, userId?: string): Promise<GenerationJob | null> {
  return storageAdapter.cancelGenerationJob(id, userId);
}

export function createImageAsset(input: CreateImageAssetInput): Promise<ImageAsset> {
  return storageAdapter.createImageAsset(input);
}

export function getImageAsset(id: string, userId?: string): Promise<ImageAsset | null> {
  return storageAdapter.getImageAsset(id, userId);
}

export function listModelAssets(userId: string): Promise<ModelAsset[]> {
  return storageAdapter.listModelAssets(userId);
}

export function getModelAsset(id: string, userId?: string): Promise<ModelAsset | null> {
  return storageAdapter.getModelAsset(id, userId);
}

export function createModelAsset(input: CreateModelAssetInput): Promise<ModelAsset> {
  return storageAdapter.createModelAsset(input);
}

export function updateModelAsset(id: string, input: UpdateModelAssetInput): Promise<ModelAsset | null> {
  return storageAdapter.updateModelAsset(id, input);
}

export function deleteModelAsset(id: string, userId: string): Promise<ModelAsset | null> {
  return storageAdapter.deleteModelAsset(id, userId);
}

export function createShareLink(input: CreateShareLinkInput): Promise<ShareLink | null> {
  return storageAdapter.createShareLink(input);
}

export function getShareLinkByToken(token: string): Promise<ShareLink | null> {
  return storageAdapter.getShareLinkByToken(token);
}

export function revokeShareLink(projectId: string, userId: string, shareLinkId: string): Promise<ShareLink | null> {
  return storageAdapter.revokeShareLink(projectId, userId, shareLinkId);
}

export function getCreditBalance(userId: string): Promise<CreditBalance> {
  return storageAdapter.getCreditBalance(userId);
}

export function listCreditTransactions(userId: string): Promise<CreditTransaction[]> {
  return storageAdapter.listCreditTransactions(userId);
}

export function adjustCredits(input: CreditTransactionInput): Promise<{ balance: CreditBalance; transaction: CreditTransaction } | null> {
  return storageAdapter.adjustCredits(input);
}

export function getCreditTransactionByReference(
  userId: string,
  type: CreditTransaction['type'],
  referenceId: string,
): Promise<CreditTransaction | null> {
  return storageAdapter.getCreditTransactionByReference(userId, type, referenceId);
}

export function getAdminDashboard(): Promise<AdminDashboard> {
  return storageAdapter.getAdminDashboard();
}
