import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { ProjectReportPackage } from '../../reporting/projectReport';
import { ProjectReportPrintView } from './ProjectReportPrintView';

describe('ProjectReportPrintView', () => {
  it('renders report sections from the report model instead of raw project records', () => {
    const html = renderToStaticMarkup(<ProjectReportPrintView report={createReport()} />);
    expect(html).toContain('项目目标');
    expect(html).toContain('主方案');
    expect(html).toContain('候选方案');
    expect(html).toContain('材质说明');
    expect(html).toContain('修改历史');
    expect(html).toContain('https://example.com/share/report');
    expect(html).toContain('archai.project-report.v1');
  });
});

function createReport(): ProjectReportPackage {
  const source = { id: 'source', role: 'source' as const, title: '原图', assetId: 'asset-source', url: '/uploads/source.png', filename: 'source.png' };
  const result = { id: 'result', role: 'candidate' as const, title: '方案 A', assetId: 'asset-result', url: '/uploads/result.png', filename: 'result.png' };
  const scheme = {
    id: 'scheme-1',
    sourceType: 'generation-result' as const,
    title: '方案 A',
    feature: '方案变体',
    description: '暖木与米色石材方向。',
    differenceSummary: '结构不变，调整材质和灯光。',
    materialSummary: ['浅米色石材'],
    sourceImage: source,
    resultImage: result,
    isPrimary: true,
    isFavorite: true,
    createdAt: '2026-07-16T00:00:00.000Z',
  };
  return {
    schemaVersion: 'archai.project-report.v1',
    id: 'report-1',
    generatedAt: '2026-07-16T12:00:00.000Z',
    project: {
      id: 'project-1',
      name: '接待空间',
      objective: '形成可供客户确认的接待空间方案。',
      status: 'active',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-16T00:00:00.000Z',
    },
    cover: { ...result, role: 'cover', title: '项目封面' },
    sourceImages: [source],
    candidateSchemes: [scheme],
    comparisons: [{ id: 'compare-1', title: '前后对比', before: source, after: result, description: '结构不变。' }],
    materialNotes: [{ id: 'material-1', schemeId: scheme.id, material: '浅米色石材' }],
    modificationHistory: [{
      id: 'message-1',
      sessionId: 'session-1',
      sessionTitle: '客户修改',
      instruction: '灯光更温暖。',
      status: 'succeeded',
      createdAt: '2026-07-15T00:00:00.000Z',
    }],
    primaryScheme: scheme,
    sharing: { status: 'active', url: 'https://example.com/share/report' },
    imageFiles: [source, result],
    summary: {
      sourceImageCount: 1,
      candidateSchemeCount: 1,
      comparisonCount: 1,
      materialNoteCount: 1,
      modificationCount: 1,
      imageFileCount: 2,
    },
  };
}
