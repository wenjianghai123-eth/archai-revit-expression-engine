import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from 'react';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { MeshGradient } from '@paper-design/shaders-react';

interface HeroSectionProps {
  title?: string;
  highlightText?: string;
  description?: string;
  buttonText?: string;
  secondaryButtonText?: string;
  onButtonClick?: () => void;
  onSecondaryButtonClick?: () => void;
  colors?: string[];
  distortion?: number;
  swirl?: number;
  speed?: number;
  offsetX?: number;
  className?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  buttonClassName?: string;
  maxWidth?: string;
  veilOpacity?: string;
  fontFamily?: string;
  fontWeight?: number;
}

interface ShaderErrorBoundaryState {
  hasError: boolean;
}

class ShaderErrorBoundary extends Component<{ children: ReactNode }, ShaderErrorBoundaryState> {
  state: ShaderErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ShaderErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.warn('[LandingPage] MeshGradient unavailable, using CSS fallback.', error, errorInfo);
    }
  }

  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

export function HeroSection({
  title = '建筑与室内设计的 AI 表达工作台',
  highlightText = '从图纸到效果图',
  description = '面向建筑与室内设计的智能表达工作台，帮助设计师把图纸、白模和设计意图快速转化为可比较、可修改、可汇报、可交付的设计成果。',
  buttonText = '开始创作',
  secondaryButtonText = '查看核心功能',
  onButtonClick,
  onSecondaryButtonClick,
  colors = ['#72b9bb', '#b5d9d9', '#ffd1bd', '#ffebe0', '#8cc5b8', '#cfd8ee'],
  distortion = 0.8,
  swirl = 0.6,
  speed = 0.42,
  offsetX = 0.08,
  className = '',
  titleClassName = '',
  descriptionClassName = '',
  buttonClassName = '',
  maxWidth = 'max-w-6xl',
  veilOpacity = 'bg-white/25',
  fontFamily = 'Inter, "Microsoft YaHei", "PingFang SC", sans-serif',
  fontWeight = 650,
}: HeroSectionProps) {
  const [dimensions, setDimensions] = useState({ width: 1920, height: 1080 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const update = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <section className={`relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4 py-24 sm:px-6 ${className}`}>
      <div className="pointer-events-none fixed inset-0 z-0 h-screen w-screen overflow-hidden bg-[#dce8e4]" aria-hidden="true">
        <div className="landing-gradient-fallback absolute -inset-[18%]" />
        {mounted ? (
          <ShaderErrorBoundary>
            <MeshGradient
              className="absolute inset-0 h-full w-full"
              width={dimensions.width}
              height={dimensions.height}
              colors={colors}
              distortion={distortion}
              swirl={swirl}
              grainMixer={0}
              grainOverlay={0}
              speed={speed}
              offsetX={offsetX}
            />
          </ShaderErrorBoundary>
        ) : null}
        <div className={`absolute inset-0 ${veilOpacity}`} />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(246,248,247,0.36))]" />
      </div>

      <div className={`relative z-10 mx-auto w-full ${maxWidth}`}>
        <div className="text-center">
          <div className="mx-auto mb-7 flex w-fit items-center gap-2 rounded-full border border-white/55 bg-white/35 px-4 py-2 text-xs font-bold tracking-[0.2em] text-slate-700 shadow-sm backdrop-blur-xl sm:text-sm">
            ARCHITECTURE × INTERIOR × AI
          </div>
          <h1
            className={`text-balance text-4xl leading-[1.12] tracking-[-0.045em] text-slate-950 sm:text-5xl md:text-6xl lg:text-7xl xl:text-[82px] ${titleClassName}`}
            style={{ fontFamily, fontWeight }}
          >
            {title}
            <span className="mt-2 block bg-gradient-to-r from-teal-800 via-slate-800 to-indigo-700 bg-clip-text text-transparent sm:mt-3">
              {highlightText}
            </span>
          </h1>

          <p className={`mx-auto mt-7 max-w-3xl text-pretty px-2 text-base leading-8 text-slate-700 sm:text-lg md:text-xl ${descriptionClassName}`}>
            {description}
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onButtonClick}
              className={`group flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-8 py-4 text-sm font-bold text-white shadow-[0_18px_50px_rgba(15,23,42,0.24)] transition hover:-translate-y-0.5 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70 sm:w-auto sm:text-base ${buttonClassName}`}
            >
              {buttonText}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
            {secondaryButtonText ? (
              <button
                type="button"
                onClick={onSecondaryButtonClick}
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full border border-white/60 bg-white/35 px-8 py-4 text-sm font-bold text-slate-800 shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white/55 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70 sm:w-auto sm:text-base"
              >
                {secondaryButtonText}
                <ChevronDown className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-3 text-left text-xs font-semibold text-slate-700 sm:grid-cols-3 sm:text-center">
            {['6 个核心设计能力', '三类设计表达工作流', '生成结果持续沉淀复用'].map(item => (
              <div key={item} className="rounded-2xl border border-white/45 bg-white/25 px-4 py-3 backdrop-blur-lg">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
