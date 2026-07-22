import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createEditMessage,
  getEditSession,
  getGenerationJob,
  markEditVersionExported,
  restoreEditVersion,
  selectEditVersion,
  setFinalEditVersion,
  setPrimaryEditVersion,
  updateEditVersion,
  type EditSessionDetail,
} from '../lib/api';
import type { EditConstraint, EditJobState } from '../types';

export interface SendEditInput {
  instruction: string;
  baseVersionId: string;
  imageSize: '1K' | '2K' | '4K';
  generationKind: 'preview-edit' | 'final-render';
  maskAssetId?: string;
  constraints: Partial<Record<EditConstraint, boolean>>;
  clientRequestId?: string;
}

export function useImageEditSession(
  initial: EditSessionDetail,
  refreshCredits: () => Promise<void>,
) {
  const [detail, setDetail] = useState(initial);
  const [selectedVersionId, setSelectedVersionId] = useState(initial.session.currentVersionId);
  const [jobState, setJobState] = useState<EditJobState | null>(null);
  const mounted = useRef(true);
  const submitting = useRef(false);

  useEffect(() => {
    setDetail(initial);
    setSelectedVersionId(initial.session.currentVersionId);
    setJobState(null);
  }, [initial.session.id]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const next = await getEditSession(detail.session.id);
    if (mounted.current) setDetail(next);
    return next;
  }, [detail.session.id]);

  const chooseVersion = useCallback((versionId: string) => {
    setSelectedVersionId(versionId);
  }, []);

  const makeCurrent = useCallback(async (versionId: string) => {
    const result = await selectEditVersion(detail.session.id, versionId);
    if (!mounted.current) return;
    setDetail(previous => ({ ...previous, session: result.session }));
    setSelectedVersionId(versionId);
  }, [detail.session.id]);

  const saveVersionMetadata = useCallback(async (
    versionId: string,
    input: { displayName?: string | null; note?: string | null },
  ) => {
    const version = await updateEditVersion(detail.session.id, versionId, input);
    if (mounted.current) {
      setDetail(previous => ({
        ...previous,
        versions: previous.versions.map(item => item.id === version.id ? version : item),
      }));
    }
    return version;
  }, [detail.session.id]);

  const restoreVersion = useCallback(async (versionId: string) => {
    const result = await restoreEditVersion(detail.session.id, versionId);
    if (mounted.current) {
      setDetail(previous => ({
        ...previous,
        session: result.session,
        versions: [...previous.versions, result.version]
          .sort((a, b) => a.versionNumber - b.versionNumber),
      }));
      setSelectedVersionId(result.version.id);
    }
    return result.version;
  }, [detail.session.id]);

  const markPrimary = useCallback(async (versionId: string) => {
    const session = await setPrimaryEditVersion(detail.session.id, versionId);
    if (mounted.current) setDetail(previous => ({ ...previous, session }));
  }, [detail.session.id]);

  const markFinal = useCallback(async (versionId: string) => {
    const session = await setFinalEditVersion(detail.session.id, versionId);
    if (mounted.current) setDetail(previous => ({ ...previous, session }));
  }, [detail.session.id]);

  const markExported = useCallback(async (versionId: string) => {
    const version = await markEditVersionExported(detail.session.id, versionId);
    if (mounted.current) {
      setDetail(previous => ({
        ...previous,
        versions: previous.versions.map(item => item.id === version.id ? version : item),
      }));
    }
  }, [detail.session.id]);

  useEffect(() => {
    const pending = [...initial.messages]
      .reverse()
      .find(message => (
        message.status === 'queued' || message.status === 'running'
      ) && Boolean(message.generationJobId));
    if (!pending?.generationJobId) return;

    let cancelled = false;
    setJobState({
      jobId: pending.generationJobId,
      messageId: pending.id,
      baseVersionId: pending.baseVersionId || initial.session.currentVersionId,
      instruction: pending.content,
      imageSize: '1K',
      generationKind: 'preview-edit',
      constraints: {},
      status: pending.status,
      progress: 0,
      error: null,
    });

    void pollGenerationJob({
      jobId: pending.generationJobId,
      shouldStop: () => cancelled,
      onProgress: job => {
        setJobState(previous => previous ? {
          ...previous,
          status: job.status,
          progress: job.progress,
        } : previous);
      },
    }).then(async job => {
      if (cancelled) return;
      if (job.status !== 'succeeded') throw buildGenerationError(job);
      const next = await refresh();
      const output = next.versions.find(version => version.generationJobId === job.id);
      setSelectedVersionId(output?.id || next.session.currentVersionId);
      setJobState(previous => previous ? {
        ...previous,
        status: 'succeeded',
        progress: 100,
        error: null,
      } : previous);
      await refreshCredits();
    }).catch(async error => {
      if (cancelled) return;
      setJobState(previous => previous ? {
        ...previous,
        status: 'failed',
        error: error instanceof Error ? error.message : '生成失败。',
      } : previous);
      await refresh().catch(() => undefined);
      await refreshCredits();
    });

    return () => {
      cancelled = true;
    };
  }, [
    initial.messages,
    initial.session.currentVersionId,
    refresh,
    refreshCredits,
  ]);

  const send = useCallback(async (input: SendEditInput) => {
    if (submitting.current) return;
    submitting.current = true;
    const requestInput = {
      ...input,
      clientRequestId: input.clientRequestId || crypto.randomUUID(),
    };

    try {
      const response = await createEditMessage(detail.session.id, requestInput);
      const initialJob: EditJobState = {
        jobId: response.jobId,
        messageId: response.message.id,
        baseVersionId: input.baseVersionId,
        instruction: input.instruction,
        imageSize: input.imageSize,
        generationKind: input.generationKind,
        maskAssetId: input.maskAssetId,
        constraints: input.constraints,
        status: 'queued',
        progress: 0,
        error: null,
      };
      if (mounted.current) setJobState(initialJob);

      const job = await pollGenerationJob({
        jobId: response.jobId,
        shouldStop: () => !mounted.current,
        onProgress: nextJob => {
          setJobState(previous => previous ? {
            ...previous,
            status: nextJob.status,
            progress: nextJob.progress,
          } : previous);
        },
      });
      if (!mounted.current) return;
      if (job.status !== 'succeeded') throw buildGenerationError(job);

      const next = await refresh();
      const output = next.versions.find(version => version.generationJobId === job.id);
      setSelectedVersionId(output?.id || next.session.currentVersionId);
      setJobState(previous => previous ? {
        ...previous,
        status: 'succeeded',
        progress: 100,
        error: null,
      } : previous);
      await refreshCredits();
    } catch (error) {
      if (mounted.current) {
        setJobState(previous => previous ? {
          ...previous,
          status: 'failed',
          error: error instanceof Error ? error.message : '生成失败，请重试。',
        } : previous);
      }
      await refresh().catch(() => undefined);
      await refreshCredits();
    } finally {
      submitting.current = false;
    }
  }, [detail.session.id, refresh, refreshCredits]);

  return {
    detail,
    selectedVersionId,
    selectedVersion: detail.versions.find(version => version.id === selectedVersionId)
      || detail.versions[0],
    jobState,
    isGenerating: jobState?.status === 'queued' || jobState?.status === 'running',
    chooseVersion,
    makeCurrent,
    saveVersionMetadata,
    restoreVersion,
    markPrimary,
    markFinal,
    markExported,
    send,
    refresh,
  };
}

async function pollGenerationJob({
  jobId,
  shouldStop,
  onProgress,
}: {
  jobId: string;
  shouldStop: () => boolean;
  onProgress: (job: Awaited<ReturnType<typeof getGenerationJob>>) => void;
}) {
  let job = await getGenerationJob(jobId);
  const started = Date.now();
  while (!shouldStop() && (job.status === 'queued' || job.status === 'running')) {
    onProgress(job);
    if (Date.now() - started > 10 * 60 * 1000) {
      throw new Error('生成时间较长，请稍后重试或重新打开会话。');
    }
    await delay(readPollDelay(Date.now() - started));
    job = await getGenerationJob(jobId);
  }
  return job;
}

function buildGenerationError(job: Awaited<ReturnType<typeof getGenerationJob>>) {
  const code = job.diagnostics?.provider?.providerError || job.status.toUpperCase();
  return new Error(`${code}: ${job.errorMessage || job.failureReason || '生成失败，请重试。'}`);
}

function delay(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function readPollDelay(elapsed: number) {
  if (elapsed < 10_000) return 1_000;
  if (elapsed < 120_000) return 2_500;
  return 5_000;
}
