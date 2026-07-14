import { AlertCircle, Expand, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { logAssetImageRender, resolveAssetUrl, warnImageLoadFailure } from '../../utils/assetUrl';

type ImageRatio = '16:9' | '4:3' | '1:1' | '2:1';

export interface AspectRatioImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  imageClassName?: string;
  fit?: 'contain' | 'cover';
  ratio?: ImageRatio;
  showPlaceholder?: boolean;
  placeholder?: string;
  loading?: boolean;
  onClick?: () => void;
  enableLightbox?: boolean;
}

const ratioClassNames: Record<ImageRatio, string> = {
  '16:9': 'aspect-video',
  '4:3': 'aspect-[4/3]',
  '1:1': 'aspect-square',
  '2:1': 'aspect-[2/1]',
};

export function AspectRatioImage({
  src,
  alt = '图片预览',
  className = '',
  imageClassName = '',
  fit = 'contain',
  ratio = '16:9',
  showPlaceholder = true,
  placeholder = '暂无图片',
  loading = false,
  onClick,
  enableLightbox = true,
}: AspectRatioImageProps) {
  const [hasError, setHasError] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const resolvedSrc = resolveAssetUrl(src);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  useEffect(() => {
    if (src) logAssetImageRender(src, resolvedSrc);
  }, [resolvedSrc, src]);

  const handleClick = () => {
    onClick?.();
    if (!onClick && enableLightbox && resolvedSrc && !hasError) setIsOpen(true);
  };

  return (
    <>
      <div
        className={`image-frame image-frame-${ratio.replace(':', 'x')} ${ratioClassNames[ratio]} ${className}`}
      >
        {loading ? (
          <div className="image-frame-state">
            <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
            <span>正在加载图片...</span>
          </div>
        ) : resolvedSrc && !hasError ? (
          <div
            role={enableLightbox || onClick ? 'button' : undefined}
            tabIndex={enableLightbox || onClick ? 0 : undefined}
            onClick={enableLightbox || onClick ? handleClick : undefined}
            onKeyDown={event => {
              if ((event.key === 'Enter' || event.key === ' ') && (enableLightbox || onClick)) handleClick();
            }}
            className={`group relative flex h-full w-full items-center justify-center overflow-hidden ${enableLightbox || onClick ? 'cursor-zoom-in' : ''}`}
            aria-label={enableLightbox || onClick ? `查看${alt}` : undefined}
          >
            <img
              src={resolvedSrc}
              loading="lazy"
              alt={alt}
              className={`h-full w-full ${fit === 'cover' ? 'object-cover' : 'object-contain'} ${imageClassName}`}
              referrerPolicy="no-referrer"
              onError={() => {
                warnImageLoadFailure(src, resolvedSrc);
                setHasError(true);
              }}
            />
            {enableLightbox || onClick ? (
              <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950/65 text-white opacity-0 shadow transition group-hover:opacity-100">
                <Expand className="h-4 w-4" />
              </span>
            ) : null}
          </div>
        ) : showPlaceholder ? (
          <div className="image-frame-state">
            {hasError ? <AlertCircle className="h-6 w-6 text-rose-400" /> : <ImageIcon className="h-6 w-6 text-slate-300" />}
            <span>{hasError ? '图片加载失败，请检查文件地址或存储权限' : src ? '图片地址为空' : placeholder}</span>
          </div>
        ) : null}
      </div>

      {isOpen && resolvedSrc ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <button type="button" onClick={() => setIsOpen(false)} className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="关闭大图">
            <X className="h-5 w-5" />
          </button>
          <img src={resolvedSrc} alt={alt} className="max-h-[92vh] max-w-[94vw] object-contain" referrerPolicy="no-referrer" />
        </div>
      ) : null}
    </>
  );
}
