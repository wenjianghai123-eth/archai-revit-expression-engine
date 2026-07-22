import type { ModelAssetRecord } from '../lib/api';
import type { FurnitureStyle, MaterialAsset, PromptTemplate } from '../types';
import type { ShowcaseCase } from '../constants/showcaseCases';
import { demoImageFallbacks, getFeatureDemoImage } from '../constants/demoImageFallbacks';

export type EnterpriseAssetKind =
  | 'material'
  | 'furniture'
  | 'lighting'
  | 'plant'
  | 'person'
  | 'style-reference'
  | 'project-case'
  | 'prompt-template';

export type EnterpriseAssetVisibility = 'personal' | 'administrator-shared';
export type EnterpriseAssetScope = 'all' | 'favorites' | 'recent' | 'project' | EnterpriseAssetVisibility;

export interface EnterpriseAssetSource {
  type: 'built-in' | 'local-import' | 'uploaded' | 'generated' | 'project-case' | 'prompt-template';
  label: string;
  originalName?: string;
  createdBy?: string;
}

export interface EnterpriseAssetReference {
  type: 'material' | 'furniture-style' | 'model-asset' | 'showcase-case' | 'prompt-template' | 'style-reference';
  id: string;
}

export interface EnterpriseAsset {
  id: string;
  kind: EnterpriseAssetKind;
  name: string;
  description: string;
  category: string;
  tags: string[];
  previewUrl: string;
  previewPreviousUiUrl?: string;
  previewFallbackUrl?: string;
  previewFinalFallbackUrl?: string;
  previewAlt?: string;
  fallbackIsDemoAsset?: boolean;
  visibility: EnterpriseAssetVisibility;
  source: EnterpriseAssetSource;
  reference: EnterpriseAssetReference;
  assetId?: string;
  createdAt?: string;
}

export interface EnterpriseAssetPreferences {
  favoriteIds: string[];
  recentUsage: Record<string, string>;
  projectLinks: Record<string, string[]>;
}

export interface EnterpriseAssetFilter {
  query: string;
  kind: EnterpriseAssetKind | 'all';
  category: string;
  tag: string;
  scope: EnterpriseAssetScope;
  projectId?: string | null;
}

export const enterpriseAssetKindDefinitions: Array<{ value: EnterpriseAssetKind; label: string }> = [
  { value: 'material', label: '材质' },
  { value: 'furniture', label: '家具' },
  { value: 'lighting', label: '灯具' },
  { value: 'plant', label: '绿植' },
  { value: 'person', label: '人物' },
  { value: 'style-reference', label: '风格参考' },
  { value: 'project-case', label: '项目案例' },
  { value: 'prompt-template', label: '提示词模板' },
];

export function adaptMaterialAsset(material: MaterialAsset): EnterpriseAsset {
  return {
    id: `material:${material.id}`,
    kind: 'material',
    name: material.name,
    description: material.description || '企业材质参考资源。',
    category: material.category || '未分类',
    tags: uniqueStrings(material.tags || []),
    previewUrl: material.thumbnail,
    previewFinalFallbackUrl: '/materials/material-001.png',
    fallbackIsDemoAsset: true,
    visibility: material.source === 'local-import' ? 'personal' : 'administrator-shared',
    source: {
      type: material.source === 'local-import' ? 'local-import' : 'built-in',
      label: material.source === 'local-import' ? '本地导入' : '企业材质库',
      originalName: material.originalFileName,
    },
    reference: { type: 'material', id: material.id },
    createdAt: material.importedAt || material.date,
  };
}

export function adaptFurnitureStyle(style: FurnitureStyle): EnterpriseAsset {
  return {
    id: `furniture:${style.id}`,
    kind: 'furniture',
    name: style.name,
    description: style.description || '企业家具与软装参考资源。',
    category: style.category || style.style || '家具',
    tags: uniqueStrings([style.style, ...(style.tags || [])]),
    previewUrl: style.thumbnail,
    previewPreviousUiUrl: demoImageFallbacks.object_insert.previousUiSrc,
    previewFallbackUrl: demoImageFallbacks.object_insert.fallbackSrc,
    previewFinalFallbackUrl: demoImageFallbacks.object_insert.finalFallbackSrc,
    fallbackIsDemoAsset: true,
    visibility: 'administrator-shared',
    source: { type: 'built-in', label: '企业家具风格库' },
    reference: { type: 'furniture-style', id: style.id },
  };
}

