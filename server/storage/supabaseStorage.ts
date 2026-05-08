import { randomUUID } from 'node:crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
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
  GenerationJob,
  GenerationRecord,
  GenerationResult,
  ImageAsset,
  ModelAsset,
  Project,
  ShareLink,
  StorageAdapter,
  UpdateGenerationJobInput,
  UpdateGenerationResultInput,
  UpdateProjectInput,
} from './types';

type ProjectRow = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  status: Project['status'];
  cover_image_url: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type GenerationRecordRow = {
  id: string;
  user_id: string;
  project_id: string;
  job_id: string | null;
  mode: GenerationRecord['mode'];
  prompt: string;
  input_image_url: string | null;
  input_image_data_preview: string | null;
  output_image_url: string | null;
  output_image_data_preview: string | null;
  provider: string;
  status: GenerationRecord['status'];
  created_at: string;
  updated_at: string;
};

type GenerationJobRow = {
  id: string;
  user_id: string;
  project_id: string;
  mode: GenerationJob['mode'];
  prompt: string;
  config: Record<string, unknown>;
  input_asset_ids: string[];
  status: GenerationJob['status'];
  progress: number;
  provider: string;
  output_asset_id: string | null;
  output_asset_ids: string[];
  error_message: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
};

type GenerationResultRow = {
  id: string;
  user_id: string;
  project_id: string;
  job_id: string;
  asset_id: string;
  image_url: string;
  is_selected: boolean;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
};

type ImageAssetRow = {
  id: string;
  user_id: string;
  url: string;
  filename: string;
  mime_type: string;
  size: number;
  created_at: string;
};

type ModelAssetRow = {
  id: string;
  user_id: string;
  url: string;
  filename: string;
  original_filename: string;
  file_type: ModelAsset['fileType'];
  mime_type: string;
  size: number;
  created_at: string;
  deleted_at: string | null;
};

type ShareLinkRow = {
  id: string;
  project_id: string;
  token: string;
  permission: ShareLink['permission'];
  expires_at: string;
  created_at: string;
  revoked_at: string | null;
};

type CreditBalanceRow = {
  user_id: string;
  balance: number;
  updated_at: string;
};

type CreditTransactionRow = {
  id: string;
  user_id: string;
  type: CreditTransaction['type'];
  amount: number;
  balance_after: number;
  reason: string;
  reference_type: CreditTransaction['referenceType'];
  reference_id: string | null;
  created_at: string;
};

type CreditAdjustmentRpcRow = {
  balance_user_id: string;
  balance: number;
  balance_updated_at: string;
  transaction_id: string;
  transaction_user_id: string;
  transaction_type: CreditTransaction['type'];
  transaction_amount: number;
  transaction_balance_after: number;
  transaction_reason: string;
  transaction_reference_type: CreditTransaction['referenceType'];
  transaction_reference_id: string | null;
  transaction_created_at: string;
};

