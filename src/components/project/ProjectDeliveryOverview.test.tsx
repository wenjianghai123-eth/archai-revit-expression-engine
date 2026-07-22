import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProjectDeliveryOverview } from './ProjectDeliveryOverview';

describe('ProjectDeliveryOverview', () => {
  it('summarizes main scheme, candidates, edit history, sharing, and report state', () => {
    const markup = renderToStaticMarkup(
      <ProjectDeliveryOverview
        editSessions={[{
          session: {
            id: 'session-1',
            userId: 'user-1',
            projectId: 'project-1',
            sourceAssetId: 'asset-0',
            originalVersionId: 'v0',
            currentVersionId: 'v2',
            primaryVersionId: 'v2',
            finalVersionId: 'v2',
            title: '客户改稿',
            permanentConstraints: {},
            aspectRatio: '16:9',
            status: 'active',
            createdAt: '2026-07-16T00:00:00Z',
            updatedAt: '2026-07-16T00:00:00Z',
          },
          versions: [
            version('v0', 0),
            version('v1', 1),
            { ...version('v2', 2), displayName: '确认方案' },
          ],
          messages: [
            message('m1'),
            message('m2'),
          ],
        }]}
        customerShareStatus="active"
        selectedReportCount={2}
        reportOptionCount={3}
        reportExportedAt="2026-07-16T08:00:00Z"
        onOpenSession={() => undefined}
      />,
    );

    expect(markup).toContain('方案交付闭环');
    expect(markup).toContain('主方案');
    expect(markup).toContain('1 个');
    expect(markup).toContain('修改历史');
    expect(markup).toContain('2 轮');
    expect(markup).toContain('已分享');
    expect(markup).toContain('已导出');
    expect(markup).toContain('确认方案');
    expect(markup).toContain('最终方案');
  });
});

function version(id: string, versionNumber: number) {
  return {
    id,
    assetId: `asset-${id}`,
    sessionId: 'session-1',
    parentVersionId: versionNumber ? `v${versionNumber - 1}` : null,
    versionNumber,
    storagePath: `${id}.png`,
    publicUrl: `/${id}.png`,
    userInstruction: versionNumber ? `修改 ${versionNumber}` : '',
    compiledPrompt: '',
    provider: null,
    model: null,
    generationJobId: null,
    createdBy: 'user-1',
    createdAt: `2026-07-16T00:0${versionNumber}:00Z`,
  };
}

function message(id: string) {
  return {
    id,
    sessionId: 'session-1',
    role: 'user' as const,
    content: '修改',
    baseVersionId: 'v0',
    outputVersionId: 'v1',
    generationJobId: 'job-1',
    status: 'succeeded' as const,
    createdAt: '2026-07-16T00:00:00Z',
    clientRequestId: id,
    errorCode: null,
    errorMessage: null,
  };
}
