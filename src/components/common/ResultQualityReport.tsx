import { AlertTriangle, CheckCircle2, RefreshCcw, ShieldCheck, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { updateGenerationResult } from '../../lib/api';
import type {
  GenerationQualityDecision,
  GenerationQualityIssue,
  GenerationQualityReport,
} from '../../types';

interface ResultQualityReportProps {
  resultId: string;
  metadata?: Record<string, unknown>;
  compact?: boolean;
}

export function ResultQualityReport({ resultId, metadata, compact = false }: ResultQualityReportProps) {
  const report = readGenerationQualityReport(metadata?.qualityReport);
  const storedDecision = readQualityDecision(metadata?.qualityDecision);
  const [decision, setDecision] = useState<GenerationQualityDecision | null>(storedDecision);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDecision(storedDecision);
    setError(null);
  }, [resultId, storedDecision]);

  if (!report) return null;

  const style = report.status === 'passed'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : report.status === 'failed'
      ? 'border-rose-200 bg-rose-50 text-rose-900'
      : 'border-amber-200 bg-amber-50 text-amber-900';
  const Icon = report.status === 'passed' ? CheckCircle2 : report.status === 'failed' ? XCircle : AlertTriangle;
  const title = report.status === 'passed' ? '质量检查通过' : report.status === 'failed' ? '质量检查未通过' : '质量检查有警告';

  const saveDecision = async (nextDecision: GenerationQualityDecision) => {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      await updateGenerationResult(resultId, {
        metadata: {
          qualityDecision: nextDecision,
          qualityDecisionAt: new Date().toISOString(),
        },
      });
      setDecision(nextDecision);
    } catch (saveError) {
      console.error('[quality-report] save decision failed', {
        resultId,
        error: saveError instanceof Error ? saveError.message : String(saveError),
      });
      setError('保存质量处理决定失败，请稍后重试。');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className={`rounded-xl border p-3 ${style}`} aria-label="生成质量报告">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-black">{title}</p>
            <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-black">评分 {report.score}</span>
          </div>
          {!compact ? (
            <p className="mt-1 text-[11px] leading-5 opacity-80">
              规则检查画幅、尺寸、结构边缘、整体差异、遮罩外变化、边框拼贴、异常文字以及清晰度和曝光。
            </p>
          ) : null}
        </div>
      </div>

      {report.issues.length > 0 ? (
        <div className="mt-2 space-y-1.5">
          {report.issues.slice(0, compact ? 2 : 6).map(issue => (
            <QualityIssueRow key={issue.code} issue={issue} />
          ))}
          {report.issues.length > (compact ? 2 : 6) ? (
            <p className="text-[10px] font-semibold opacity-75">另有 {report.issues.length - (compact ? 2 : 6)} 项检查提示</p>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-[11px] font-semibold">未发现明显质量异常，仍建议交付前人工复核关键结构。</p>
      )}

      {report.status !== 'passed' ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void saveDecision('keep')}
            disabled={isSaving}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-black disabled:opacity-50 ${decision === 'keep' ? 'border-emerald-500 bg-emerald-600 text-white' : 'border-white/80 bg-white/80 text-emerald-800'}`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            仍然保留
          </button>
          <button
            type="button"
            onClick={() => void saveDecision('retry')}
            disabled={isSaving}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-black disabled:opacity-50 ${decision === 'retry' ? 'border-rose-500 bg-rose-600 text-white' : 'border-white/80 bg-white/80 text-rose-800'}`}
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            标记需重做
          </button>
          <span className="self-center text-[10px] font-semibold opacity-75">结果不会被自动删除</span>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-[11px] font-bold text-rose-700">{error}</p> : null}
    </section>
  );
}

function QualityIssueRow({ issue }: { issue: GenerationQualityIssue }) {
  return (
    <div className="rounded-lg bg-white/60 px-2.5 py-2 text-[11px] leading-4">
      <p className="font-black">{issue.title}</p>
      <p className="mt-0.5 opacity-80">{issue.message}</p>
    </div>
  );
}

export function readGenerationQualityReport(value: unknown): GenerationQualityReport | null {
  if (!isRecord(value) || value.version !== 1) return null;
  if (value.status !== 'passed' && value.status !== 'warning' && value.status !== 'failed') return null;
  if (typeof value.score !== 'number' || !Array.isArray(value.issues) || !isRecord(value.metrics)) return null;
  const issues = value.issues.filter(isQualityIssue);
  return {
    version: 1,
    status: value.status,
    score: Math.max(0, Math.min(100, Math.round(value.score))),
    checkedAt: typeof value.checkedAt === 'string' ? value.checkedAt : '',
    issues,
    warnings: Array.isArray(value.warnings) ? value.warnings.filter((item): item is string => typeof item === 'string') : [],
    metrics: value.metrics as unknown as GenerationQualityReport['metrics'],
  };
}

function readQualityDecision(value: unknown): GenerationQualityDecision | null {
  return value === 'keep' || value === 'retry' ? value : null;
}

function isQualityIssue(value: unknown): value is GenerationQualityIssue {
  if (!isRecord(value)) return false;
  return typeof value.code === 'string'
    && typeof value.title === 'string'
    && typeof value.message === 'string'
    && (value.severity === 'info' || value.severity === 'warning' || value.severity === 'error');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
