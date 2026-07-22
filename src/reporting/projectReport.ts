import type { EditSessionDetail, GenerationRecord, GenerationResult, Project, ShareLink } from '../lib/api';
import { getOriginalResultAssetId, getOriginalResultImageUrl } from '../utils/resultImage';

export type ProjectReportImageRole = 'cover' | 'source' | 'candidate' | 'primary' | 'version';

export interface ProjectReportImage {
  id: string;
  role: ProjectReportImageRole;
  title: string;
  assetId?: string;
  url: string;
  filename: string;
  createdAt?: string;
}

export interface ProjectReportScheme {
  id: string;
  sourceType: 'generation-result' | 'edit-version';
  title: string;
  feature: string;
  description: string;
  prompt?: string;
  differenceSummary?: string;
  materialSummary: string[];
  sourceImage?: ProjectReportImage;
  resultImage: ProjectReportImage;
  generationId?: string;
  generationResultId?: string;
  sessionId?: string;
  versionId?: string;
  parentVersionId?: string | null;
  isPrimary: boolean;
  isFavorite: boolean;
  qualityStatus?: string;
  createdAt: string;
}

export interface ProjectReportComparison {
  id: string;
  title: string;
  before: ProjectReportImage;
  after: ProjectReportImage;
  description: string;
}

export interface ProjectReportMaterialNote {
  id: string;
  schemeId: string;
  region?: string;
  material: string;
  details?: string;
}

export interface ProjectReportHistoryItem {
  id: string;
  sessionId: string;
  sessionTitle: string;
  instruction: string;
  status: string;
  baseVersionId?: string | null;
  outputVersionId?: string | null;
  createdAt: string;
}

export interface ProjectReportShare {
  status: 'not-created' | 'active' | 'revoked' | 'expired';
  url?: string;
  expiresAt?: string;
}

export interface ProjectReportPackage {
  schemaVersion: 'archai.project-report.v1';
  id: string;
  generatedAt: string;
  project: {
    id: string;
    name: string;
    objective: string;
    status: Project['status'];
    createdAt: string;
    updatedAt: string;
  };
  cover: ProjectReportImage | null;
  sourceImages: ProjectReportImage[];
  candidateSchemes: ProjectReportScheme[];
  comparisons: ProjectReportComparison[];
  materialNotes: ProjectReportMaterialNote[];
  modificationHistory: ProjectReportHistoryItem[];
  primaryScheme: ProjectReportScheme | null;
  sharing: ProjectReportShare;
  imageFiles: ProjectReportImage[];
  summary: {
    sourceImageCount: number;
    candidateSchemeCount: number;
    comparisonCount: number;
    materialNoteCount: number;
    modificationCount: number;
    imageFileCount: number;
  };
}

export interface BuildProjectReportInput {
  project: Project;
  generations: GenerationRecord[];
  editSessions: EditSessionDetail[];
  selectedResultKeys: Record<string, boolean>;
  share?: { link: ShareLink; url: string } | null;
  generatedAt?: string;
}

interface GenerationCandidate {
  key: string;
  generation: GenerationRecord;
  result: GenerationResultLike;
}

