import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Minus, Plus } from 'lucide-react';
import {
  uploadImageAsset,
  type EditSessionDetail,
} from '../lib/api';
import type { EditConstraint, EditMessage } from '../types';
import {
  useImageEditSession,
  type SendEditInput,
} from '../hooks/useImageEditSession';
import {
  GenerationImageViewer,
  type ViewMode,
} from './common/GenerationImageViewer';
import { VersionTree } from './VersionTree';
import {
  buildResultImageFilename,
  downloadAsset,
} from '../utils/downloadAsset';
import { getGenerationCreditCost } from '../utils/generationCredits';
import { resolveAssetUrl } from '../utils/assetUrl';
import { MaskEditor } from './MaskEditor';
import { EditSessionChatPanel } from './edit-session/EditSessionChatPanel';
import { EditVersionInspector } from './edit-session/EditVersionInspector';
import { GenerationResultActions } from './common/GenerationResultActions';
import { GenerationProgress } from './common/GenerationProgress';
import { normalizeGenerationTaskStatus, readGenerationProgressLabel, type NormalizedGenerationResult } from '../utils/normalizeGenerationResult';

interface ImageEditSessionWorkspaceProps {
  initialDetail: EditSessionDetail;
  creditBalance: number | null;
  onRefreshCredits: () => Promise<void>;
  onSendVersionToPolish?: (version: EditSessionDetail['versions'][number]) => Promise<void>;
  onClose: () => void;
}

const defaultConstraints: Partial<Record<EditConstraint, boolean>> = {
  strictStructure: true,
  preserveCamera: true,
  preserveAspectRatio: true,
  forbidNewComponents: true,
};