export class SupabaseStorageAdapter implements StorageAdapter {
  private readonly client: SupabaseClient;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        'DATA_BACKEND=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the server environment.',
      );
    }

    this.client = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  async ensureReady(): Promise<void> {
    const { error } = await this.client.from('projects').select('id').limit(1);
    assertNoSupabaseError(error, 'checking Supabase storage tables');
  }

  async listProjects(userId: string): Promise<Project[]> {
    const { data, error } = await this.client
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    assertNoSupabaseError(error, 'listing projects');
    return ((data ?? []) as ProjectRow[]).map(mapProjectRow);
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const now = new Date().toISOString();
    const row: ProjectRow = {
      id: `project_${randomUUID()}`,
      user_id: input.userId,
      name: input.name,
      description: input.description ?? '',
      status: input.status ?? 'active',
      cover_image_url: input.coverImageUrl ?? null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
    const { data, error } = await this.client.from('projects').insert(row).select('*').single();

    assertNoSupabaseError(error, 'creating project');
    return mapProjectRow(data as ProjectRow);
  }

  async getProject(id: string, userId?: string): Promise<Project | null> {
    let query = this.client.from('projects').select('*').eq('id', id).is('deleted_at', null);
    if (userId) query = query.eq('user_id', userId);

    const { data, error } = await query.maybeSingle();
    assertNoSupabaseError(error, 'reading project');
    return data ? mapProjectRow(data as ProjectRow) : null;
  }

  async updateProject(id: string, userId: string, input: UpdateProjectInput): Promise<Project | null> {
    const patch: Partial<ProjectRow> = { updated_at: new Date().toISOString() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.status !== undefined) patch.status = input.status;
    if (input.coverImageUrl !== undefined) patch.cover_image_url = input.coverImageUrl;

    const { data, error } = await this.client
      .from('projects')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();

    assertNoSupabaseError(error, 'updating project');
    return data ? mapProjectRow(data as ProjectRow) : null;
  }

  async softDeleteProject(id: string, userId: string): Promise<Project | null> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from('projects')
      .update({ deleted_at: now, status: 'archived', updated_at: now })
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();

    assertNoSupabaseError(error, 'soft deleting project');
    return data ? mapProjectRow(data as ProjectRow) : null;
  }

  async listProjectGenerations(projectId: string, userId: string): Promise<GenerationRecord[]> {
    const { data, error } = await this.client
      .from('generation_records')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    assertNoSupabaseError(error, 'listing generation records');
    const records = ((data ?? []) as GenerationRecordRow[]).map(mapGenerationRecordRow);
    return Promise.all(records.map(async record => ({
      ...record,
      results: record.jobId ? await this.listGenerationResults(record.jobId, userId) : [],
    })));
  }

  async createGenerationRecord(input: CreateGenerationRecordInput): Promise<GenerationRecord | null> {
    const project = await this.getProject(input.projectId, input.userId);
    if (!project) return null;

    const now = new Date().toISOString();
    const row: GenerationRecordRow = {
      id: `generation_${randomUUID()}`,
      user_id: input.userId,
      project_id: input.projectId,
      job_id: input.jobId ?? null,
      mode: input.mode,
      prompt: input.prompt,
      input_image_url: input.inputImageUrl ?? null,
      input_image_data_preview: input.inputImageDataPreview ?? null,
      output_image_url: input.outputImageUrl ?? null,
      output_image_data_preview: input.outputImageDataPreview ?? null,
      provider: input.provider,
      status: input.status ?? 'succeeded',
      created_at: now,
      updated_at: now,
    };
    const { data, error } = await this.client.from('generation_records').insert(row).select('*').single();
    assertNoSupabaseError(error, 'creating generation record');

    const projectPatch: Partial<ProjectRow> = { updated_at: now };
    if (!project.coverImageUrl && row.output_image_data_preview) {
      projectPatch.cover_image_url = row.output_image_data_preview;
    }
    await this.client.from('projects').update(projectPatch).eq('id', input.projectId).eq('user_id', input.userId);

    return mapGenerationRecordRow(data as GenerationRecordRow);
  }

  async listGenerationResults(jobId: string, userId?: string): Promise<GenerationResult[]> {
    let query = this.client.from('generation_results').select('*').eq('job_id', jobId).order('created_at', { ascending: true });
    if (userId) query = query.eq('user_id', userId);

    const { data, error } = await query;
    assertNoSupabaseError(error, 'listing generation results');
    return ((data ?? []) as GenerationResultRow[]).map(mapGenerationResultRow);
  }

  async createGenerationResult(input: CreateGenerationResultInput): Promise<GenerationResult | null> {
    const project = await this.getProject(input.projectId, input.userId);
    const job = await this.getGenerationJob(input.jobId, input.userId);
    if (!project || !job) return null;

    if (input.isSelected) {
      await this.client
        .from('generation_results')
        .update({ is_selected: false, updated_at: new Date().toISOString() })
        .eq('job_id', input.jobId)
        .eq('user_id', input.userId);
    }

    const now = new Date().toISOString();
    const row: GenerationResultRow = {
      id: `result_${randomUUID()}`,
      user_id: input.userId,
      project_id: input.projectId,
      job_id: input.jobId,
      asset_id: input.assetId,
      image_url: input.imageUrl,
      is_selected: input.isSelected ?? false,
      is_favorite: input.isFavorite ?? false,
      created_at: now,
      updated_at: now,
    };
    const { data, error } = await this.client.from('generation_results').insert(row).select('*').single();
    assertNoSupabaseError(error, 'creating generation result');
    return mapGenerationResultRow(data as GenerationResultRow);
  }

  async updateGenerationResult(id: string, userId: string, input: UpdateGenerationResultInput): Promise<GenerationResult | null> {
    const current = await this.client.from('generation_results').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
    assertNoSupabaseError(current.error, 'reading generation result');
    if (!current.data) return null;

    if (input.isSelected) {
      await this.client
        .from('generation_results')
        .update({ is_selected: false, updated_at: new Date().toISOString() })
        .eq('job_id', (current.data as GenerationResultRow).job_id)
        .eq('user_id', userId);
    }

    const patch: Partial<GenerationResultRow> = { updated_at: new Date().toISOString() };
    if (input.isSelected !== undefined) patch.is_selected = input.isSelected;
    if (input.isFavorite !== undefined) patch.is_favorite = input.isFavorite;

    const { data, error } = await this.client
      .from('generation_results')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();

    assertNoSupabaseError(error, 'updating generation result');
    return data ? mapGenerationResultRow(data as GenerationResultRow) : null;
  }

  async createGenerationJob(input: CreateGenerationJobInput): Promise<GenerationJob | null> {
    const project = await this.getProject(input.projectId, input.userId);
    if (!project) return null;

    const now = new Date().toISOString();
    const row: GenerationJobRow = {
      id: `job_${randomUUID()}`,
      user_id: input.userId,
      project_id: input.projectId,
      mode: input.mode,
      prompt: input.prompt,
      config: input.config,
      input_asset_ids: input.inputAssetIds,
      status: 'queued',
      progress: 0,
      provider: input.provider,
      output_asset_id: null,
      output_asset_ids: [],
      error_message: null,
      created_at: now,
      updated_at: now,
      started_at: null,
      finished_at: null,
    };
    const { data, error } = await this.client.from('generation_jobs').insert(row).select('*').single();
    assertNoSupabaseError(error, 'creating generation job');

    await this.client.from('projects').update({ updated_at: now }).eq('id', input.projectId).eq('user_id', input.userId);
    return mapGenerationJobRow(data as GenerationJobRow);
  }

  async getGenerationJob(id: string, userId?: string): Promise<GenerationJob | null> {
    let query = this.client.from('generation_jobs').select('*').eq('id', id);
    if (userId) query = query.eq('user_id', userId);

    const { data, error } = await query.maybeSingle();
    assertNoSupabaseError(error, 'reading generation job');
    return data ? mapGenerationJobRow(data as GenerationJobRow) : null;
  }

  async listRunnableGenerationJobs(): Promise<GenerationJob[]> {
    const { data, error } = await this.client
      .from('generation_jobs')
      .select('*')
      .in('status', ['queued', 'running'])
      .order('created_at', { ascending: true });

    assertNoSupabaseError(error, 'listing runnable generation jobs');
    return ((data ?? []) as GenerationJobRow[]).map(mapGenerationJobRow);
  }

  async updateGenerationJob(id: string, input: UpdateGenerationJobInput): Promise<GenerationJob | null> {
    const patch: Partial<GenerationJobRow> = { updated_at: new Date().toISOString() };
    if (input.status !== undefined) patch.status = input.status;
    if (input.progress !== undefined) patch.progress = input.progress;
    if (input.outputAssetId !== undefined) patch.output_asset_id = input.outputAssetId;
    if (input.outputAssetIds !== undefined) patch.output_asset_ids = input.outputAssetIds;
    if (input.errorMessage !== undefined) patch.error_message = input.errorMessage;
    if (input.startedAt !== undefined) patch.started_at = input.startedAt;
    if (input.finishedAt !== undefined) patch.finished_at = input.finishedAt;

    const { data, error } = await this.client
      .from('generation_jobs')
      .update(patch)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    assertNoSupabaseError(error, 'updating generation job');
    return data ? mapGenerationJobRow(data as GenerationJobRow) : null;
  }

  async cancelGenerationJob(id: string, userId?: string): Promise<GenerationJob | null> {
    const current = await this.getGenerationJob(id, userId);
    if (!current) return null;
    if (current.status === 'succeeded' || current.status === 'failed' || current.status === 'cancelled') {
      return current;
    }

    const now = new Date().toISOString();
    return this.updateGenerationJob(id, {
      status: 'cancelled',
      progress: Math.min(current.progress, 99),
      finishedAt: now,
    });
  }

  async createImageAsset(input: CreateImageAssetInput): Promise<ImageAsset> {
    const row: ImageAssetRow = {
      id: `image_${randomUUID()}`,
      user_id: input.userId,
      url: input.url,
      filename: input.filename,
      mime_type: input.mimeType,
      size: input.size,
      created_at: new Date().toISOString(),
    };
    const { data, error } = await this.client.from('image_assets').insert(row).select('*').single();

    assertNoSupabaseError(error, 'creating image asset');
    return mapImageAssetRow(data as ImageAssetRow);
  }

  async getImageAsset(id: string, userId?: string): Promise<ImageAsset | null> {
    let query = this.client.from('image_assets').select('*').eq('id', id);
    if (userId) query = query.eq('user_id', userId);

    const { data, error } = await query.maybeSingle();
    assertNoSupabaseError(error, 'reading image asset');
    return data ? mapImageAssetRow(data as ImageAssetRow) : null;
  }

  async listModelAssets(userId: string): Promise<ModelAsset[]> {
    const { data, error } = await this.client
      .from('model_assets')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    assertNoSupabaseError(error, 'listing model assets');
    return ((data ?? []) as ModelAssetRow[]).map(mapModelAssetRow);
  }

  async getModelAsset(id: string, userId?: string): Promise<ModelAsset | null> {
    let query = this.client.from('model_assets').select('*').eq('id', id).is('deleted_at', null);
    if (userId) query = query.eq('user_id', userId);

    const { data, error } = await query.maybeSingle();
    assertNoSupabaseError(error, 'reading model asset');
    return data ? mapModelAssetRow(data as ModelAssetRow) : null;
  }

  async createModelAsset(input: CreateModelAssetInput): Promise<ModelAsset> {
    const row: ModelAssetRow = {
      id: `model_${randomUUID()}`,
      user_id: input.userId,
      url: input.url,
      filename: input.filename,
      original_filename: input.originalFilename,
      file_type: input.fileType,
      mime_type: input.mimeType,
      size: input.size,
      created_at: new Date().toISOString(),
      deleted_at: null,
    };
    const { data, error } = await this.client.from('model_assets').insert(row).select('*').single();

    assertNoSupabaseError(error, 'creating model asset');
    return mapModelAssetRow(data as ModelAssetRow);
  }

  async deleteModelAsset(id: string, userId: string): Promise<ModelAsset | null> {
    const { data, error } = await this.client
      .from('model_assets')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();

    assertNoSupabaseError(error, 'deleting model asset');
    return data ? mapModelAssetRow(data as ModelAssetRow) : null;
  }

  async createShareLink(input: CreateShareLinkInput): Promise<ShareLink | null> {
    const project = await this.getProject(input.projectId, input.userId);
    if (!project) return null;

    const row: ShareLinkRow = {
      id: `share_${randomUUID()}`,
      project_id: input.projectId,
      token: input.token,
      permission: 'view',
      expires_at: input.expiresAt,
      created_at: new Date().toISOString(),
      revoked_at: null,
    };

    const { data, error } = await this.client.from('share_links').insert(row).select('*').single();
    assertNoSupabaseError(error, 'creating share link');
    return mapShareLinkRow(data as ShareLinkRow);
  }

  async getShareLinkByToken(token: string): Promise<ShareLink | null> {
    const { data, error } = await this.client.from('share_links').select('*').eq('token', token).maybeSingle();
    assertNoSupabaseError(error, 'reading share link by token');
    return data ? mapShareLinkRow(data as ShareLinkRow) : null;
  }

  async revokeShareLink(projectId: string, userId: string, shareLinkId: string): Promise<ShareLink | null> {
    const project = await this.getProject(projectId, userId);
    if (!project) return null;

    const { data, error } = await this.client
      .from('share_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', shareLinkId)
      .eq('project_id', projectId)
      .select('*')
      .maybeSingle();

    assertNoSupabaseError(error, 'revoking share link');
    return data ? mapShareLinkRow(data as ShareLinkRow) : null;
  }

  async getCreditBalance(userId: string): Promise<CreditBalance> {
    const existing = await this.client.from('credit_balances').select('*').eq('user_id', userId).maybeSingle();
    assertNoSupabaseError(existing.error, 'reading credit balance');
    if (existing.data) return mapCreditBalanceRow(existing.data as CreditBalanceRow);

    const now = new Date().toISOString();
    const row: CreditBalanceRow = {
      user_id: userId,
      balance: 0,
      updated_at: now,
    };
    const { data, error } = await this.client.from('credit_balances').insert(row).select('*').single();
    assertNoSupabaseError(error, 'creating credit balance');
    return mapCreditBalanceRow(data as CreditBalanceRow);
  }

  async listCreditTransactions(userId: string): Promise<CreditTransaction[]> {
    const { data, error } = await this.client
      .from('credit_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    assertNoSupabaseError(error, 'listing credit transactions');
    return ((data ?? []) as CreditTransactionRow[]).map(mapCreditTransactionRow);
  }

  async adjustCredits(input: CreditTransactionInput): Promise<{ balance: CreditBalance; transaction: CreditTransaction } | null> {
    const { data, error } = await this.client.rpc('adjust_credits_atomic', {
      p_user_id: input.userId,
      p_type: input.type,
      p_amount: input.amount,
      p_reason: input.reason,
      p_reference_type: input.referenceType ?? null,
      p_reference_id: input.referenceId ?? null,
    });

    assertNoSupabaseError(error, 'adjusting credits atomically');

    const row = Array.isArray(data) ? data[0] as CreditAdjustmentRpcRow | undefined : data as CreditAdjustmentRpcRow | null;
    if (!row) return null;

    return mapCreditAdjustmentRpcRow(row);
  }

  async getCreditTransactionByReference(
    userId: string,
    type: CreditTransaction['type'],
    referenceId: string,
  ): Promise<CreditTransaction | null> {
    const { data, error } = await this.client
      .from('credit_transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('type', type)
      .eq('reference_id', referenceId)
      .maybeSingle();

    assertNoSupabaseError(error, 'reading credit transaction by reference');
    return data ? mapCreditTransactionRow(data as CreditTransactionRow) : null;
  }

  async getAdminDashboard(): Promise<AdminDashboard> {
    const [projects, jobs, balances, transactions] = await Promise.all([
      this.client.from('projects').select('*').is('deleted_at', null),
      this.client.from('generation_jobs').select('*'),
      this.client.from('credit_balances').select('*'),
      this.client.from('credit_transactions').select('*'),
    ]);

    assertNoSupabaseError(projects.error, 'admin listing projects');
    assertNoSupabaseError(jobs.error, 'admin listing generation jobs');
    assertNoSupabaseError(balances.error, 'admin listing credit balances');
    assertNoSupabaseError(transactions.error, 'admin listing credit transactions');

    const projectRows = (projects.data ?? []) as ProjectRow[];
    const jobRows = (jobs.data ?? []) as GenerationJobRow[];
    const balanceRows = (balances.data ?? []) as CreditBalanceRow[];
    const transactionRows = (transactions.data ?? []) as CreditTransactionRow[];
    const mappedJobs = jobRows.map(mapGenerationJobRow);
    const userIds = new Set<string>();

    for (const project of projectRows) userIds.add(project.user_id);
    for (const job of jobRows) userIds.add(job.user_id);
    for (const balance of balanceRows) userIds.add(balance.user_id);
    for (const transaction of transactionRows) userIds.add(transaction.user_id);

    return {
      stats: {
        userCount: userIds.size,
        projectCount: projectRows.length,
        generationJobCount: jobRows.length,
        succeededJobCount: jobRows.filter(job => job.status === 'succeeded').length,
        failedJobCount: jobRows.filter(job => job.status === 'failed').length,
        totalCreditsConsumed: transactionRows
          .filter(transaction => transaction.type === 'debit')
          .reduce((total, transaction) => total + Math.abs(transaction.amount), 0),
      },
      recentJobs: [...mappedJobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20),
      recentErrorJobs: mappedJobs
        .filter(job => job.status === 'failed')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 20),
    };
  }
}