interface GenerationResultLike {
  id: string;
  imageUrl: string;
  assetId?: string;
  isSelected: boolean;
  isFavorite: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export function buildProjectReportPackage(input: BuildProjectReportInput): ProjectReportPackage {
  const generatedAt = input.generatedAt || new Date().toISOString();
  const candidates = listGenerationCandidates(input.generations)
    .filter(candidate => input.selectedResultKeys[candidate.key]);
  const generationSchemes = candidates.map((candidate, index) => buildGenerationScheme(candidate, index));
  const primaryVersionScheme = buildPrimaryVersionScheme(input.editSessions);
  const primaryScheme = primaryVersionScheme
    || generationSchemes.find(scheme => scheme.isPrimary)
    || generationSchemes.find(scheme => scheme.isFavorite)
    || generationSchemes[0]
    || null;
  const candidateSchemes = generationSchemes.map(scheme => ({
    ...scheme,
    isPrimary: scheme.id === primaryScheme?.id || scheme.isPrimary,
  }));
  const sourceImages = uniqueImages(candidateSchemes.flatMap(scheme => scheme.sourceImage ? [scheme.sourceImage] : []));
  const comparisons = candidateSchemes.flatMap(scheme => scheme.sourceImage ? [{
    id: `comparison-${scheme.id}`,
    title: `${scheme.title} · 前后对比`,
    before: scheme.sourceImage,
    after: scheme.resultImage,
    description: scheme.differenceSummary || scheme.description,
  }] : []);
  const materialNotes = candidateSchemes.flatMap(scheme => (
    scheme.materialSummary.map((material, index) => ({
      id: `material-${scheme.id}-${index + 1}`,
      schemeId: scheme.id,
      material,
    }))
  ));
  const modificationHistory = buildModificationHistory(input.editSessions);
  const cover = buildCover(input.project, primaryScheme, candidateSchemes);
  const imageFiles = uniqueImages([
    ...(cover ? [cover] : []),
    ...sourceImages,
    ...candidateSchemes.map(scheme => scheme.resultImage),
    ...(primaryVersionScheme ? [primaryVersionScheme.resultImage] : []),
  ]);
  const sharing = buildShare(input.share, generatedAt);

  return {
    schemaVersion: 'archai.project-report.v1',
    id: `project-report-${input.project.id}-${generatedAt.replace(/[^0-9]/gu, '').slice(0, 14)}`,
    generatedAt,
    project: {
      id: input.project.id,
      name: input.project.name,
      objective: input.project.description || '暂无项目目标说明。',
      status: input.project.status,
      createdAt: input.project.createdAt,
      updatedAt: input.project.updatedAt,
    },
    cover,
    sourceImages,
    candidateSchemes,
    comparisons,
    materialNotes,
    modificationHistory,
    primaryScheme,
    sharing,
    imageFiles,
    summary: {
      sourceImageCount: sourceImages.length,
      candidateSchemeCount: candidateSchemes.length,
      comparisonCount: comparisons.length,
      materialNoteCount: materialNotes.length,
      modificationCount: modificationHistory.length,
      imageFileCount: imageFiles.length,
    },
  };
}

export function buildProjectReportKey(generationId: string, resultId: string): string {
  return `${generationId}:${resultId}`;
}

function listGenerationCandidates(generations: GenerationRecord[]): GenerationCandidate[] {
  return generations.flatMap(generation => {
    if (generation.results?.length) {
      return generation.results.map(result => ({
        key: buildProjectReportKey(generation.id, result.id),
        generation,
        result: normalizeGenerationResult(result, generation),
      }));
    }
    const fallbackUrl = generation.outputImageUrl || generation.outputImageDataPreview;
    if (!fallbackUrl || fallbackUrl.startsWith('data:')) return [];
    return [{
      key: buildProjectReportKey(generation.id, generation.id),
      generation,
      result: {
        id: generation.id,
        imageUrl: fallbackUrl,
        isSelected: true,
        isFavorite: false,
        createdAt: generation.createdAt,
      },
    }];
  });
}

function normalizeGenerationResult(result: GenerationResult, generation: GenerationRecord): GenerationResultLike {
  return {
    id: result.id,
    imageUrl: getOriginalResultImageUrl(result, result.imageUrl) || result.imageUrl,
    assetId: getOriginalResultAssetId(result, result.assetId) || undefined,
    isSelected: result.isSelected,
    isFavorite: result.isFavorite,
    metadata: result.metadata,
    createdAt: result.createdAt || generation.createdAt,
  };
}

function buildGenerationScheme(candidate: GenerationCandidate, index: number): ProjectReportScheme {
  const { generation, result } = candidate;
  const feature = modeLabel(generation);
  const sourceUrl = readFormalImageUrl(generation.inputImageUrl);
  const sourceAssetId = readMetadataString(result.metadata, 'sourceImageAssetId')
    || readMetadataString(result.metadata, 'panoramaAssetId')
    || readMetadataString(result.metadata, 'snapshotAssetId');
  const title = readMetadataString(result.metadata, 'variantName')
    || readMetadataString(result.metadata, 'selectedStyleName')
    || readMetadataString(result.metadata, 'displayName')
    || `${feature}方案 ${index + 1}`;
  const description = readMetadataString(result.metadata, 'reportNarrative')
    || readMetadataString(result.metadata, 'designDescription')
    || readMetadataString(result.metadata, 'strategyNote')
    || generation.prompt
    || '暂无方案说明。';
  const resultImage = createReportImage({
    id: result.assetId || result.id,
    role: 'candidate',
    title,
    url: result.imageUrl,
    assetId: result.assetId,
    filename: `candidate-${index + 1}`,
    createdAt: result.createdAt,
  });
  const sourceImage = sourceUrl ? createReportImage({
    id: sourceAssetId || `source-${generation.id}`,
    role: 'source',
    title: `${title} · 原图`,
    url: sourceUrl,
    assetId: sourceAssetId,
    filename: `source-${index + 1}`,
    createdAt: generation.createdAt,
  }) : undefined;

  return {
    id: `scheme-${result.id}`,
    sourceType: 'generation-result',
    title,
    feature,
    description,
    prompt: generation.prompt || undefined,
    differenceSummary: readMetadataString(result.metadata, 'differenceSummary'),
    materialSummary: readMaterialSummary(result.metadata),
    sourceImage,
    resultImage,
    generationId: generation.id,
    generationResultId: result.id,
    isPrimary: result.isSelected,
    isFavorite: result.isFavorite,
    qualityStatus: readMetadataString(result.metadata, 'qualityStatus'),
    createdAt: result.createdAt,
  };
}

function buildPrimaryVersionScheme(editSessions: EditSessionDetail[]): ProjectReportScheme | null {
  for (const detail of editSessions) {
    const selectedId = detail.session.finalVersionId || detail.session.primaryVersionId;
    if (!selectedId) continue;
    const version = detail.versions.find(item => item.id === selectedId);
    if (!version || !readFormalImageUrl(version.publicUrl)) continue;
    const original = detail.versions.find(item => item.id === detail.session.originalVersionId);
    return {
      id: `version-scheme-${version.id}`,
      sourceType: 'edit-version',
      title: version.displayName || (detail.session.finalVersionId === version.id ? '最终主方案' : '主方案'),
      feature: '连续修改',
      description: version.note || version.userInstruction || detail.session.title,
      prompt: version.compiledPrompt || undefined,
      differenceSummary: version.userInstruction || undefined,
      materialSummary: [],
      sourceImage: original && readFormalImageUrl(original.publicUrl) ? createReportImage({
        id: original.assetId,
        role: 'source',
        title: '连续修改原图',
        url: original.publicUrl,
        assetId: original.assetId,
        filename: 'continuous-edit-source',
        createdAt: original.createdAt,
      }) : undefined,
      resultImage: createReportImage({
        id: version.assetId,
        role: 'primary',
        title: version.displayName || `V${version.versionNumber}`,
        url: version.publicUrl,
        assetId: version.assetId,
        filename: 'primary-scheme',
        createdAt: version.createdAt,
      }),
      sessionId: detail.session.id,
      versionId: version.id,
      parentVersionId: version.parentVersionId,
      isPrimary: true,
      isFavorite: false,
      createdAt: version.createdAt,
    };
  }
  return null;
}

function buildModificationHistory(editSessions: EditSessionDetail[]): ProjectReportHistoryItem[] {
  return editSessions
    .flatMap(detail => detail.messages
      .filter(message => message.role === 'user')
      .map(message => ({
        id: message.id,
        sessionId: detail.session.id,
        sessionTitle: detail.session.title,
        instruction: message.content,
        status: message.status,
        baseVersionId: message.baseVersionId,
        outputVersionId: message.outputVersionId,
        createdAt: message.createdAt,
      })))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function buildCover(project: Project, primaryScheme: ProjectReportScheme | null, schemes: ProjectReportScheme[]): ProjectReportImage | null {
  const coverUrl = readFormalImageUrl(project.coverImageUrl);
  if (coverUrl) {
    return createReportImage({
      id: `cover-${project.id}`,
      role: 'cover',
      title: `${project.name} · 项目封面`,
      url: coverUrl,
      filename: 'project-cover',
    });
  }
  const source = primaryScheme?.resultImage || schemes[0]?.resultImage;
  return source ? { ...source, role: 'cover', title: `${project.name} · 项目封面`, filename: `project-cover${readExtension(source.url)}` } : null;
}

function buildShare(share: BuildProjectReportInput['share'], generatedAt: string): ProjectReportShare {
  if (!share) return { status: 'not-created' };
  if (share.link.revokedAt) return { status: 'revoked', url: share.url, expiresAt: share.link.expiresAt };
  if (new Date(share.link.expiresAt).getTime() <= new Date(generatedAt).getTime()) {
    return { status: 'expired', url: share.url, expiresAt: share.link.expiresAt };
  }
  return { status: 'active', url: share.url, expiresAt: share.link.expiresAt };
}

function readMaterialSummary(metadata: Record<string, unknown> | undefined): string[] {
  const materials: string[] = [];
  const direct = [
    readMetadataString(metadata, 'materialName'),
    readMetadataString(metadata, 'targetMaterial'),
    readMetadataString(metadata, 'smartMaterial'),
  ].filter((item): item is string => Boolean(item));
  materials.push(...direct);
  const variableValues = isRecord(metadata?.variantVariableValues) ? metadata?.variantVariableValues : {};
  const matrixMaterial = readMetadataString(variableValues, 'material-system');
  if (matrixMaterial) materials.push(matrixMaterial);
  if (Array.isArray(metadata?.floorPlanMaterialAssignments)) {
    for (const item of metadata.floorPlanMaterialAssignments) {
      if (!isRecord(item)) continue;
      const materialName = readMetadataString(item, 'materialName');
      if (!materialName) continue;
      const region = readMetadataString(item, 'regionName') || readMetadataString(item, 'regionId');
      materials.push(region ? `${region}：${materialName}` : materialName);
    }
  }
  return Array.from(new Set(materials));
}

function createReportImage(input: {
  id: string;
  role: ProjectReportImageRole;
  title: string;
  url: string;
  assetId?: string;
  filename: string;
  createdAt?: string;
}): ProjectReportImage {
  const extension = readExtension(input.url);
  return {
    id: input.id,
    role: input.role,
    title: input.title,
    url: input.url,
    assetId: input.assetId,
    filename: input.filename.endsWith(extension) ? input.filename : `${input.filename}${extension}`,
    createdAt: input.createdAt,
  };
}

function uniqueImages(images: ProjectReportImage[]): ProjectReportImage[] {
  const seen = new Set<string>();
  return images.filter(image => {
    const key = image.assetId || image.url;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readFormalImageUrl(value: string | null | undefined): string | null {
  if (!value || value.startsWith('data:') || value.startsWith('blob:')) return null;
  return value;
}

function readExtension(url: string): string {
  const pathname = url.split(/[?#]/u)[0].toLowerCase();
  const match = /\.(png|jpe?g|webp|svg)$/u.exec(pathname);
  if (!match) return '.png';
  return match[1] === 'jpeg' ? '.jpg' : `.${match[1]}`;
}

function readMetadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function modeLabel(generation: GenerationRecord): string {
  if (generation.step === 'image_polish') return '质感提升';
  if (generation.step === 'object_insert') return '元素植入';
  if (generation.step === 'free_reference_image') return '自由参考生图';
  if (generation.mode === 'floorplan') return '基础效果图';
  if (generation.mode === 'design-variants') return '方案变体';
  if (generation.mode === 'material-replace') return '材质替换';
  if (generation.mode === 'plan-colorize') return '图纸表达';
  if (generation.mode === 'model-render') return '白模快渲';
  if (generation.mode === 'panorama-roam-render') return '全景表达';
  if (generation.mode === 'style-render') return '风格渲染';
  return '局部修改';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
