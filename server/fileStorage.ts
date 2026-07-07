import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const uploadsDir = path.resolve(process.cwd(), process.env.UPLOADS_DIR || 'uploads');
export const modelUploadsDir = path.join(uploadsDir, 'models');
export const generatedUploadsDir = path.join(uploadsDir, 'generated');

export interface StoredFile {
  url: string;
  publicUrl: string;
  path: string;
  storageProvider: 'local' | 'supabase';
  filename: string;
  mimeType: string;
  size: number;
}

export interface FileStorageProvider {
  ensureReady(): Promise<void>;
  uploadImage(input: FileUploadInput): Promise<StoredFile>;
  uploadModel(input: FileUploadInput): Promise<StoredFile>;
  getPublicUrl(filename: string): string;
  deleteFile(filename: string): Promise<void>;
}

export interface FileUploadInput {
  content: Buffer;
  filename: string;
  mimeType: string;
  userId?: string;
}

export class LocalFileStorageProvider implements FileStorageProvider {
  async ensureReady(): Promise<void> {
    await mkdir(uploadsDir, { recursive: true });
    await mkdir(modelUploadsDir, { recursive: true });
    await mkdir(generatedUploadsDir, { recursive: true });
  }

  async uploadImage(input: FileUploadInput): Promise<StoredFile> {
    const filename = input.filename;
    const filePath = path.join(uploadsDir, filename);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, input.content);

    return {
      url: this.getPublicUrl(filename),
      publicUrl: this.getPublicUrl(filename),
      path: filename.replace(/\\/g, '/'),
      storageProvider: 'local',
      filename,
      mimeType: input.mimeType,
      size: input.content.length,
    };
  }

  async uploadModel(input: FileUploadInput): Promise<StoredFile> {
    const filename = `models/${input.filename}`;
    const filePath = path.join(uploadsDir, filename);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, input.content);

    return {
      url: this.getPublicUrl(filename),
      publicUrl: this.getPublicUrl(filename),
      path: filename.replace(/\\/g, '/'),
      storageProvider: 'local',
      filename,
      mimeType: input.mimeType,
      size: input.content.length,
    };
  }

  getPublicUrl(filename: string): string {
    return `/uploads/${filename.replace(/\\/g, '/')}`;
  }

  async deleteFile(filename: string): Promise<void> {
    const candidates = [
      path.resolve(uploadsDir, filename),
      path.resolve(modelUploadsDir, filename),
    ];

    for (const candidate of candidates) {
      if (!candidate.startsWith(uploadsDir)) continue;
      await unlink(candidate).then(() => undefined).catch(() => undefined);
    }
  }
}

export class SupabaseFileStorageProvider implements FileStorageProvider {
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET;

    if (!supabaseUrl || !serviceRoleKey || !bucket) {
      throw new Error(
        'FILE_STORAGE=supabase requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_STORAGE_BUCKET.',
      );
    }

    this.client = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    this.bucket = bucket;
  }

  async ensureReady(): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).list('', { limit: 1 });
    if (error) {
      throw new Error(`Supabase file storage is not ready: ${error.message}`);
    }
  }

  uploadImage(input: FileUploadInput): Promise<StoredFile> {
    return this.uploadFile(`users/${input.userId || 'unknown'}/images/${input.filename}`, input);
  }

  uploadModel(input: FileUploadInput): Promise<StoredFile> {
    return this.uploadFile(`users/${input.userId || 'unknown'}/models/${input.filename}`, input);
  }

  getPublicUrl(filename: string): string {
    const { data } = this.client.storage.from(this.bucket).getPublicUrl(filename);
    return data.publicUrl;
  }

  async deleteFile(filename: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).remove([filename]);
    if (error) {
      throw new Error(`Supabase file delete failed: ${error.message}`);
    }
  }

  private async uploadFile(filename: string, input: FileUploadInput): Promise<StoredFile> {
    const { error } = await this.client.storage.from(this.bucket).upload(filename, input.content, {
      contentType: input.mimeType,
      upsert: false,
    });

    if (error) {
      throw new Error(`Supabase file upload failed: ${error.message}`);
    }

    return {
      url: this.getPublicUrl(filename),
      publicUrl: this.getPublicUrl(filename),
      path: filename,
      storageProvider: 'supabase',
      filename,
      mimeType: input.mimeType,
      size: input.content.length,
    };
  }
}

export const fileStorageProvider: FileStorageProvider = createFileStorageProvider();

export function createStoredFilename(extension: string, prefix?: string): string {
  return `${Date.now()}-${randomUUID()}${prefix ? `-${prefix}` : ''}.${extension}`;
}

function createFileStorageProvider(): FileStorageProvider {
  const fileStorage = process.env.FILE_STORAGE || 'local';

  if (fileStorage === 'local') {
    return new LocalFileStorageProvider();
  }

  if (fileStorage === 'supabase') {
    return new SupabaseFileStorageProvider();
  }

  throw new Error(`Unsupported FILE_STORAGE=${fileStorage}. Expected "local" or "supabase".`);
}