export function adaptPromptTemplate(template: PromptTemplate, currentUserId?: string): EnterpriseAsset {
  const isPersonal = Boolean(template.createdBy && currentUserId && template.createdBy === currentUserId && !template.isPublic);
  const fallback = getFeatureDemoImage(template.feature) || demoImageFallbacks.template_library;
  return {
    id: `prompt-template:${template.id}`,
    kind: 'prompt-template',
    name: template.title,
    description: template.description || template.promptText,
    category: template.category || template.featureName || '提示词模板',
    tags: uniqueStrings([template.featureName, template.recommendedStyle, ...(template.tags || [])]),
    previewUrl: template.coverUrl || template.outputUrl || template.previewImage,
    previewPreviousUiUrl: fallback.previousUiSrc,
    previewFallbackUrl: fallback.fallbackSrc,
    previewFinalFallbackUrl: fallback.finalFallbackSrc,
    fallbackIsDemoAsset: true,
    visibility: isPersonal ? 'personal' : 'administrator-shared',
    source: {
      type: 'prompt-template',
      label: template.templateSource === 'generation_result' ? '生成结果沉淀' : '企业提示词模板',
      createdBy: template.createdBy,
    },
    reference: { type: 'prompt-template', id: template.id },
    assetId: template.coverAssetId || template.outputAssetId,
    createdAt: template.createdAt,
  };
}

export function adaptStyleReferenceFromTemplate(template: PromptTemplate): EnterpriseAsset | null {
  if (template.feature !== 'style-render' && template.feature !== 'free-reference-image' && !template.recommendedStyle) return null;
  const previewUrl = template.coverUrl || template.outputUrl || template.previewImage;
  if (!previewUrl) return null;
  return {
    id: `style-reference:${template.id}`,
    kind: 'style-reference',
    name: template.recommendedStyle || `${template.title} · 风格参考`,
    description: template.description || '由现有提示词模板沉淀的风格参考。',
    category: template.recommendedStyle || template.category || '综合风格',
    tags: uniqueStrings([template.recommendedStyle, template.category, ...(template.tags || [])]),
    previewUrl,
    previewPreviousUiUrl: demoImageFallbacks.free_reference_image.previousUiSrc,
    previewFallbackUrl: demoImageFallbacks.free_reference_image.fallbackSrc,
    previewFinalFallbackUrl: demoImageFallbacks.free_reference_image.finalFallbackSrc,
    fallbackIsDemoAsset: true,
    visibility: template.isPublic === false ? 'personal' : 'administrator-shared',
    source: { type: 'prompt-template', label: '提示词模板风格预览', createdBy: template.createdBy },
    reference: { type: 'style-reference', id: template.id },
    assetId: template.coverAssetId || template.outputAssetId,
    createdAt: template.createdAt,
  };
}

export function adaptShowcaseCase(showcaseCase: ShowcaseCase): EnterpriseAsset {
  return {
    id: `project-case:${showcaseCase.id}`,
    kind: 'project-case',
    name: showcaseCase.title,
    description: showcaseCase.description,
    category: showcaseCase.scenario,
    tags: uniqueStrings([showcaseCase.scenario, showcaseCase.featureId, ...showcaseCase.highlights]),
    previewUrl: showcaseCase.resultImage,
    previewPreviousUiUrl: showcaseCase.resultPreviousUi,
    previewFallbackUrl: showcaseCase.resultFallback,
    previewFinalFallbackUrl: showcaseCase.resultFinalFallback,
    previewAlt: showcaseCase.resultAlt,
    fallbackIsDemoAsset: showcaseCase.fallbackIsDemoAsset,
    visibility: 'administrator-shared',
    source: { type: 'project-case', label: '案例配置（含演示回退）' },
    reference: { type: 'showcase-case', id: showcaseCase.id },
  };
}

export function adaptModelAsset(asset: ModelAssetRecord): EnterpriseAsset {
  const kind = inferModelAssetKind(asset);
  const name = asset.originalFilename.replace(/\.[^.]+$/u, '');
  return {
    id: `${kind}:${asset.id}`,
    kind,
    name,
    description: `个人上传的 ${asset.fileType.toUpperCase()} 素材，可在三维模型管理中查看和维护。`,
    category: kindLabel(kind),
    tags: uniqueStrings([asset.fileType.toUpperCase(), '个人上传', kindLabel(kind)]),
    previewUrl: asset.thumbnailUrl || asset.metadata?.thumbnailUrl || createModelPlaceholder(name, asset.fileType),
    previewPreviousUiUrl: demoImageFallbacks.model_snapshot_render.previousUiSrc,
    previewFallbackUrl: demoImageFallbacks.model_snapshot_render.fallbackSrc,
    previewFinalFallbackUrl: demoImageFallbacks.model_snapshot_render.finalFallbackSrc,
    fallbackIsDemoAsset: true,
    visibility: 'personal',
    source: {
      type: 'uploaded',
      label: '个人上传资产',
      originalName: asset.originalFilename,
    },
    reference: { type: 'model-asset', id: asset.id },
    assetId: asset.id,
    createdAt: asset.createdAt,
  };
}

