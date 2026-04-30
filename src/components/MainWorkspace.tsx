import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AlertCircle,
  Upload, 
  ChevronRight, 
  RefreshCw, 
  Settings2, 
  Download,
  FileJson,
  Share2,
  Image as ImageIcon,
  Zap,
  Grid,
  X
} from 'lucide-react';
import { GenerationStep, GenerationConfig, StepState, MaterialAsset, FurnitureStyle, UploadedImage, GenerationProvider } from '../types';
import { MOCK_MATERIALS, MOCK_FURNITURE_STYLES } from '../constants';
import { MaterialLibrary } from './MaterialLibrary';
import { MaskEditor } from './MaskEditor';
import { StyleLibrary } from './StyleLibrary';
import { createUploadedImage, validateImageFile } from '../utils/file';
import { downloadDataUrl, downloadJson } from '../utils/download';

interface WorkspaceProps {
  step: GenerationStep;
  state: StepState;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
  onUpdateInputImage: (image: UploadedImage | null) => void;
  onUpdateMaterialImage: (image: UploadedImage | null) => void;
  onUpdateMaskImage: (maskDataUrl: string | null, useFullImage: boolean) => void;
  onGenerate: () => void;
  onNextStep: () => void;
  onReset: () => void;
  backendProvider: GenerationProvider | null;
}

type UploadTarget = 'input' | 'material';

const acceptedImageTypes = 'image/png,image/jpeg,image/webp';
const styleRenderOptions = ['现代极简', '日式侘寂', '北欧温暖', '意式轻奢', '工业风', '新中式', '参数化未来感', '商业展示风'];

