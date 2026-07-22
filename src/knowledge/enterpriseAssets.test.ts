import { describe, expect, it } from 'vitest';

import type { MaterialAsset, PromptTemplate } from '../types';
import {
  adaptMaterialAsset,
  adaptPromptTemplate,
  applyEnterpriseAssetPreferences,
  filterEnterpriseAssets,
} from './enterpriseAssets';

describe('enterprise asset model', () => {
  const material: MaterialAsset = {
    id: 'material-1',
    name: '浅米色洞石',
    thumbnail: '/materials/travertine.png',
    category: '石材',
    date: '2026-07-16',
    description: '适合接待空间和客厅地面。',
    tags: ['米色', '石材', '地面'],
  };
  const template: PromptTemplate = {
    id: 'template-1',
    title: '暖木接待空间',
    category: '风格渲染',
    feature: 'style-render',
    description: '保持结构，形成暖木与米色石材空间。',
    previewImage: '/templates/warm-wood.png',
    promptText: 'Warm wood reception space.',
    tags: ['暖木', '接待空间'],
    config: {},
    isPublic: true,
  };

  it('adapts legacy library records without changing their original types', () => {
    const materialAsset = adaptMaterialAsset(material);
    const templateAsset = adaptPromptTemplate(template, 'user-1');
    expect(materialAsset).toMatchObject({
      id: 'material:material-1',
      kind: 'material',
      category: '石材',
      visibility: 'administrator-shared',
      reference: { type: 'material', id: material.id },
    });
    expect(templateAsset).toMatchObject({
      id: 'prompt-template:template-1',
      kind: 'prompt-template',
      reference: { type: 'prompt-template', id: template.id },
    });
  });

  it('filters by query, type, tag, favorite, recent use, project link, and visibility', () => {
    const base = [adaptMaterialAsset(material), adaptPromptTemplate(template, 'user-1')];
    const assets = applyEnterpriseAssetPreferences(base, {
      favoriteIds: ['material:material-1'],
      recentUsage: { 'prompt-template:template-1': '2026-07-16T12:00:00.000Z' },
      projectLinks: { 'material:material-1': ['project-1'] },
    });
    const common = { category: 'all', tag: 'all', projectId: 'project-1' };

    expect(filterEnterpriseAssets(assets, { ...common, query: '洞石', kind: 'all', scope: 'all' }).map(asset => asset.id)).toEqual(['material:material-1']);
    expect(filterEnterpriseAssets(assets, { ...common, query: '', kind: 'prompt-template', scope: 'all' })).toHaveLength(1);
    expect(filterEnterpriseAssets(assets, { ...common, query: '', kind: 'all', tag: '米色', scope: 'all' })).toHaveLength(1);
    expect(filterEnterpriseAssets(assets, { ...common, query: '', kind: 'all', scope: 'favorites' }).map(asset => asset.id)).toEqual(['material:material-1']);
    expect(filterEnterpriseAssets(assets, { ...common, query: '', kind: 'all', scope: 'recent' }).map(asset => asset.id)).toEqual(['prompt-template:template-1']);
    expect(filterEnterpriseAssets(assets, { ...common, query: '', kind: 'all', scope: 'project' }).map(asset => asset.id)).toEqual(['material:material-1']);
    expect(filterEnterpriseAssets(assets, { ...common, query: '', kind: 'all', scope: 'administrator-shared' })).toHaveLength(2);
  });
});
