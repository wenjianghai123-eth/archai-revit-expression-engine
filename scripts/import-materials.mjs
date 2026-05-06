import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_DIRS = [
  'G:\\温江海工作文件\\03 北大幕墙BIM实施方案\\模型文件\\贴图\\材质',
  'E:\\BaiduNetdiskDownload\\Revit 贴图库01',
];

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const IMPORT_TAG = '本地导入';

const CATEGORY_RULES = [
  { category: '木材', slug: 'wood', keywords: ['木', 'wood', 'timber', 'veneer', 'oak', 'walnut', 'teak'] },
  { category: '石材', slug: 'stone', keywords: ['石', 'stone', 'marble', 'granite', 'travertine', 'slate'] },
  { category: '金属', slug: 'metal', keywords: ['金属', 'metal', 'steel', 'aluminum', 'aluminium', 'bronze', 'copper', 'iron', '铝', '钢', '不锈钢'] },
  { category: '玻璃', slug: 'glass', keywords: ['玻璃', 'glass'] },
  { category: '混凝土', slug: 'concrete', keywords: ['混凝土', '水泥', 'concrete', 'cement'] },
  { category: '瓷砖', slug: 'tile', keywords: ['瓷砖', 'tile', 'ceramic'] },
  { category: '砖', slug: 'brick', keywords: ['砖', 'brick'] },
  { category: '地板', slug: 'floor', keywords: ['地板', 'floor', 'flooring'] },
  { category: '墙面', slug: 'wall', keywords: ['墙', 'wall', 'wallpaper'] },
  { category: '布料', slug: 'fabric', keywords: ['布', 'fabric', 'textile', 'carpet'] },
  { category: '皮革', slug: 'leather', keywords: ['皮革', 'leather'] },
  { category: '涂料', slug: 'paint', keywords: ['涂料', 'paint', 'coating', 'plaster'] },
  { category: '屋面', slug: 'roof', keywords: ['屋面', 'roof', 'roofing'] },
  { category: '景观', slug: 'landscape', keywords: ['草', 'grass', 'landscape', 'gravel', 'soil'] },
  { category: '其他', slug: 'other', keywords: [] },
];

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(repoRoot, 'public', 'materials');
const manifestPath = path.join(outputDir, 'materials-manifest.json');

async function main() {
  await mkdir(outputDir, { recursive: true });

  const existingManifest = await readManifest();
  const existingByHash = new Map();
  const usedFilenames = new Set();
  const usedIds = new Set();

  for (const entry of existingManifest) {
    const filename = readManifestFilename(entry);
    if (filename) usedFilenames.add(filename);
    if (entry.id) usedIds.add(entry.id);

    const hash = entry.hash || await hashExistingEntry(entry);
    if (hash && !existingByHash.has(hash)) {
      existingByHash.set(hash, { ...entry, hash });
    }
  }

  const sourceFiles = [];
  for (const sourceDir of SOURCE_DIRS) {
    if (!existsSync(sourceDir)) {
      console.warn(`[materials] warning: source path does not exist, skipped: ${sourceDir}`);
      continue;
    }
    sourceFiles.push(...await scanImages(sourceDir));
  }

  sourceFiles.sort((left, right) => left.fullPath.localeCompare(right.fullPath, 'zh-Hans-CN'));

  const importedAt = new Date().toISOString();
  const nextManifest = [];
  const categoryCounts = new Map();
  const processedHashes = new Set();
  let copiedCount = 0;
  let reusedCount = 0;
  let skippedDuplicateCount = 0;

  for (const file of sourceFiles) {
    const hash = await hashFile(file.fullPath);
    const classification = classifyMaterial(file.relativePath);
    if (processedHashes.has(hash)) {
      skippedDuplicateCount += 1;
      continue;
    }

    const existing = existingByHash.get(hash);

    if (existing) {
      const normalized = normalizeEntry(existing, file, classification, hash, importedAt);
      nextManifest.push(normalized);
      existingByHash.set(hash, normalized);
      processedHashes.add(hash);
      if (normalized.thumbnail) {
        usedFilenames.add(path.basename(normalized.thumbnail));
      }
      if (normalized.id) usedIds.add(normalized.id);
      reusedCount += 1;
      incrementCategory(categoryCounts, normalized.category);
      continue;
    }

    const extension = path.extname(file.fullPath).toLowerCase();
    const safeName = createSafeFilename(classification.slug, extension, usedFilenames);
    const id = path.basename(safeName, extension);
    const outputPath = path.join(outputDir, safeName);
    await copyFile(file.fullPath, outputPath);

    const entry = {
      id: createUniqueId(id, usedIds),
      name: path.basename(file.name, path.extname(file.name)),
      thumbnail: `/materials/${safeName}`,
      category: classification.category,
      tags: [classification.category, IMPORT_TAG],
      source: 'local-import',
      originalFileName: file.name,
      originalPath: file.fullPath,
      importedAt,
      hash,
    };

    nextManifest.push(entry);
    existingByHash.set(hash, entry);
    processedHashes.add(hash);
    usedFilenames.add(safeName);
    usedIds.add(entry.id);
    copiedCount += 1;
    incrementCategory(categoryCounts, entry.category);
  }

  const mergedManifest = mergeUnmatchedExistingEntries(existingManifest, nextManifest);
  mergedManifest.sort((left, right) => {
    const categoryCompare = String(left.category || '').localeCompare(String(right.category || ''), 'zh-Hans-CN');
    if (categoryCompare !== 0) return categoryCompare;
    return String(left.name || '').localeCompare(String(right.name || ''), 'zh-Hans-CN');
  });

  await writeFile(manifestPath, `${JSON.stringify(mergedManifest, null, 2)}\n`, 'utf8');

  console.log(`[materials] source images found: ${sourceFiles.length}`);
  console.log(`[materials] copied new images: ${copiedCount}`);
  console.log(`[materials] reused existing images: ${reusedCount}`);
  console.log(`[materials] skipped duplicates in this run: ${skippedDuplicateCount}`);
  console.log('[materials] category counts:');
  for (const [category, count] of Array.from(categoryCounts.entries()).sort((a, b) => a[0].localeCompare(b[0], 'zh-Hans-CN'))) {
    console.log(`  ${category}: ${count}`);
  }
  console.log(`[materials] manifest: ${path.relative(repoRoot, manifestPath)}`);
}