export function MainWorkspace({ step, state, onUpdateConfig, onUpdateInputImage, onUpdateMaterialImage, onUpdateMaskImage, onGenerate, onNextStep, onReset, backendProvider }: WorkspaceProps) {
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialAsset | null>(MOCK_MATERIALS[0]);
  const [selectedFurnitureStyle, setSelectedFurnitureStyle] = useState<FurnitureStyle | null>(MOCK_FURNITURE_STYLES[0]);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isStyleLibraryOpen, setIsStyleLibraryOpen] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<Record<UploadTarget, string | null>>({
    input: null,
    material: null,
  });
  const inputFileRef = useRef<HTMLInputElement>(null);
  const materialFileRef = useRef<HTMLInputElement>(null);
  const hasRequiredMask = step !== GenerationStep.LocalInpainting || Boolean(state.maskImage) || state.useFullImageMask;
  const canGenerate = Boolean(state.inputImage) && hasRequiredMask && !state.isGenerating;
  const providerForStatus = backendProvider || state.generationProvider;
  const modeLabel = providerForStatus === 'grsai-nano-banana'
    ? 'Grsai Nano Banana 生成服务'
    : 'Express 后端生成服务';
  const statusCopy = {
    ready: 'ready / 等待生成指令',
    uploading: 'uploading / 正在上传到后端',
    generating: 'generating / 后端生成中',
    success: 'success / 生成成功',
    error: 'error / 生成失败',
  }[state.generationStatus];

  const handleUploadClick = (target: UploadTarget) => {
    if (target === 'input') {
      inputFileRef.current?.click();
      return;
    }

    materialFileRef.current?.click();
  };

  const handleFileSelected = async (target: UploadTarget, fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;

    const error = validateImageFile(file);
    if (error) {
      setUploadErrors(prev => ({ ...prev, [target]: error }));
      return;
    }

    try {
      const image = await createUploadedImage(file);
      if (target === 'input') {
        onUpdateInputImage(image);
      } else {
        onUpdateMaterialImage(image);
      }
      setUploadErrors(prev => ({ ...prev, [target]: null }));
    } catch (readError) {
      setUploadErrors(prev => ({
        ...prev,
        [target]: readError instanceof Error ? readError.message : '图片读取失败，请重试。',
      }));
    }
  };

  const handleClearUpload = (target: UploadTarget) => {
    if (target === 'input') {
      onUpdateInputImage(null);
      if (inputFileRef.current) inputFileRef.current.value = '';
    } else {
      onUpdateMaterialImage(null);
      if (materialFileRef.current) materialFileRef.current.value = '';
    }
    setUploadErrors(prev => ({ ...prev, [target]: null }));
  };

  const renderUploadError = (target: UploadTarget) => {
    const error = uploadErrors[target];
    if (!error) return null;

    return (
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-red-600">
        <AlertCircle className="h-3.5 w-3.5" />
        {error}
      </p>
    );
  };

  const renderStepSpecificInputs = () => {
    switch (step) {
      case GenerationStep.FloorplanTo3D:
        return (
          <>
            <div className="space-y-4">
              <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">1. 上传平面图</label>
              <div
                onClick={() => handleUploadClick('input')}
                className="aspect-[4/3] bg-slate-50 border border-slate-200 rounded-xl overflow-hidden flex items-center justify-center relative group cursor-pointer shadow-sm hover:shadow-md transition-all"
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') handleUploadClick('input');
                }}
              >
                <div className="absolute inset-0 opacity-10 pointer-events-none">
                  <div className="w-full h-full" style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                </div>
                {state.inputImage ? (
                  <>
                    <img src={state.inputImage.dataUrl} className="w-full h-full object-contain relative z-10" alt={state.inputImage.name} referrerPolicy="no-referrer" />
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        handleClearUpload('input');
                      }}
                      className="absolute right-3 top-3 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow-lg transition-colors hover:text-red-600"
                      title="移除平面图"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <div className="absolute bottom-3 left-3 right-3 z-20 rounded bg-white/90 px-3 py-2 text-[10px] font-bold text-slate-600 shadow-sm">
                      {state.inputImage.name}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 relative z-10">
                    <Upload className="w-8 h-8 text-slate-300 group-hover:text-blue-500 transition-colors" />
                    <span className="text-xs text-slate-400 font-mono">点击上传 PNG / JPG / WEBP</span>
                  </div>
                )}
              </div>
              {renderUploadError('input')}
            </div>

            <div className="space-y-4">
              <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">2. 上传参考材质（可选）</label>
              <div
                onClick={() => handleUploadClick('material')}
                className="aspect-[16/6] bg-slate-50 border border-slate-200 border-dashed rounded-xl overflow-hidden flex items-center justify-center relative group cursor-pointer hover:bg-slate-100 transition-all"
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') handleUploadClick('material');
                }}
              >
                {state.materialImage ? (
                  <>
                    <img src={state.materialImage.dataUrl} className="w-full h-full object-cover" alt={state.materialImage.name} referrerPolicy="no-referrer" />
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        handleClearUpload('material');
                      }}
                      className="absolute right-3 top-3 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow-lg transition-colors hover:text-red-600"
                      title="移除参考材质"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <div className="absolute bottom-3 left-3 right-3 z-20 rounded bg-white/90 px-3 py-2 text-[10px] font-bold text-slate-600 shadow-sm">
                      {state.materialImage.name}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-3 text-slate-400">
                    <ImageIcon className="w-5 h-5" />
                    <span className="text-[10px] font-bold uppercase tracking-tight">上传材质库 / 情绪板</span>
                  </div>
                )}
              </div>
              {renderUploadError('material')}
            </div>
          </>
        );
      case GenerationStep.StyleRender:
        return (
          <>
            <div className="space-y-4">
              <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">1. 上传参考图</label>
              <div
                onClick={() => handleUploadClick('input')}
                className="aspect-[4/3] bg-slate-50 border border-slate-200 rounded-xl overflow-hidden flex items-center justify-center relative group cursor-pointer shadow-sm hover:shadow-md transition-all"
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') handleUploadClick('input');
                }}
              >
                {state.inputImage ? (
                  <>
                    <img src={state.inputImage.dataUrl} className="w-full h-full object-contain relative z-10" alt={state.inputImage.name} referrerPolicy="no-referrer" />
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        handleClearUpload('input');
                      }}
                      className="absolute right-3 top-3 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow-lg transition-colors hover:text-red-600"
                      title="移除参考图"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <div className="absolute bottom-3 left-3 right-3 z-20 rounded bg-white/90 px-3 py-2 text-[10px] font-bold text-slate-600 shadow-sm">
                      {state.inputImage.name}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 relative z-10">
                    <Upload className="w-8 h-8 text-slate-300 group-hover:text-blue-500 transition-colors" />
                    <span className="text-xs text-slate-400 font-mono">支持 PNG / JPG / WEBP</span>
                  </div>
                )}
              </div>
              {renderUploadError('input')}
            </div>

            <div className="space-y-4">
              <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">2. 选择渲染风格</label>
              <div className="grid grid-cols-2 gap-2">
                {styleRenderOptions.map(styleName => (
                  <button
                    key={styleName}
                    onClick={() => onUpdateConfig({ style: styleName })}
                    className={`px-3 py-2 text-[10px] font-bold rounded-lg border-2 transition-all ${state.config.style === styleName ? 'bg-blue-50 border-blue-600 text-blue-700' : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200'}`}
                  >
                    {styleName}
                  </button>
                ))}
              </div>
            </div>
          </>
        );
      case GenerationStep.LocalInpainting:
        return (
          <>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">1. 选择参考材质</label>
                <button 
                  onClick={() => setIsLibraryOpen(true)}
                  className="flex items-center gap-1.5 text-[9px] font-bold text-blue-600 uppercase hover:text-blue-700 transition-colors"
                >
                  <Grid className="w-3 h-3" />
                  <span>打开材质库</span>
                </button>
              </div>
              
              <div className="grid grid-cols-4 gap-2">
                {MOCK_MATERIALS.slice(0, 4).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setSelectedMaterial(m);
                      onUpdateConfig({ prompt: `使用材质 "${m.name}" (${m.category}) 替换图中指定区域，确保纹理真实且与周围环境无缝融合。` });
                    }}
                    className={`aspect-square rounded-lg overflow-hidden border-2 transition-all ${selectedMaterial?.id === m.id ? 'border-blue-500 scale-95 shadow-md' : 'border-transparent opacity-60 hover:opacity-100'}`}
                  >
                    <img src={m.thumbnail} className="w-full h-full object-cover" alt={m.name} title={m.name} referrerPolicy="no-referrer" />
                  </button>
                ))}
              </div>
              {selectedMaterial && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center gap-3 animate-in slide-in-from-top-2 duration-300">
                  <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-white shadow-sm cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all" onClick={() => setIsLibraryOpen(true)}>
                    <img src={selectedMaterial.thumbnail} className="w-full h-full object-cover" alt="已选材质" referrerPolicy="no-referrer" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-slate-900 truncate">{selectedMaterial.name}</p>
                    <p className="text-[9px] text-slate-400 font-medium uppercase tracking-tighter">{selectedMaterial.category}</p>
                  </div>
                  <div className="flex gap-1">
                    {selectedMaterial.tags?.slice(0, 1).map(tag => (
                      <span key={tag} className="px-1.5 py-0.5 border border-slate-200 text-[8px] text-slate-400 font-bold uppercase rounded">#{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">2. 局部家具替换 (家具风格库)</label>
                <button 
                  onClick={() => setIsStyleLibraryOpen(true)}
                  className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-600 uppercase hover:text-emerald-700 transition-colors"
                >
                  <Grid className="w-3 h-3" />
                  <span>打开风格库</span>
                </button>
              </div>
              
              <div className="grid grid-cols-4 gap-2">
                {MOCK_FURNITURE_STYLES.slice(0, 4).map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      setSelectedFurnitureStyle(f);
                      onUpdateConfig({ prompt: `将图中指定家具替换为 "${f.name}"，保持其 "${f.style}" 的艺术风格，材质与图中光影系统完美谐调。` });
                    }}
                    className={`aspect-square rounded-lg overflow-hidden border-2 transition-all ${selectedFurnitureStyle?.id === f.id ? 'border-emerald-500 scale-95 shadow-md' : 'border-transparent opacity-60 hover:opacity-100'}`}
                  >
                    <img src={f.thumbnail} className="w-full h-full object-cover" alt={f.name} title={f.name} referrerPolicy="no-referrer" />
                  </button>
                ))}
              </div>
              {selectedFurnitureStyle && (
                <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100 flex items-center gap-3 animate-in slide-in-from-top-2 duration-300">
                  <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-white shadow-sm cursor-pointer hover:ring-2 hover:ring-emerald-400 transition-all" onClick={() => setIsStyleLibraryOpen(true)}>
                    <img src={selectedFurnitureStyle.thumbnail} className="w-full h-full object-cover" alt="已选风格" referrerPolicy="no-referrer" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-emerald-900 truncate">{selectedFurnitureStyle.name}</p>
                    <p className="text-[9px] text-emerald-600 font-medium uppercase tracking-tighter">{selectedFurnitureStyle.style}</p>
                  </div>
                  <div className="flex gap-1">
                    <span className="px-1.5 py-0.5 border border-emerald-200 text-[8px] text-emerald-600 font-bold uppercase rounded">{selectedFurnitureStyle.category}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">3. 上传需修饰图片</label>
              <div
                onClick={() => handleUploadClick('input')}
                className="aspect-[16/9] bg-slate-50 border border-slate-200 rounded-xl overflow-hidden flex items-center justify-center relative group cursor-pointer shadow-sm hover:shadow-md transition-all"
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') handleUploadClick('input');
                }}
              >
                {state.inputImage ? (
                  <>
                    <img src={state.inputImage.dataUrl} className="w-full h-full object-contain relative z-10" alt={state.inputImage.name} referrerPolicy="no-referrer" />
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        handleClearUpload('input');
                      }}
                      className="absolute right-3 top-3 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow-lg transition-colors hover:text-red-600"
                      title="移除底图"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <div className="absolute bottom-3 left-3 right-3 z-20 rounded bg-white/90 px-3 py-2 text-[10px] font-bold text-slate-600 shadow-sm">
                      {state.inputImage.name}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 relative z-10">
                    <Upload className="w-6 h-6 text-slate-300 group-hover:text-blue-500 transition-colors" />
                    <span className="text-[10px] text-slate-400 font-mono">点击上传修饰底图</span>
                  </div>
                )}
              </div>
              {renderUploadError('input')}
            </div>

            {state.inputImage && (
              <MaskEditor
                imageDataUrl={state.inputImage.dataUrl}
                imageName={state.inputImage.name}
                maskImageDataUrl={state.maskImage?.dataUrl || null}
                useFullImage={state.useFullImageMask}
                onMaskChange={onUpdateMaskImage}
              />
            )}
          </>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-slate-50">
      <input
        ref={inputFileRef}
        type="file"
        accept={acceptedImageTypes}
        className="hidden"
        onChange={(event) => {
          void handleFileSelected('input', event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />
      <input
        ref={materialFileRef}
        type="file"
        accept={acceptedImageTypes}
        className="hidden"
        onChange={(event) => {
          void handleFileSelected('material', event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />
      {/* Input Panel */}
      <div className="w-full md:w-80 border-r border-slate-200 flex flex-col custom-scrollbar overflow-y-auto bg-white">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">输入配置</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-bold">MVP 0.1</span>
          </div>
        </div>
        
        <div className="p-5 space-y-6">
          {renderStepSpecificInputs()}

          <div className="space-y-3">
            <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
              {step === GenerationStep.FloorplanTo3D && '4. 附加要求（可选）'}
              {step === GenerationStep.StyleRender && '3. 渲染提示词'}
              {step === GenerationStep.LocalInpainting && '4. 配置生成提示词'}
            </label>
            {step === GenerationStep.FloorplanTo3D && (
              <p className="text-[11px] leading-5 text-slate-500">
                系统会自动注入建筑彩平生成提示词，这里只需要填写额外补充要求。
              </p>
            )}
            {step === GenerationStep.StyleRender && (
              <p className="text-[11px] leading-5 text-slate-500">
                系统会结合上传参考图、所选风格和你的提示词生成渲染效果。
              </p>
            )}
            <textarea 
              value={state.config.prompt}
              onChange={(e) => onUpdateConfig({ prompt: e.target.value })}
              className="w-full p-4 bg-blue-50/50 border border-blue-100 rounded-xl text-xs leading-relaxed text-blue-900 italic font-medium shadow-inner outline-none focus:border-blue-200 transition-all resize-none h-24"
              placeholder={getPromptPlaceholder(step)}
            />
          </div>

          <div className="space-y-2">
             <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 mb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(37,99,235,0.5)]" />
                <span>当前模式: {modeLabel}</span>
             </div>
             <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
               {step === GenerationStep.FloorplanTo3D && "将黑白平面图转换为彩色三维效果平面预览。"}
               {step === GenerationStep.StyleRender && "基于参考图生成指定风格的建筑或室内渲染效果。"}
               {step === GenerationStep.LocalInpainting && "对现有图像进行局部材质与细节优化。"}
             </p>
          </div>
        </div>
      </div>

      {/* Preview Canvas */}
      <div className="flex-1 flex flex-col bg-slate-100 relative overflow-hidden">
        <div className="h-12 border-b border-slate-200 px-4 flex items-center justify-between bg-white/50 backdrop-blur-sm">
          <div className="flex bg-slate-200 p-0.5 rounded-lg overflow-hidden">
            <button className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${state.viewMode === 'after' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>预览图</button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">缩放: 100%</span>
            <div className="w-px h-4 bg-slate-300 mx-1"></div>
            <div className="flex gap-1.5">
               <div className="w-2.5 h-2.5 rounded-full bg-slate-300"></div>
               <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(37,99,235,0.4)]"></div>
               <div className="w-2.5 h-2.5 rounded-full bg-slate-300"></div>
            </div>
          </div>
        </div>

        <div className="flex-1 p-8 flex items-center justify-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.05] pointer-events-none" 
               style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
          
          <div className="w-full h-full max-w-4xl bg-white shadow-2xl rounded-sm overflow-hidden border border-slate-200 relative group transition-all duration-500">
             <AnimatePresence mode="wait">
              {!state.outputImage && !state.isGenerating ? (
                <motion.div 
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex flex-col items-center justify-center text-center p-12 bg-slate-50"
                >
                  <div className="w-20 h-20 border-2 border-dashed border-slate-200 rounded-full flex items-center justify-center mb-6">
                     <ImageIcon className="w-8 h-8 text-slate-200" />
                  </div>
                  <h3 className="text-lg font-bold tracking-tight text-slate-900 mb-2">暂无生成结果</h3>
                  <p className="text-sm text-slate-400 max-w-[320px]">调整左侧提示词或从模板库应用配置，然后点击“生成预览”。</p>
                </motion.div>
              ) : state.isGenerating ? (
                <motion.div 
                  key="generating"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-md z-40"
                >
                  <div className="w-64 h-1.5 bg-slate-100 rounded-full overflow-hidden mb-6 shadow-inner">
                    <motion.div 
                      initial={{ left: '-100%' }}
                      animate={{ left: '100%' }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                      className="absolute inset-0 bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.6)] w-1/3"
                    />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-mono uppercase tracking-[0.3em] font-bold text-blue-600">正在生成预览...</span>
                    <span className="text-xs text-slate-500">后端生成中，请稍候</span>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  key="result"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="w-full h-full relative"
                >
                  <img src={state.outputImage!} className="w-full h-full object-cover" alt="生成结果" referrerPolicy="no-referrer" />
                </motion.div>
              )}
            </AnimatePresence>

            {state.outputImage && !state.isGenerating && (
              <div className="absolute top-6 right-6 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-4 group-hover:translate-x-0">
                <button
                  onClick={() => downloadDataUrl(state.outputImage!, `archai-result-${Date.now()}.${getDataUrlExtension(state.outputImage!)}`)}
                  className="w-10 h-10 bg-white shadow-lg rounded-full flex items-center justify-center text-slate-600 hover:text-blue-600 border border-slate-100"
                  title="下载结果图"
                >
                  <Download className="w-5 h-5" />
                </button>
                <button
                  onClick={() => downloadJson({
                    exportedAt: new Date().toISOString(),
                    step,
                    provider: state.generationProvider,
                    prompt: state.config.prompt,
                    config: state.config,
                    inputImages: {
                      base: state.inputImage?.name || null,
                      material: state.materialImage?.name || null,
                      mask: state.maskImage?.name || null,
                      useFullImageMask: state.useFullImageMask,
                    },
                    result: {
                      id: state.generationResultId,
                      createdAt: state.generationCreatedAt,
                      hasImageDataUrl: Boolean(state.outputImage),
                      imageDataUrl: state.outputImage,
                      warnings: state.generationWarnings,
                    },
                  }, `archai-project-${Date.now()}.json`)}
                  className="w-10 h-10 bg-white shadow-lg rounded-full flex items-center justify-center text-slate-600 hover:text-blue-600 border border-slate-100"
                  title="导出项目包"
                >
                  <FileJson className="w-5 h-5" />
                </button>
                <button
                  onClick={() => window.alert('MVP 暂未支持分享')}
                  className="w-10 h-10 bg-white shadow-lg rounded-full flex items-center justify-center text-slate-600 hover:text-blue-600 border border-slate-100"
                  title="分享"
                >
                  <Share2 className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="w-full md:w-80 border-l border-slate-200 flex flex-col custom-scrollbar overflow-y-auto bg-white shadow-[-4px_0_20px_rgba(0,0,0,0.02)]">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">控制面板</span>
          <Settings2 className="w-4 h-4 text-slate-300" />
        </div>

        <div className="p-6 flex-1 space-y-8">
          <div className="space-y-6">
            <div className="space-y-4">
              <label className="text-[11px] font-bold text-slate-800 flex justify-between uppercase tracking-tight">
                <span>{step === GenerationStep.StyleRender ? '渲染风格' : '建筑风格'}</span>
                <span className="text-blue-600 font-bold">{state.config.style}</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(step === GenerationStep.StyleRender ? styleRenderOptions : ['现代主义', '粗犷主义', '北欧风格', '极简风格']).map(s => (
                  <button 
                    key={s}
                    onClick={() => onUpdateConfig({ style: s })}
                    className={`px-3 py-2 text-[10px] font-bold rounded-lg border-2 transition-all uppercase tracking-wide ${state.config.style === s ? 'bg-blue-50 border-blue-600 text-blue-700' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[11px] font-bold text-slate-800 flex justify-between uppercase tracking-tight">
                <span>材质忠实度</span>
                <span className="text-slate-400 font-medium font-mono">{Math.round(state.config.materialStrength * 100)}%</span>
              </label>
              <input 
                type="range" 
                min="0" max="1" step="0.1" 
                value={state.config.materialStrength}
                onChange={(e) => onUpdateConfig({ materialStrength: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer accent-blue-600" 
              />
            </div>

            <div className="space-y-4">
               <label className="text-[11px] font-bold text-slate-800 uppercase tracking-tight">光照环境</label>
               <select
                value={state.config.lighting}
                onChange={(e) => onUpdateConfig({ lighting: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-700 font-bold appearance-none"
               >
                  <option>黄金时刻 (室外)</option>
                  <option>中午晴空</option>
                  <option>阴天氛围</option>
                  <option>夜间照明</option>
               </select>
            </div>

            <div className="pt-6 border-t border-slate-100">
               <button 
                onClick={onGenerate}
                disabled={!canGenerate}
                className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-black transition-all shadow-lg shadow-black/10 disabled:opacity-50"
              >
                {state.isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><Zap className="w-4 h-4 fill-current text-blue-400" />生成预览</>}
              </button>
              {!state.inputImage && (
                <p className="mt-2 text-center text-[11px] font-medium text-slate-400">
                  请先上传图片后再生成预览。
                </p>
              )}
              {state.inputImage && step === GenerationStep.LocalInpainting && !hasRequiredMask && (
                <p className="mt-2 text-center text-[11px] font-medium text-slate-400">
                  请先绘制局部 mask，或选择整图。
                </p>
              )}
              {state.generationError && (
                <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[11px] font-medium leading-5 text-red-700">
                  {state.generationError}
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 bg-slate-50 p-5 rounded-2xl border border-dashed border-slate-200">
             <p className="text-[10px] text-slate-400 font-bold font-mono mb-3 uppercase tracking-widest">系统输出日志</p>
             <div className="h-28 overflow-hidden text-[10px] font-mono text-slate-500 space-y-1.5 custom-scrollbar overflow-y-auto">
               <div className="flex gap-2"><span className="text-emerald-500">ready:</span><span>前端配置已加载。</span></div>
               <div className="flex gap-2"><span className={state.generationStatus === 'error' ? 'text-red-500' : 'text-blue-500'}>status:</span><span>{statusCopy}</span></div>
               {state.generationStatus === 'uploading' && <div className="flex gap-2 animate-in fade-in"><span className="text-blue-500">uploading:</span><span>图片与提示词发送中。</span></div>}
               {state.generationStatus === 'generating' && <div className="flex gap-2 animate-in fade-in"><span className="text-blue-500">generating:</span><span>等待后端返回生成结果。</span></div>}
               {state.generationStatus === 'success' && <div className="flex gap-2 animate-in fade-in"><span className="text-emerald-500">success:</span><span>生成成功。</span></div>}
               {state.generationStatus === 'error' && <div className="flex gap-2 animate-in fade-in"><span className="text-red-500">error:</span><span>{state.generationError || '生成失败。'}</span></div>}
               {state.generationWarnings.map(warning => (
                 <div key={warning} className="flex gap-2"><span className="text-amber-500">warning:</span><span>{warning}</span></div>
               ))}
             </div>
          </div>
        </div>

        <div className="p-5 bg-white border-t border-slate-200 mt-auto flex items-center justify-between gap-3">
            <button onClick={onReset} disabled={state.isGenerating} className="flex-1 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors disabled:opacity-40">重置</button>
            <button 
              onClick={onNextStep}
              disabled={!state.outputImage || state.isGenerating}
              className="flex-[2] py-2.5 bg-blue-50 text-blue-700 font-bold rounded-lg text-[10px] uppercase tracking-wide shadow-sm disabled:opacity-40 flex items-center justify-center gap-2"
            >
              完成并导出
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
        </div>
      </div>

      <AnimatePresence>
        {isLibraryOpen && (
          <MaterialLibrary 
            isOpen={isLibraryOpen}
            onClose={() => setIsLibraryOpen(false)}
            selectedId={selectedMaterial?.id}
            onSelect={(m) => {
              setSelectedMaterial(m);
              onUpdateConfig({ prompt: `使用材质 "${m.name}" (${m.category}) 替换图中指定区域，确保纹理真实且与周围环境无缝融合。` });
              setIsLibraryOpen(false);
            }}
          />
        )}
        {isStyleLibraryOpen && (
          <StyleLibrary 
            isOpen={isStyleLibraryOpen}
            onClose={() => setIsStyleLibraryOpen(false)}
            selectedId={selectedFurnitureStyle?.id}
            onSelect={(s) => {
              setSelectedFurnitureStyle(s);
              onUpdateConfig({ prompt: `将图中指定家具替换为 "${s.name}"，保持其 "${s.style}" 的艺术风格，材质与图中光影系统完美谐调。` });
              setIsStyleLibraryOpen(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function getDataUrlExtension(dataUrl: string): string {
  const mimeType = /^data:([^;,]+)/u.exec(dataUrl)?.[1];
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/svg+xml':
      return 'svg';
    default:
      return 'png';
  }
}

function getPromptPlaceholder(step: GenerationStep): string {
  if (step === GenerationStep.FloorplanTo3D) {
    return '例如：整体偏暖木风，客厅更明亮，增加绿植，厨房区域使用浅灰石材。';
  }

  if (step === GenerationStep.StyleRender) {
    return '例如：将这张空间参考图渲染成温暖木质风格，增加柔和自然光、绿植和高级材质细节。';
  }

  return '输入材质替换或修饰提示词...';
}