function mapProjectRow(row: ProjectRow): Project {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    status: row.status,
    coverImageUrl: row.cover_image_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function mapGenerationRecordRow(row: GenerationRecordRow): GenerationRecord {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    jobId: row.job_id,
    mode: row.mode,
    prompt: row.prompt,
    inputImageUrl: row.input_image_url,
    inputImageDataPreview: row.input_image_data_preview,
    outputImageUrl: row.output_image_url,
    outputImageDataPreview: row.output_image_data_preview,
    provider: row.provider,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapGenerationJobRow(row: GenerationJobRow): GenerationJob {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    mode: row.mode,
    prompt: row.prompt,
    config: row.config,
    inputAssetIds: row.input_asset_ids,
    status: row.status,
    progress: row.progress,
    provider: row.provider,
    outputAssetId: row.output_asset_id,
    outputAssetIds: row.output_asset_ids,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function mapGenerationResultRow(row: GenerationResultRow): GenerationResult {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    jobId: row.job_id,
    assetId: row.asset_id,
    imageUrl: row.image_url,
    isSelected: row.is_selected,
    isFavorite: row.is_favorite,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapImageAssetRow(row: ImageAssetRow): ImageAsset {
  return {
    id: row.id,
    userId: row.user_id,
    url: row.url,
    filename: row.filename,
    mimeType: row.mime_type,
    size: row.size,
    createdAt: row.created_at,
  };
}

function mapModelAssetRow(row: ModelAssetRow): ModelAsset {
  return {
    id: row.id,
    userId: row.user_id,
    url: row.url,
    filename: row.filename,
    originalFilename: row.original_filename,
    fileType: row.file_type,
    mimeType: row.mime_type,
    size: row.size,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

function mapShareLinkRow(row: ShareLinkRow): ShareLink {
  return {
    id: row.id,
    projectId: row.project_id,
    token: row.token,
    permission: row.permission,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  };
}

function mapCreditBalanceRow(row: CreditBalanceRow): CreditBalance {
  return {
    userId: row.user_id,
    balance: row.balance,
    updatedAt: row.updated_at,
  };
}

function mapCreditTransactionRow(row: CreditTransactionRow): CreditTransaction {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    amount: row.amount,
    balanceAfter: row.balance_after,
    reason: row.reason,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    createdAt: row.created_at,
  };
}

function mapCreditAdjustmentRpcRow(row: CreditAdjustmentRpcRow): { balance: CreditBalance; transaction: CreditTransaction } {
  return {
    balance: {
      userId: row.balance_user_id,
      balance: row.balance,
      updatedAt: row.balance_updated_at,
    },
    transaction: {
      id: row.transaction_id,
      userId: row.transaction_user_id,
      type: row.transaction_type,
      amount: row.transaction_amount,
      balanceAfter: row.transaction_balance_after,
      reason: row.transaction_reason,
      referenceType: row.transaction_reference_type,
      referenceId: row.transaction_reference_id,
      createdAt: row.transaction_created_at,
    },
  };
}

function assertNoSupabaseError(error: { message: string } | null, action: string): void {
  if (error) {
    throw new Error(`Supabase storage error while ${action}: ${error.message}`);
  }
}