export function applyEnterpriseAssetPreferences(
  assets: EnterpriseAsset[],
  preferences: EnterpriseAssetPreferences,
): Array<EnterpriseAsset & { isFavorite: boolean; lastUsedAt?: string; projectIds: string[] }> {
  const favoriteIds = new Set(preferences.favoriteIds);
  return assets.map(asset => ({
    ...asset,
    isFavorite: favoriteIds.has(asset.id),
    lastUsedAt: preferences.recentUsage[asset.id],
    projectIds: preferences.projectLinks[asset.id] || [],
  }));
}

export function filterEnterpriseAssets(
  assets: ReturnType<typeof applyEnterpriseAssetPreferences>,
  filter: EnterpriseAssetFilter,
): ReturnType<typeof applyEnterpriseAssetPreferences> {
  const query = filter.query.trim().toLowerCase();
  return assets
    .filter(asset => {
      const searchable = [
        asset.name,
        asset.description,
        asset.category,
        asset.source.label,
        asset.source.originalName,
        ...asset.tags,
      ].filter(Boolean).join(' ').toLowerCase();
      const matchesQuery = !query || searchable.includes(query);
      const matchesKind = filter.kind === 'all' || asset.kind === filter.kind;
      const matchesCategory = filter.category === 'all' || asset.category === filter.category;
      const matchesTag = filter.tag === 'all' || asset.tags.includes(filter.tag);
      const matchesScope = filter.scope === 'all'
        || (filter.scope === 'favorites' && asset.isFavorite)
        || (filter.scope === 'recent' && Boolean(asset.lastUsedAt))
        || (filter.scope === 'project' && Boolean(filter.projectId && asset.projectIds.includes(filter.projectId)))
        || asset.visibility === filter.scope;
      return matchesQuery && matchesKind && matchesCategory && matchesTag && matchesScope;
    })
    .sort((left, right) => {
      if (filter.scope === 'recent') return (right.lastUsedAt || '').localeCompare(left.lastUsedAt || '');
      if (left.isFavorite !== right.isFavorite) return left.isFavorite ? -1 : 1;
      return (right.createdAt || '').localeCompare(left.createdAt || '') || left.name.localeCompare(right.name, 'zh-CN');
    });
}

export function readEnterpriseAssetKindLabel(kind: EnterpriseAssetKind): string {
  return enterpriseAssetKindDefinitions.find(item => item.value === kind)?.label || kind;
}

function inferModelAssetKind(asset: ModelAssetRecord): EnterpriseAssetKind {
  const text = `${asset.originalFilename} ${asset.filename}`.toLowerCase();
  if (/lamp|light|chandelier|sconce|灯|吊灯|壁灯/u.test(text)) return 'lighting';
  if (/plant|tree|flower|grass|绿植|植物|树|花/u.test(text)) return 'plant';
  if (/person|people|human|man|woman|人物|人像/u.test(text)) return 'person';
  return 'furniture';
}

function kindLabel(kind: EnterpriseAssetKind): string {
  return readEnterpriseAssetKindLabel(kind);
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value))));
}

function createModelPlaceholder(name: string, fileType: string): string {
  const safeName = name.replace(/[<>&"']/gu, '').slice(0, 18);
  const safeType = fileType.toUpperCase().replace(/[^A-Z0-9]/gu, '').slice(0, 8);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="#f1f5f9"/><rect x="88" y="64" width="464" height="272" rx="28" fill="#dbeafe"/><path d="m320 102 118 68v132l-118 68-118-68V170z" fill="#2563eb" opacity=".9"/><path d="m320 102 118 68-118 68-118-68z" fill="#60a5fa"/><text x="320" y="302" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" font-weight="700" fill="#fff">${safeType}</text><text x="320" y="378" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" font-weight="700" fill="#334155">${safeName}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
