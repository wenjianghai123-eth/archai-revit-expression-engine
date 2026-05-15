import { lazy, type ReactNode } from 'react';
import { Upload } from 'lucide-react';
import { GenerationProvider, UploadedImage } from '../../types';

const MaskEditor = lazy(() => import('../MaskEditor').then(module => ({ default: module.MaskEditor })));

interface InpaintMaskPanelProps {
  inputImage: UploadedImage | null;
  maskImageDataUrl: string | null;
  useFullImageMask: boolean;
  providerForStatus: GenerationProvider | null;
  onUploadInput: () => void;
  onUpdateMaskImage: (maskDataUrl: string | null, useFullImage: boolean, feather?: number) => void;
  materialTexturesPanel: ReactNode;
}

export function InpaintMaskPanel({
  inputImage,
  maskImageDataUrl,
  useFullImageMask,
  providerForStatus,
  onUploadInput,
  onUpdateMaskImage,
  materialTexturesPanel,
}: InpaintMaskPanelProps) {
  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white/70 px-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">局部 mask 编辑</span>
          <p className="text-xs font-medium text-slate-500">不涂抹也可以直接根据提示词进行全局或智能局部修改；涂抹后可更精确地限制修改区域。</p>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{providerForStatus || 'provider 待连接'}</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 custom-scrollbar">
        <div className="flex min-h-[360px] flex-1 lg:min-h-[560px] lg:h-[60vh]">
          {inputImage ? (
            <MaskEditor
              imageDataUrl={inputImage.dataUrl}
              imageName={inputImage.name}
              maskImageDataUrl={maskImageDataUrl}
              useFullImage={useFullImageMask}
              onMaskChange={onUpdateMaskImage}
            />
          ) : (
            <button
              type="button"
              onClick={onUploadInput}
              className="flex min-h-[360px] w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-white text-slate-400 transition hover:border-blue-200 hover:bg-blue-50/40"
            >
              <Upload className="mb-3 h-9 w-9" />
              <span className="text-sm font-bold text-slate-700">上传参考图开始局部修改</span>
              <span className="mt-1 text-xs font-medium">PNG / JPG / WEBP</span>
            </button>
          )}
        </div>

        {materialTexturesPanel}
      </div>
    </main>
  );
}
