interface OverlayCompareProps {
  sourceImageUrl: string;
  resultImageUrl: string;
  opacity: number;
}

export function OverlayCompare({ sourceImageUrl, resultImageUrl, opacity }: OverlayCompareProps) {
  return (
    <div className="relative h-full w-full bg-white">
      <img src={sourceImageUrl} alt="原图" draggable={false} className="absolute inset-0 h-full w-full object-contain" />
      <img src={resultImageUrl} alt="结果图" draggable={false} style={{ opacity }} className="absolute inset-0 h-full w-full object-contain" />
      <span className="absolute left-3 top-3 rounded-full bg-slate-950/80 px-2 py-1 text-[10px] font-black text-white">原图基准</span>
      <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2 py-1 text-[10px] font-black text-slate-800 shadow">结果 {Math.round(opacity * 100)}%</span>
    </div>
  );
}
