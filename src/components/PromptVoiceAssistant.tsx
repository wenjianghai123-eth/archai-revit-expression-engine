import { useMemo, useRef, useState } from 'react';
import { Check, Mic, RotateCcw, Sparkles, Square, Trash2, X } from 'lucide-react';
import { polishPrompt } from '../lib/api';
import { GenerationStep } from '../types';

interface PromptVoiceAssistantProps {
  generationStep: GenerationStep;
  currentPrompt: string;
  onApplyPrompt: (prompt: string) => void;
  context?: Record<string, unknown>;
}

type VoiceStatus = 'idle' | 'listening' | 'recognizing' | 'polishing' | 'error';
type MicrophonePermissionState = PermissionState | 'unsupported' | 'unknown';

interface SpeechRecognitionAlternativeLike {
  transcript?: string;
}

interface SpeechRecognitionResultLike {
  0?: SpeechRecognitionAlternativeLike;
  isFinal?: boolean;
}

interface SpeechRecognitionEventLike {
  results?: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error?: string;
  message?: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructorLike = new () => SpeechRecognitionLike;
type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructorLike;
  webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
};

const unsupportedMessage = '当前浏览器不支持语音输入，请使用最新版 Chrome。';
const insecureContextMessage = '语音输入需要 HTTPS 或 localhost 环境，请使用 localhost 开发或部署到 HTTPS 域名。';
const deniedMessage = '麦克风权限被拒绝，请在浏览器地址栏的网站设置中允许麦克风权限，然后刷新页面。';
const noMicrophoneMessage = '未检测到麦克风设备，请检查麦克风是否连接。';
const microphoneBusyMessage = '麦克风正被其他应用占用，请关闭占用麦克风的软件后重试。';

