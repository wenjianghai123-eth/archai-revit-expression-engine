import { buildApiUrl } from '../lib/apiBaseUrl';
import { getAccessToken } from '../lib/authToken';
import { resolveAssetUrl } from '../utils/assetUrl';
import type { ProjectReportImage, ProjectReportPackage } from './projectReport';

interface TarEntry {
  name: string;
  data: Uint8Array;
  modifiedAt?: Date;
}

export interface ProjectReportArchiveResult {
  includedImages: number;
  skippedImages: number;
}

export async function downloadProjectReportArchive(report: ProjectReportPackage): Promise<ProjectReportArchiveResult> {
  const imageEntries: TarEntry[] = [];
  let skippedImages = 0;
  for (let index = 0; index < report.imageFiles.length; index += 1) {
    const image = report.imageFiles[index];
    try {
      const blob = await fetchReportImage(image);
      imageEntries.push({
        name: `images/${String(index + 1).padStart(3, '0')}-${sanitizeArchiveFilename(image.filename)}`,
        data: new Uint8Array(await blob.arrayBuffer()),
        modifiedAt: image.createdAt ? new Date(image.createdAt) : undefined,
      });
    } catch (error) {
      skippedImages += 1;
      console.error('[project-report] image packaging failed', {
        imageId: image.id,
        assetId: image.assetId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const manifest = {
    ...report,
    archive: {
      format: 'tar',
      includedImages: imageEntries.length,
      skippedImages,
      imageDirectory: 'images/',
    },
  };
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  const archive = createTarArchive([
    { name: 'project-report.json', data: manifestBytes },
    ...imageEntries,
  ]);
  downloadBlob(archive, `${sanitizeArchiveFilename(report.project.name)}-project-report.tar`);
  return { includedImages: imageEntries.length, skippedImages };
}

export function createTarArchive(entries: TarEntry[]): Blob {
  const blocks: Uint8Array[] = [];
  for (const entry of entries) {
    const header = createTarHeader(entry);
    blocks.push(header, entry.data);
    const paddingLength = (512 - (entry.data.length % 512)) % 512;
    if (paddingLength) blocks.push(new Uint8Array(paddingLength));
  }
  blocks.push(new Uint8Array(1024));
  return new Blob(blocks as BlobPart[], { type: 'application/x-tar' });
}

async function fetchReportImage(image: ProjectReportImage): Promise<Blob> {
  const accessToken = getAccessToken();
  const requestUrl = image.assetId
    ? buildApiUrl(`/api/assets/${encodeURIComponent(image.assetId)}/download`)
    : resolveAssetUrl(image.url);
  const response = await fetch(requestUrl, {
    credentials: 'same-origin',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  if (!blob.type.startsWith('image/') && blob.size === 0) throw new Error('Empty or invalid image response.');
  return blob;
}

function createTarHeader(entry: TarEntry): Uint8Array {
  const header = new Uint8Array(512);
  writeString(header, 0, 100, entry.name.slice(0, 100));
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, entry.data.length);
  writeOctal(header, 136, 12, Math.floor((entry.modifiedAt || new Date()).getTime() / 1000));
  header.fill(32, 148, 156);
  header[156] = '0'.charCodeAt(0);
  writeString(header, 257, 6, 'ustar');
  writeString(header, 263, 2, '00');
  let checksum = 0;
  for (const byte of header) checksum += byte;
  writeChecksum(header, checksum);
  return header;
}

function writeString(target: Uint8Array, offset: number, length: number, value: string): void {
  const bytes = new TextEncoder().encode(value);
  target.set(bytes.slice(0, length), offset);
}

function writeOctal(target: Uint8Array, offset: number, length: number, value: number): void {
  const text = Math.max(0, value).toString(8).padStart(length - 1, '0').slice(-(length - 1));
  writeString(target, offset, length, `${text}\0`);
}

function writeChecksum(target: Uint8Array, checksum: number): void {
  const text = checksum.toString(8).padStart(6, '0').slice(-6);
  writeString(target, 148, 8, `${text}\0 `);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitizeArchiveFilename(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/gu, '-')
    .replace(/\s+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 90);
  return sanitized || 'archai-report';
}
