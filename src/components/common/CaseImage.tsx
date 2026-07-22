import { useEffect, useMemo, useState } from 'react';

export type CaseImageAssetKind = 'local' | 'previous-ui' | 'fallback' | 'final-fallback' | 'emergency';
export type CaseImageLoadStatus = 'loading' | 'loaded' | 'failed';

export interface CaseImageState {
  status: CaseImageLoadStatus;
  assetKind: CaseImageAssetKind;
}

export interface CaseImageProps {
  src?: string | null;
  previousUiSrc?: string | null;
  fallbackSrc?: string | null;
  finalFallbackSrc?: string | null;
  alt: string;
  className?: string;
  imageClassName?: string;
  objectFit?: 'cover' | 'contain';
  loading?: 'eager' | 'lazy';
  isDemoAsset?: boolean;
  demoLabel?: string;
  onStateChange?: (state: CaseImageState) => void;
}

interface ImageCandidate {
  kind: CaseImageAssetKind;
  src: string;
}

const emergencyFallbackSrc = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0f172a"/><stop offset="1" stop-color="#2563eb"/></linearGradient></defs><rect width="1200" height="800" fill="url(#g)"/><path d="M80 690 340 330l180 210 150-180 450 330M210 650V250h250v400M760 650V170h250v480" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="18"/><path d="M120 650h960" stroke="#fff" stroke-opacity=".7" stroke-width="12"/></svg>',
)}`;

export function CaseImage({
  src,
  previousUiSrc,
  fallbackSrc,
  finalFallbackSrc,
  alt,
  className = '',
  imageClassName = '',
  objectFit = 'cover',
  loading = 'lazy',
  isDemoAsset = false,
  demoLabel = '功能示例',
  onStateChange,
}: CaseImageProps) {
  const candidates = useMemo(
    () => buildCandidates(src, previousUiSrc, fallbackSrc, finalFallbackSrc),
    [fallbackSrc, finalFallbackSrc, previousUiSrc, src],
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setCandidateIndex(0);
    setLoaded(false);
  }, [candidates]);

  const current = candidates[candidateIndex] || candidates[candidates.length - 1];
  const status: CaseImageLoadStatus = loaded ? 'loaded' : 'loading';

  useEffect(() => {
    onStateChange?.({ status, assetKind: current.kind });
  }, [current.kind, onStateChange, status]);

  const handleError = () => {
    setLoaded(false);
    setCandidateIndex(currentIndex => Math.min(currentIndex + 1, candidates.length - 1));
  };

  const showDemoLabel = loaded && current.kind !== 'local' && isDemoAsset;

  return (
    <div className={`relative min-w-0 overflow-hidden bg-slate-100 ${className}`}>
      {!loaded ? (
        <div
          className="absolute inset-0 animate-pulse bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100"
          aria-hidden="true"
        />
      ) : null}
      <img
        key={`${current.kind}:${current.src}`}
        src={current.src}
        alt={alt}
        loading={loading}
        fetchPriority={loading === 'eager' ? 'high' : 'auto'}
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={current.kind === 'emergency' ? undefined : handleError}
        className={`h-full w-full transition-opacity duration-300 ${objectFit === 'contain' ? 'object-contain' : 'object-cover'} ${loaded ? 'opacity-100' : 'opacity-0'} ${imageClassName}`}
      />
      {showDemoLabel ? (
        <span className="pointer-events-none absolute right-2 top-2 rounded-full border border-white/50 bg-slate-950/70 px-2 py-1 text-[10px] font-black text-white shadow-sm backdrop-blur">
          {demoLabel}
        </span>
      ) : null}
    </div>
  );
}

function buildCandidates(
  src?: string | null,
  previousUiSrc?: string | null,
  fallbackSrc?: string | null,
  finalFallbackSrc?: string | null,
): ImageCandidate[] {
  const candidates: ImageCandidate[] = [];
  const seen = new Set<string>();

  const append = (kind: CaseImageAssetKind, value?: string | null) => {
    const normalized = normalizeSrc(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push({ kind, src: normalized });
  };

  append('local', src);
  append('previous-ui', previousUiSrc);
  append('fallback', fallbackSrc);
  append('final-fallback', finalFallbackSrc);
  append('emergency', emergencyFallbackSrc);
  return candidates;
}

function normalizeSrc(value?: string | null): string {
  return typeof value === 'string' ? value.trim() : '';
}