export function PromptVoiceAssistant({
  generationStep,
  currentPrompt,
  onApplyPrompt,
  context,
}: PromptVoiceAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [rawText, setRawText] = useState('');
  const [polishedText, setPolishedText] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [microphonePermission, setMicrophonePermission] = useState<MicrophonePermissionState>('unknown');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const SpeechRecognition = useMemo(() => readSpeechRecognitionConstructor(), []);
  const isSupported = Boolean(SpeechRecognition);
  const statusText = status === 'listening'
    ? '正在听...'
    : status === 'recognizing'
      ? '正在识别...'
      : status === 'polishing'
        ? '正在优化提示词...'
        : error || '';

  const handleTogglePanel = () => {
    const nextIsOpen = !isOpen;
    setIsOpen(nextIsOpen);
    if (nextIsOpen) {
      void refreshMicrophonePermission();
    }
  };

  const refreshMicrophonePermission = async () => {
    const permissionState = await queryMicrophonePermission();
    setMicrophonePermission(permissionState);
    logVoiceDebug('permission-query', {
      microphonePermission: permissionState,
      ...readVoiceEnvironment(),
    });
  };

  const handleStart = async (reset = false) => {
    if (status === 'listening') return;
    if (status === 'polishing') return;

    setIsOpen(true);
    setError('');

    const SpeechRecognitionConstructor = SpeechRecognition || readSpeechRecognitionConstructor();
    if (!SpeechRecognitionConstructor) {
      setMicrophonePermission('unsupported');
      showVoiceError(unsupportedMessage);
      logVoiceDebug('unsupported', readVoiceEnvironment());
      return;
    }

    const environment = readVoiceEnvironment();
    logVoiceDebug('preflight', {
      ...environment,
      microphonePermission,
    });

    if (!environment.isSecureContext && !environment.isLocalhost) {
      showVoiceError(insecureContextMessage);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setMicrophonePermission('unsupported');
      showVoiceError(unsupportedMessage);
      return;
    }

    const permissionState = await queryMicrophonePermission();
    setMicrophonePermission(permissionState);
    logVoiceDebug('permission-before-getUserMedia', {
      microphonePermission: permissionState,
      ...environment,
    });

    if (permissionState === 'denied') {
      showVoiceError(deniedMessage);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
    } catch (getUserMediaError) {
      const message = mapMicrophoneAccessError(getUserMediaError);
      logVoiceDebug('getUserMedia-error', {
        name: readErrorName(getUserMediaError),
        message: readErrorMessage(getUserMediaError),
        ...environment,
      });
      showVoiceError(message);
      const nextPermissionState = await queryMicrophonePermission();
      setMicrophonePermission(nextPermissionState);
      return;
    }

    const nextPermissionState = await queryMicrophonePermission();
    setMicrophonePermission(nextPermissionState);

    try {
      recognitionRef.current?.abort();
      const recognition = new SpeechRecognitionConstructor();
      recognition.lang = 'zh-CN';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.onresult = event => {
        const transcript = readTranscript(event);
        if (transcript) setRawText(transcript);
        setStatus('listening');
      };
      recognition.onerror = event => {
        logVoiceDebug('speech-recognition-error', {
          error: event.error,
          message: event.message,
          ...readVoiceEnvironment(),
        });
        setError(mapSpeechRecognitionError(event));
        setStatus('error');
      };
      recognition.onend = () => {
        recognitionRef.current = null;
        setStatus(current => current === 'listening' || current === 'recognizing' ? 'idle' : current);
      };
      recognitionRef.current = recognition;

      if (reset) {
        setRawText('');
        setPolishedText('');
        setNegativePrompt('');
        setNotes([]);
      }

      setStatus('listening');
      recognition.start();
    } catch (startError) {
      logVoiceDebug('speech-recognition-start-error', {
        name: readErrorName(startError),
        message: readErrorMessage(startError),
        ...readVoiceEnvironment(),
      });
      showVoiceError(mapMicrophoneAccessError(startError));
    }
  };

  const handleStop = () => {
    if (!recognitionRef.current) return;
    setStatus('recognizing');
    recognitionRef.current.stop();
  };

  const handlePolish = async () => {
    const text = rawText.trim();
    if (!text) {
      setError('请先录音或输入原始语音文本。');
      setStatus('error');
      return;
    }

    setStatus('polishing');
    setError('');
    setNotes([]);
    try {
      const result = await polishPrompt({
        rawText: text,
        generationStep: serializeGenerationStep(generationStep),
        context: {
          ...(context || {}),
          currentPrompt,
        },
      });
      setPolishedText(result.polishedPrompt);
      setNegativePrompt(result.negativePrompt || '');
      setNotes(result.notes || []);
      setStatus('idle');
    } catch (polishError) {
      setError(polishError instanceof Error ? polishError.message : '提示词润色失败，请稍后重试。');
      setStatus('error');
    }
  };

  const handleApply = () => {
    const text = polishedText.trim();
    if (!text) return;
    onApplyPrompt(text);
    setIsOpen(false);
  };

  const handleClear = () => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setRawText('');
    setPolishedText('');
    setNegativePrompt('');
    setNotes([]);
    setError('');
    setStatus('idle');
  };

  const showVoiceError = (message: string) => {
    setError(message);
    setStatus('error');
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleTogglePanel}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-blue-100 bg-white px-2 py-1 text-[10px] font-bold text-blue-700 hover:border-blue-300 hover:bg-blue-50"
      >
        {isOpen ? <X className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
        AI提示词：语音输入
      </button>

      {isOpen ? (
        <div className="rounded-xl border border-blue-100 bg-white p-3 shadow-sm">
          {!isSupported ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
              {unsupportedMessage}
            </p>
          ) : null}

          <div className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-500">
            麦克风权限：{microphonePermission}
            {microphonePermission === 'denied' ? (
              <span className="mt-1 block text-rose-600">
                请点击浏览器地址栏左侧的网站设置，允许麦克风权限后刷新页面。
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { void handleStart(false); }}
              disabled={!isSupported || microphonePermission === 'denied' || status === 'listening' || status === 'polishing'}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white disabled:bg-slate-300"
            >
              <Mic className="h-3.5 w-3.5" />
              语音输入
            </button>
            <button
              type="button"
              onClick={handleStop}
              disabled={status !== 'listening'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 disabled:text-slate-300"
            >
              <Square className="h-3.5 w-3.5" />
              停止
            </button>
            <button
              type="button"
              onClick={() => { void handleStart(true); }}
              disabled={!isSupported || microphonePermission === 'denied' || status === 'listening' || status === 'polishing'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 disabled:text-slate-300"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              重新录音
            </button>
          </div>

          {statusText ? (
            <p className={`mt-2 text-xs leading-5 ${status === 'error' ? 'text-rose-600' : 'text-blue-600'}`}>
              {statusText}
            </p>
          ) : null}

          <label className="mt-3 block">
            <span className="text-[11px] font-bold text-slate-500">原始语音文本</span>
            <textarea
              value={rawText}
              onChange={event => setRawText(event.currentTarget.value)}
              rows={3}
              placeholder="语音识别结果会先显示在这里，不会自动覆盖提示词。"
              className="mt-1 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-800 outline-none focus:border-blue-300"
            />
          </label>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePolish}
              disabled={!rawText.trim() || status === 'polishing' || status === 'listening'}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white disabled:bg-slate-300"
            >
              <Sparkles className="h-3.5 w-3.5" />
              润色为 AI 提示词
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
              清空
            </button>
          </div>

          <label className="mt-3 block">
            <span className="text-[11px] font-bold text-slate-500">润色后的 AI 提示词</span>
            <textarea
              value={polishedText}
              onChange={event => setPolishedText(event.currentTarget.value)}
              rows={5}
              placeholder="点击“润色为 AI 提示词”后，专业提示词会显示在这里，可手动修改后再应用。"
              className="mt-1 w-full resize-none rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2 text-xs leading-5 text-blue-950 outline-none focus:border-blue-300"
            />
          </label>

          {negativePrompt ? (
            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-500">
              负向约束：{negativePrompt}
            </p>
          ) : null}

          {notes.length > 0 ? (
            <div className="mt-2 space-y-1">
              {notes.map(note => (
                <p key={note} className="text-[11px] leading-5 text-slate-500">{note}</p>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleApply}
            disabled={!polishedText.trim()}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:bg-slate-300"
          >
            <Check className="h-3.5 w-3.5" />
            应用到提示词
          </button>
        </div>
      ) : null}
    </div>
  );
}

function readSpeechRecognitionConstructor(): SpeechRecognitionConstructorLike | undefined {
  if (typeof window === 'undefined') return undefined;
  const speechWindow = window as SpeechWindow;
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
}

async function queryMicrophonePermission(): Promise<MicrophonePermissionState> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unsupported';
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return status.state;
  } catch (error) {
    logVoiceDebug('permission-query-error', {
      name: readErrorName(error),
      message: readErrorMessage(error),
    });
    return 'unknown';
  }
}

function readVoiceEnvironment(): {
  isSecureContext: boolean;
  protocol: string;
  hostname: string;
  isLocalhost: boolean;
} {
  if (typeof window === 'undefined') {
    return { isSecureContext: false, protocol: '', hostname: '', isLocalhost: false };
  }
  const hostname = window.location.hostname;
  return {
    isSecureContext: window.isSecureContext,
    protocol: window.location.protocol,
    hostname,
    isLocalhost: isLocalhostHostname(hostname),
  };
}

function isLocalhostHostname(hostname: string): boolean {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || hostname.endsWith('.localhost');
}

function mapMicrophoneAccessError(error: unknown): string {
  const name = readErrorName(error);
  const message = readErrorMessage(error);
  const combined = `${name} ${message}`.toLowerCase();
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || combined.includes('not-allowed') || combined.includes('permission denied')) {
    return deniedMessage;
  }
  if (name === 'NotFoundError' || combined.includes('notfound')) {
    return noMicrophoneMessage;
  }
  if (name === 'NotReadableError' || combined.includes('notreadable')) {
    return microphoneBusyMessage;
  }
  if (name === 'SecurityError' || combined.includes('insecure') || combined.includes('secure context')) {
    return insecureContextMessage;
  }
  return '语音输入启动失败，请检查麦克风权限和浏览器设置后重试。';
}

function mapSpeechRecognitionError(event: SpeechRecognitionErrorEventLike): string {
  const error = `${event.error || ''} ${event.message || ''}`.toLowerCase();
  if (error.includes('not-allowed') || error.includes('permission') || error.includes('denied')) {
    return deniedMessage;
  }
  if (error.includes('no-speech')) {
    return '没有检测到语音，请靠近麦克风后重新录音。';
  }
  if (error.includes('audio-capture')) {
    return noMicrophoneMessage;
  }
  if (error.includes('network')) {
    return '语音识别服务暂时不可用，请检查网络后重试，或手动输入提示词。';
  }
  if (error.includes('not-supported')) {
    return unsupportedMessage;
  }
  return '语音识别失败，请重新录音或手动输入。';
}

function readTranscript(event: SpeechRecognitionEventLike): string {
  const results = event.results;
  if (!results) return '';
  const pieces: string[] = [];
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const transcript = result?.[0]?.transcript;
    if (transcript) pieces.push(transcript);
  }
  return pieces.join('').trim();
}

function readErrorName(error: unknown): string {
  return error instanceof DOMException || error instanceof Error ? error.name : '';
}

function readErrorMessage(error: unknown): string {
  return error instanceof DOMException || error instanceof Error ? error.message : String(error || '');
}

function logVoiceDebug(label: string, payload: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  console.debug('[PromptVoiceAssistant]', label, payload);
}

function serializeGenerationStep(step: GenerationStep): string {
  switch (step) {
    case GenerationStep.FloorplanTo3D:
      return 'floorplan_to_3d';
    case GenerationStep.StyleRender:
      return 'style_render';
    case GenerationStep.LocalInpainting:
      return 'local_inpainting';
    case GenerationStep.ModelSnapshotRender:
      return 'model_snapshot_render';
    case GenerationStep.DesignVariants:
      return 'design_variants';
    case GenerationStep.MaterialReplace:
      return 'material_replace';
    case GenerationStep.PlanColorize:
      return 'plan_colorize';
    case GenerationStep.PanoramaQuickRender:
      return 'panorama_quick_render';
    case GenerationStep.ObjectInsert:
      return 'object_insert';
    default:
      return 'style_render';
  }
}
