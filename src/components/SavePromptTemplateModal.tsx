import { useMemo, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { createPromptTemplate } from '../lib/api';
import { GenerationResultOption, GenerationStep, StepState } from '../types';
import {
  buildPromptTemplatePayload,
  createDefaultTemplateName,
  stepToFeatureName,
} from '../utils/savedPromptTemplates';
import { getOriginalResultImageUrl } from '../utils/resultImage';

interface SavePromptTemplateModalProps {
  step: GenerationStep;
  state: StepState;
  result: GenerationResultOption;
  previewImage?: string | null;
  onClose: () => void;
  onSaved?: () => void;
}

export function SavePromptTemplateModal({
  step,
  state,
  result,
  previewImage,
  onClose,
  onSaved,
}: SavePromptTemplateModalProps) {
  const [name, setName] = useState(() => createDefaultTemplateName(step));
  const [description, setDescription] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const outputUrl = getOriginalResultImageUrl(result, previewImage) || result.imageUrl;
  const payloadPreview = useMemo(() => buildPromptTemplatePayload({
    name: name || createDefaultTemplateName(step),
    description,
    tags: readTags(tagsText),
    step,
    state,
    result,
    previewImage,
  }), [description, name, previewImage, result, state, step, tagsText]);

  const handleSave = async () => {
    if (!name.trim() || isSaving) return;
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      await createPromptTemplate(payloadPreview);
      setMessage('已保存到提示词模板。');
      window.dispatchEvent(new Event('prompt-templates-updated'));
      onSaved?.();
      window.setTimeout(onClose, 700);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存失败，请稍后重试。');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500">{stepToFeatureName(step)}</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">保存为提示词模板</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-900">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 custom-scrollbar">
          <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              <label className="block">
                <span className="text-xs font-bold text-slate-700">模板名称 *</span>
                <input
                  value={name}
                  onChange={event => setName(event.currentTarget.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300"
                />
              </label>

              <label className="block">
                <span className="text-xs font-bold text-slate-700">模板描述</span>
                <textarea
                  value={description}
                  onChange={event => setDescription(event.currentTarget.value)}
                  className="mt-2 h-20 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-blue-300"
                  placeholder="可补充这个结果适合复用的场景。"
                />
              </label>

              <label className="block">
                <span className="text-xs font-bold text-slate-700">标签</span>
                <input
                  value={tagsText}
                  onChange={event => setTagsText(event.currentTarget.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300"
                  placeholder="用逗号分隔，例如：住宅, 暖色, 方案汇报"
                />
              </label>

              <InfoBlock title="本次使用的提示词">
                <p className="whitespace-pre-wrap text-xs leading-5 text-slate-700">{payloadPreview.prompt || '未记录提示词'}</p>
              </InfoBlock>

              <InfoBlock title="本次使用的参数配置">
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-slate-600 custom-scrollbar">
                  {JSON.stringify(payloadPreview.config, null, 2)}
                </pre>
              </InfoBlock>
            </div>

            <aside className="space-y-4">
              <InfoBlock title="本次生成结果图">
                <img src={outputUrl} alt="生成结果图" className="h-56 w-full rounded-xl object-cover" referrerPolicy="no-referrer" />
                <div className="mt-2 space-y-1 text-[11px] font-semibold text-slate-500">
                  <p>outputAssetId: {payloadPreview.outputAssetId || '未记录'}</p>
                  <p>createdFromJobId: {payloadPreview.createdFromJobId || '未记录'}</p>
                </div>
              </InfoBlock>

              <InfoBlock title="本次输入素材">
                {payloadPreview.inputPreviews.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {payloadPreview.inputPreviews.map((item, index) => (
                      <div key={`${item.assetId || item.url}-${index}`} className="overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                        <img src={item.url} alt={item.label} className="h-20 w-full object-cover" referrerPolicy="no-referrer" />
                        <p className="truncate px-2 py-1 text-[10px] font-bold text-slate-600">{item.label}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">本次生成没有可预览的输入素材。</p>
                )}
              </InfoBlock>

              <InfoBlock title="资产字段">
                <div className="space-y-1 text-[11px] leading-5 text-slate-600">
                  <p>inputAssetIds: {payloadPreview.inputAssetIds.length ? payloadPreview.inputAssetIds.join(', ') : '[]'}</p>
                  <p>referenceAssetIds: {payloadPreview.referenceAssetIds.length ? payloadPreview.referenceAssetIds.join(', ') : '[]'}</p>
                  <p>materialAssetIds: {payloadPreview.materialAssetIds.length ? payloadPreview.materialAssetIds.join(', ') : '[]'}</p>
                  <p>sourceAssetId: {payloadPreview.sourceAssetId || '未记录'}</p>
                  <p>placementPreviewAssetId: {payloadPreview.placementPreviewAssetId || '未记录'}</p>
                </div>
              </InfoBlock>
            </aside>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-slate-100 px-5 py-4">
          <div className="text-xs font-semibold">
            {message ? <span className="text-emerald-700">{message}</span> : null}
            {error ? <span className="text-rose-600">{error}</span> : null}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!name.trim() || isSaving}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              确认保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">{title}</p>
      {children}
    </div>
  );
}

function readTags(value: string): string[] {
  return value
    .split(/[,，]/u)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}