async function readManifest() {
  if (!existsSync(manifestPath)) return [];

  try {
    const manifestText = await readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(manifestText.replace(/^\uFEFF/, ''));
    return Array.isArray(parsed) ? parsed.filter(isManifestRecord) : [];
  } catch (error) {
    console.warn(`[materials] warning: could not parse existing manifest, starting fresh: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

function isManifestRecord(value) {
  return typeof value === 'object' && value !== null && typeof value.id === 'string' && typeof value.thumbnail === 'string';
}

async function scanImages(rootDir) {
  const results = [];

  async function visit(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(extension)) continue;

      results.push({
        fullPath,
        relativePath: path.relative(rootDir, fullPath),
        name: entry.name,
      });
    }
  }

  await visit(rootDir);
  return results;
}

function classifyMaterial(relativePath) {
  const searchableText = relativePath.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(keyword => searchableText.includes(keyword.toLowerCase()))) {
      return { category: rule.category, slug: rule.slug };
    }
  }
  const fallback = CATEGORY_RULES[CATEGORY_RULES.length - 1];
  return { category: fallback.category, slug: fallback.slug };
}

function createSafeFilename(slug, extension, usedFilenames) {
  let index = 1;
  while (true) {
    const filename = `material-${slug}-${String(index).padStart(3, '0')}${extension}`;
    if (!usedFilenames.has(filename) && !existsSync(path.join(outputDir, filename))) {
      return filename;
    }
    index += 1;
  }
}

function createUniqueId(baseId, usedIds) {
  if (!usedIds.has(baseId)) return baseId;

  let index = 2;
  while (usedIds.has(`${baseId}-${index}`)) {
    index += 1;
  }
  return `${baseId}-${index}`;
}

function normalizeEntry(entry, file, classification, hash, importedAt) {
  const filename = readManifestFilename(entry);
  return {
    id: entry.id || filename ? path.basename(filename, path.extname(filename)) : `material-${classification.slug}`,
    name: entry.name || path.basename(file.name, path.extname(file.name)),
    thumbnail: entry.thumbnail || (filename ? `/materials/${filename}` : ''),
    category: entry.category || classification.category,
    tags: normalizeTags(entry.tags, entry.category || classification.category),
    source: entry.source || 'local-import',
    originalFileName: entry.originalFileName || file.name,
    originalPath: entry.originalPath || file.fullPath,
    importedAt: entry.importedAt || importedAt,
    hash,
  };
}

function normalizeTags(tags, category) {
  return Array.from(new Set([...(Array.isArray(tags) ? tags.filter(tag => typeof tag === 'string') : []), category, IMPORT_TAG]));
}

function mergeUnmatchedExistingEntries(existingManifest, nextManifest) {
  const hashes = new Set(nextManifest.map(entry => entry.hash).filter(Boolean));
  const ids = new Set(nextManifest.map(entry => entry.id));
  const merged = [...nextManifest];

  for (const entry of existingManifest) {
    if ((entry.hash && hashes.has(entry.hash)) || ids.has(entry.id)) continue;
    merged.push(entry);
  }

  return merged;
}

function readManifestFilename(entry) {
  if (typeof entry.thumbnail !== 'string') return null;
  const filename = path.basename(entry.thumbnail);
  return filename && filename !== '.' ? filename : null;
}

async function hashExistingEntry(entry) {
  const filename = readManifestFilename(entry);
  if (!filename) return null;
  const fullPath = path.join(outputDir, filename);
  if (!existsSync(fullPath)) return null;
  return hashFile(fullPath);
}

async function hashFile(filePath) {
  const content = await readFile(filePath);
  return crypto.createHash('sha1').update(content).digest('hex');
}

function incrementCategory(counts, category) {
  counts.set(category, (counts.get(category) || 0) + 1);
}

main().catch((error) => {
  console.error(`[materials] import failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exitCode = 1;
});