export function ImageEditSessionWorkspace({
  initialDetail,
  creditBalance,
  onRefreshCredits,
  onSendVersionToPolish,
  onClose,
}: ImageEditSessionWorkspaceProps) {
  const edit = useImageEditSession(initialDetail, onRefreshCredits);
  const [instruction, setInstruction] = useState('');
  const [constraints, setConstraints] = useState(defaultConstraints);
  const [finalSize, setFinalSize] = useState<'2K' | '4K'>('2K');
  const [zoom, setZoom] = useState(1);
  const [retryInput, setRetryInput] = useState<SendEditInput | null>(null);
  const [showMaskEditor, setShowMaskEditor] = useState(false);
  const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);
  const [maskAssetId, setMaskAssetId] = useState<string>();
  const initialSelectedVersion = initialDetail.versions.find(
    version => version.id === initialDetail.session.currentVersionId,
  ) || initialDetail.versions[0];
  const initialCompareVersionId = initialSelectedVersion?.parentVersionId || null;
  const [compareVersionId, setCompareVersionId] = useState<string | null>(
    initialCompareVersionId,
  );
  const [viewerMode, setViewerMode] = useState<ViewMode>(
    initialCompareVersionId ? 'overlay' : 'result',
  );
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const selected = edit.selectedVersion;
  const original = edit.detail.versions.find(
    version => version.id === edit.detail.session.originalVersionId,
  );
  const parent = selected?.parentVersionId
    ? edit.detail.versions.find(version => version.id === selected.parentVersionId) || null
    : null;
  const children = selected
    ? edit.detail.versions.filter(version => version.parentVersionId === selected.id)
    : [];
  const selectedIndex = edit.detail.versions.findIndex(
    version => version.id === selected?.id,
  );
  const next = selectedIndex >= 0
    ? edit.detail.versions[selectedIndex + 1]
    : undefined;
  const compareVersion = compareVersionId
    ? edit.detail.versions.find(version => version.id === compareVersionId) || null
    : null;

  useEffect(() => {
    const defaultCompareId = parent?.id || null;
    setCompareVersionId(defaultCompareId);
    setViewerMode(defaultCompareId ? 'overlay' : 'result');
  }, [parent?.id, selected?.id]);

  useEffect(() => {
    setMaskDataUrl(null);
    setMaskAssetId(undefined);
    setShowMaskEditor(false);
    setRetryInput(null);
    setWorkspaceError(null);
  }, [selected?.id]);

  const messages = useMemo(() => {
    if (
      !edit.jobState
      || edit.detail.messages.some(message => message.id === edit.jobState?.messageId)
    ) {
      return edit.detail.messages;
    }
    const optimistic: EditMessage = {
      id: edit.jobState.messageId,
      sessionId: edit.detail.session.id,
      role: 'user',
      content: edit.jobState.instruction,
      baseVersionId: edit.jobState.baseVersionId,
      outputVersionId: null,
      generationJobId: edit.jobState.jobId,
      status: edit.jobState.status,
      clientRequestId: null,
      errorCode: null,
      errorMessage: edit.jobState.error,
      createdAt: new Date().toISOString(),
    };
    return [...edit.detail.messages, optimistic];
  }, [edit.detail.messages, edit.detail.session.id, edit.jobState]);

  const previewCreditCost = getGenerationCreditCost('style-render', {
    apiyiImageSize: '1K',
  });
  const finalCreditCost = getGenerationCreditCost('style-render', {
    apiyiImageSize: finalSize,
  });

  const attachMask = async (input: SendEditInput): Promise<SendEditInput> => {
    if (!maskDataUrl) return input;
    if (maskAssetId) return { ...input, maskAssetId };
    const response = await fetch(maskDataUrl);
    const blob = await response.blob();
    const asset = await uploadImageAsset(
      blob,
      `continuous-edit-mask-${selected?.id || Date.now()}.png`,
    );
    setMaskAssetId(asset.id);
    return { ...input, maskAssetId: asset.id };
  };

  const submit = async (input: SendEditInput) => {
    setRetryInput(null);
    setWorkspaceError(null);
    try {
      await edit.send(await attachMask(input));
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : '提交修改失败，请重试。');
    }
  };

  const handleSend = () => {
    const text = instruction.trim();
    if (!text || !selected || edit.isGenerating) return;
    void submit({
      instruction: text,
      baseVersionId: selected.id,
      imageSize: '1K',
      generationKind: 'preview-edit',
      constraints,
    });
  };

  const handleFinalize = () => {
    if (!selected || edit.isGenerating) return;
    void submit({
      instruction: '基于当前版本生成高清定稿，保持所有设计、结构、材质、灯光、相机和构图不变，仅提升清晰度与细节质量。',
      baseVersionId: selected.id,
      imageSize: finalSize,
      generationKind: 'final-render',
      constraints: {
        ...constraints,
        strictStructure: true,
        preserveCamera: true,
        preserveAspectRatio: true,
        forbidNewComponents: true,
      },
    });
  };

  const handleExport = async () => {
    if (!selected) return;
    await downloadAsset(
      { assetId: selected.assetId, url: selected.publicUrl },
      buildResultImageFilename({
        featureLabel: `连续编辑-V${selected.versionNumber}`,
      }),
    );
    await edit.markExported(selected.id);
  };

  const handleRestore = async () => {
    if (!selected) return;
    const confirmed = window.confirm(
      `恢复 V${selected.versionNumber} 会创建一个新的子版本，现有版本不会被覆盖。是否继续？`,
    );
    if (!confirmed) return;
    await edit.restoreVersion(selected.id);
  };

  if (!selected) {
    return (
      <div className="flex flex-1 items-center justify-center bg-slate-100 p-6 text-sm text-slate-500">
        当前会话没有可查看的版本。
      </div>
    );
  }

  const taskStatus = normalizeGenerationTaskStatus({
    jobStatus: edit.jobState?.status || null,
    isGenerating: edit.isGenerating,
  });
  const normalizedResult: NormalizedGenerationResult = {
    originalImageUrl: original?.publicUrl || null,
    originalAssetId: original?.assetId || null,
    resultImageUrl: selected.versionNumber > 0 ? selected.publicUrl : null,
    resultAssetId: selected.versionNumber > 0 ? selected.assetId : null,
    taskId: edit.jobState?.jobId || null,
    status: taskStatus,
    progress: edit.jobState?.progress ?? null,
    progressLabel: readGenerationProgressLabel(taskStatus),
    errorMessage: edit.jobState?.error || null,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-100 p-3">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border bg-white p-2 text-slate-600"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h2 className="font-bold text-slate-900">{edit.detail.session.title}</h2>
            <p className="text-xs text-slate-500">
              从 V{selected.versionNumber} 继续修改 · 余额 {creditBalance ?? '--'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-bold">
          <span className="rounded-full bg-white px-3 py-1.5 text-slate-600">
            当前工作版本 V{readVersionNumber(edit.detail.versions, edit.detail.session.currentVersionId)}
          </span>
          <span className="rounded-full bg-blue-50 px-3 py-1.5 text-blue-700">
            主方案 {readVersionLabel(edit.detail.versions, edit.detail.session.primaryVersionId)}
          </span>
          <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-700">
            最终方案 {readVersionLabel(edit.detail.versions, edit.detail.session.finalVersionId)}
          </span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-h-0 overflow-y-auto rounded-2xl border bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-blue-600 px-3 py-1 text-sm font-bold text-white">
                V{selected.versionNumber}
              </span>
              <span className="text-sm font-bold text-slate-800">
                {selected.displayName || selected.userInstruction || '原图'}
              </span>
              {edit.detail.session.currentVersionId === selected.id ? (
                <span className="text-xs font-bold text-emerald-600">当前工作版本</span>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="缩小图片"
                onClick={() => setZoom(value => Math.max(0.5, value - 0.25))}
                className="rounded-lg border p-2"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-14 text-center text-xs">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                aria-label="放大图片"
                onClick={() => setZoom(value => Math.min(2, value + 0.25))}
                className="rounded-lg border p-2"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <GenerationImageViewer
            sourceImageUrl={compareVersion?.publicUrl}
            sourceImageAssetId={compareVersion?.assetId}
            resultImageUrl={selected.publicUrl}
            resultImageAssetId={selected.assetId}
            aspectRatio={readViewerAspectRatio(edit.detail.session.aspectRatio)}
            viewMode={viewerMode}
            onViewModeChange={setViewerMode}
            defaultViewMode={compareVersion ? 'overlay' : 'result'}
            isGenerating={false}
            imageScale={zoom}
          />

          <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
            <GenerationProgress status={normalizedResult.status} progress={normalizedResult.progress} label={normalizedResult.progressLabel} errorMessage={normalizedResult.errorMessage} compact />
            <GenerationResultActions result={normalizedResult} featureName={`连续编辑-V${selected.versionNumber}`} compact />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowMaskEditor(value => !value)}
              disabled={edit.isGenerating}
              className={`rounded-lg border px-3 py-2 text-xs font-bold ${
                maskDataUrl
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'bg-white text-slate-700'
              }`}
            >
              {showMaskEditor
                ? '收起局部遮罩'
                : maskDataUrl
                  ? '编辑局部遮罩'
                  : '添加局部遮罩'}
            </button>
            {maskDataUrl ? (
              <span className="text-xs font-bold text-blue-600">
                遮罩将参与本轮后端生成
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => original && edit.chooseVersion(original.id)}
              className="rounded-lg border px-3 py-2 text-xs font-bold"
            >
              查看原图
            </button>
            <button
              type="button"
              disabled={!parent}
              onClick={() => parent && edit.chooseVersion(parent.id)}
              className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-40"
            >
              父版本
            </button>
            <button
              type="button"
              disabled={!next}
              onClick={() => next && edit.chooseVersion(next.id)}
              className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-40"
            >
              后一版本
            </button>
          </div>

          {showMaskEditor ? (
            <div className="mt-3 min-h-[420px]">
              <MaskEditor
                imageDataUrl={resolveAssetUrl(selected.publicUrl)}
                imageName={`V${selected.versionNumber}`}
                maskImageDataUrl={maskDataUrl}
                useFullImage={false}
                allowFullImage={false}
                onMaskChange={nextMask => {
                  setMaskDataUrl(nextMask);
                  setMaskAssetId(undefined);
                }}
              />
            </div>
          ) : null}

          <EditVersionInspector
            session={edit.detail.session}
            versions={edit.detail.versions}
            selected={selected}
            parent={parent}
            children={children}
            compareVersionId={compareVersionId}
            disabled={edit.isGenerating}
            onCompareVersionChange={versionId => {
              setCompareVersionId(versionId);
              setViewerMode(versionId ? 'overlay' : 'result');
            }}
            onMakeCurrent={() => void edit.makeCurrent(selected.id)}
            onSaveMetadata={input => edit.saveVersionMetadata(selected.id, input)}
            onMarkPrimary={() => edit.markPrimary(selected.id)}
            onMarkFinal={() => edit.markFinal(selected.id)}
            onRestore={handleRestore}
            onExport={handleExport}
            onSendToPolish={onSendVersionToPolish
              ? () => onSendVersionToPolish(selected)
              : undefined}
          />

          <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
            下一条指令将基于 V{selected.versionNumber}。切换查看、对比或重命名版本都不会触发生成。
          </p>
          {workspaceError ? (
            <p role="alert" className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
              {workspaceError}
            </p>
          ) : null}
        </main>

        <EditSessionChatPanel
          messages={messages}
          versions={edit.detail.versions}
          selectedVersionNumber={selected.versionNumber}
          jobState={edit.jobState}
          instruction={instruction}
          constraints={constraints}
          retryInput={retryInput}
          isGenerating={edit.isGenerating}
          finalSize={finalSize}
          previewCreditCost={previewCreditCost}
          finalCreditCost={finalCreditCost}
          onInstructionChange={setInstruction}
          onConstraintsChange={setConstraints}
          onPrepareRetry={input => {
            setInstruction(input.instruction);
            setRetryInput(input);
          }}
          onSend={handleSend}
          onRetry={() => retryInput && void submit(retryInput)}
          onFinalSizeChange={setFinalSize}
          onFinalize={handleFinalize}
        />
      </div>

      <VersionTree
        versions={edit.detail.versions}
        selectedVersionId={selected.id}
        currentVersionId={edit.detail.session.currentVersionId}
        primaryVersionId={edit.detail.session.primaryVersionId}
        finalVersionId={edit.detail.session.finalVersionId}
        onSelect={edit.chooseVersion}
      />
    </div>
  );
}

function readVersionNumber(
  versions: EditSessionDetail['versions'],
  versionId: string | null | undefined,
) {
  return versions.find(version => version.id === versionId)?.versionNumber ?? 0;
}

function readVersionLabel(
  versions: EditSessionDetail['versions'],
  versionId: string | null | undefined,
) {
  if (!versionId) return '未设置';
  const version = versions.find(item => item.id === versionId);
  return version ? `V${version.versionNumber}` : '未设置';
}

function readViewerAspectRatio(value: string | null) {
  return value === '1:1' || value === '2:1' ? value : '16:9';
}
