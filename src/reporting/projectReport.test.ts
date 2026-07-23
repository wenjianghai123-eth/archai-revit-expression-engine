import { describe, expect, it } from 'vitest';

import type { EditSessionDetail, GenerationRecord, Project, ShareLink } from '../lib/api';
import { buildProjectReportKey, buildProjectReportPackage } from './projectReport';

describe('project report data model', () => {
  it('builds a structured report from formal generation assets, edit history, materials, and sharing', () => {
    const project = createProject();
    const generation = createGeneration();
    const editSession = createEditSession();
    const shareLink: ShareLink = {
      id: 'share-1',
      projectId: project.id,
      token: 'token-1',
      permission: 'view',
      expiresAt: '2027-01-01T00:00:00.000Z',
      createdAt: '2026-07-16T00:00:00.000Z',
    };

    const report = buildProjectReportPackage({
      project,
      generations: [generation],
      editSessions: [editSession],
      selectedResultKeys: {
        [buildProjectReportKey(generation.id, 'result-1')]: true,
        [buildProjectReportKey(generation.id, 'result-2')]: false,
      },
      share: { link: shareLink, url: 'https://example.com/share/token-1' },
      generatedAt: '2026-07-16T12:00:00.000Z',
    });

    expect(report.schemaVersion).toBe('archai.project-report.v1');
    expect(report.project.objective).toBe('打造温暖、克制的客户接待空间。');
    expect(report.candidateSchemes).toHaveLength(1);
    expect(report.candidateSchemes[0]).toMatchObject({
      title: '暖木主方案',
      feature: '方案变体',
    });
    expect(report.candidateSchemes[0]).not.toHaveProperty('qualityStatus');
    expect(report.primaryScheme).toMatchObject({
      sourceType: 'edit-version',
      versionId: 'version-2',
      title: '最终汇报版',
    });
    expect(report.comparisons).toHaveLength(1);
    expect(report.materialNotes.map(note => note.material)).toContain('客厅：浅米色石材');
    expect(report.modificationHistory).toHaveLength(1);
    expect(report.sharing).toMatchObject({ status: 'active', url: 'https://example.com/share/token-1' });
    expect(report.imageFiles.some(image => image.assetId === 'asset-final')).toBe(true);
    expect(JSON.stringify(report)).not.toContain('data:image');
  });

  it('omits legacy data URLs from the formal report asset list', () => {
    const generation = createGeneration();
    generation.inputImageUrl = null;
    generation.inputImageDataPreview = 'data:image/png;base64,legacy';
    generation.results = [];
    generation.outputImageUrl = null;
    generation.outputImageDataPreview = 'data:image/png;base64,legacy-output';

    const report = buildProjectReportPackage({
      project: createProject(),
      generations: [generation],
      editSessions: [],
      selectedResultKeys: { [buildProjectReportKey(generation.id, generation.id)]: true },
      generatedAt: '2026-07-16T12:00:00.000Z',
    });

    expect(report.sourceImages).toEqual([]);
    expect(report.candidateSchemes).toEqual([]);
    expect(report.imageFiles).toEqual([]);
  });
});

function createProject(): Project {
  return {
    id: 'project-1',
    userId: 'user-1',
    name: '接待空间概念设计',
    description: '打造温暖、克制的客户接待空间。',
    status: 'active',
    coverImageUrl: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
  };
}

function createGeneration(): GenerationRecord {
  return {
    id: 'generation-1',
    userId: 'user-1',
    projectId: 'project-1',
    jobId: 'job-1',
    mode: 'design-variants',
    step: 'design_variants',
    prompt: '保持结构，形成暖木与米色石材的接待空间。',
    inputImageUrl: '/uploads/source.png',
    outputImageUrl: '/uploads/result-1.png',
    provider: 'apiyi-nano-banana2-edit',
    status: 'succeeded',
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    results: [
      {
        id: 'result-1',
        userId: 'user-1',
        projectId: 'project-1',
        jobId: 'job-1',
        assetId: 'asset-result-1',
        imageUrl: '/uploads/result-1.png',
        isSelected: true,
        isFavorite: true,
        metadata: {
          variantName: '暖木主方案',
          designDescription: '以暖木和浅米色石材形成稳定、亲和的接待氛围。',
          differenceSummary: '调整材质体系和灯光氛围，结构不变。',
          sourceImageAssetId: 'asset-source',
          floorPlanMaterialAssignments: [{ regionId: '客厅', materialName: '浅米色石材' }],
        },
        createdAt: '2026-07-10T00:01:00.000Z',
        updatedAt: '2026-07-10T00:01:00.000Z',
      },
      {
        id: 'result-2',
        userId: 'user-1',
        projectId: 'project-1',
        jobId: 'job-1',
        assetId: 'asset-result-2',
        imageUrl: '/uploads/result-2.png',
        isSelected: false,
        isFavorite: false,
        createdAt: '2026-07-10T00:02:00.000Z',
        updatedAt: '2026-07-10T00:02:00.000Z',
      },
    ],
  };
}

function createEditSession(): EditSessionDetail {
  return {
    session: {
      id: 'session-1',
      userId: 'user-1',
      projectId: 'project-1',
      sourceAssetId: 'asset-source',
      originalVersionId: 'version-0',
      currentVersionId: 'version-2',
      primaryVersionId: 'version-2',
      finalVersionId: 'version-2',
      title: '客户第二轮修改',
      permanentConstraints: {},
      aspectRatio: '16:9',
      status: 'finalized',
      createdAt: '2026-07-11T00:00:00.000Z',
      updatedAt: '2026-07-12T00:00:00.000Z',
    },
    versions: [
      {
        id: 'version-0',
        assetId: 'asset-source',
        sessionId: 'session-1',
        parentVersionId: null,
        versionNumber: 0,
        storagePath: 'source.png',
        publicUrl: '/uploads/source.png',
        userInstruction: '',
        compiledPrompt: '',
        provider: null,
        model: null,
        generationJobId: null,
        createdBy: 'user-1',
        createdAt: '2026-07-11T00:00:00.000Z',
      },
      {
        id: 'version-2',
        assetId: 'asset-final',
        sessionId: 'session-1',
        parentVersionId: 'version-1',
        versionNumber: 2,
        displayName: '最终汇报版',
        note: '客户确认后的主方案。',
        storagePath: 'final.png',
        publicUrl: '/uploads/final.png',
        userInstruction: '灯光更温暖，保留所有家具。',
        compiledPrompt: 'Keep structure and warm the lighting.',
        provider: 'apiyi',
        model: 'nano-banana-2',
        generationJobId: 'job-edit-2',
        createdBy: 'user-1',
        createdAt: '2026-07-12T00:00:00.000Z',
      },
    ],
    messages: [{
      id: 'message-1',
      sessionId: 'session-1',
      role: 'user',
      content: '灯光更温暖，保留所有家具。',
      baseVersionId: 'version-1',
      outputVersionId: 'version-2',
      generationJobId: 'job-edit-2',
      status: 'succeeded',
      createdAt: '2026-07-12T00:00:00.000Z',
      clientRequestId: 'client-1',
      errorCode: null,
      errorMessage: null,
    }],
  };
}
