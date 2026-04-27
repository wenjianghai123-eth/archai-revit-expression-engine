import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  Maximize2, 
  ChevronRight, 
  RefreshCw, 
  Settings2, 
  Download,
  Share2,
  Image as ImageIcon,
  Zap,
  Grid
} from 'lucide-react';
import { GenerationStep, GenerationConfig, StepState, MaterialAsset, FurnitureStyle } from '../types';
import { MOCK_MATERIALS, MOCK_FURNITURE_STYLES } from '../constants';
import { MaterialLibrary } from './MaterialLibrary';
import { StyleLibrary } from './StyleLibrary';

interface WorkspaceProps {
  step: GenerationStep;
  state: StepState;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
  onGenerate: () => void;
  onNextStep: () => void;
}

export function MainWorkspace({ step, state, onUpdateConfig, onGenerate, onNextStep }: WorkspaceProps) {
  const [materialImage, setMaterialImage] = useState<string | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialAsset | null>(MOCK_MATERIALS[0]);
  const [selectedFurnitureStyle, setSelectedFurnitureStyle] = useState<FurnitureStyle | null>(MOCK_FURNITURE_STYLES[0]);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isStyleLibraryOpen, setIsStyleLibraryOpen] = useState(false);

  const renderStepSpecificInputs = () => {
    switch (step) {
      case GenerationStep.FloorplanTo3D:
        return (
          <>
            <div className="space-y-4">
              <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">1. 上传平面图</label>
              <div className="aspect-[4/3] bg-slate-50 border border-slate-200 rounded-xl overflow-hidden flex items-center justify-center relative group cursor-pointer shadow-sm hover:shadow-md transition-all">
                <div className="absolute inset-0 opacity-10 pointer-events-none">
                  <div className="w-full h-full" style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                </div>
                {state.inputImage ? (
                  <img src={state.inputImage} className="w-full h-full object-contain relative z-10" alt="输入图片" referrerPolicy="no-referrer" />
                ) : (
                  <div className="flex flex-col items-center gap-2 relative z-10">
                    <Upload className="w-8 h-8 text-slate-300 group-hover:text-blue-500 transition-colors" />
                    <span className="text-xs text-slate-400 font-mono">点击上传平面图</span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">2. 上传参考材质（可选）</label>
              <div className="aspect-[16/6] bg-slate-50 border border-slate-200 border-dashed rounded-xl overflow-hidden flex items-center justify-center relative group cursor-pointer hover:bg-slate-100 transition-all">
                {materialImage ? (
                  <img src={materialImage} className="w-full h-full object-cover" alt="材质图片" referrerPolicy="no-referrer" />
                ) : (
                  <div className="flex items-center gap-3 text-slate-400">
                    <ImageIcon className="w-5 h-5" />
                    <span className="text-[10px] font-bold uppercase tracking-tight">上传材质库/情绪板</span>
                  </div>
                )}
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
              <div className="aspect-[16/9] bg-slate-50 border border-slate-200 rounded-xl overflow-hidden flex items-center justify-center relative group cursor-pointer shadow-sm hover:shadow-md transition-all">
                {state.inputImage ? (
                  <img src={state.inputImage} className="w-full h-full object-contain relative z-10" alt="输入图片" referrerPolicy="no-referrer" />
                ) : (
                  <div className="flex flex-col items-center gap-2 relative z-10">
                    <Upload className="w-6 h-6 text-slate-300 group-hover:text-blue-500 transition-colors" />
                    <span className="text-[10px] text-slate-400 font-mono">点击上传修饰底层图</span>
                  </div>
                )}
              </div>
            </div>
          </>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-slate-50">
      {/* Input Panel */}
      <div className="w-full md:w-80 border-r border-slate-200 flex flex-col custom-scrollbar overflow-y-auto bg-white">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">输入配置</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-bold">版本 2.4</span>
          </div>
        </div>
        
        <div className="p-5 space-y-6">
          {renderStepSpecificInputs()}

            <div className="space-y-3">
            <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">4. 配置生成提示词</label>
            <textarea 
              value={state.config.prompt}
              onChange={(e) => onUpdateConfig({ prompt: e.target.value })}
              className="w-full p-4 bg-blue-50/50 border border-blue-100 rounded-xl text-xs leading-relaxed text-blue-900 italic font-medium shadow-inner outline-none focus:border-blue-200 transition-all resize-none h-24"
              placeholder="输入材质替换或修饰提示词..."
            />
          </div>

          <div className="space-y-2">
             <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 mb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(37,99,235,0.5)]" />
                <span>当前引擎: 建筑引擎二代</span>
             </div>
             <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
               {step === GenerationStep.FloorplanTo3D && "正在将矢量边界转化为体量空间几何体。"}
               {step === GenerationStep.LocalInpainting && "准备好进行局部材质合成。"}
             </p>
          </div>
        </div>
      </div>

      {/* Preview Canvas */}
      <div className="flex-1 flex flex-col bg-slate-100 relative overflow-hidden">
        <div className="h-12 border-b border-slate-200 px-4 flex items-center justify-between bg-white/50 backdrop-blur-sm">
          <div className="flex bg-slate-200 p-0.5 rounded-lg overflow-hidden">
            <button className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${state.viewMode === 'after' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>预览图</button>
            <button className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${state.viewMode === 'compare' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>对比模式</button>
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
                  <h3 className="text-lg font-bold tracking-tight text-slate-900 mb-2">工作区等待数据</h3>
                  <p className="text-sm text-slate-400 max-w-[280px]">在左侧上传文件并配置参数，然后点击“生成建筑表达”。</p>
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
                    <span className="text-[10px] font-mono uppercase tracking-[0.3em] font-bold text-blue-600">正在生成...</span>
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
                <button className="w-10 h-10 bg-white shadow-lg rounded-full flex items-center justify-center text-slate-600 hover:text-blue-600 border border-slate-100">
                  <Download className="w-5 h-5" />
                </button>
                <button className="w-10 h-10 bg-white shadow-lg rounded-full flex items-center justify-center text-slate-600 hover:text-blue-600 border border-slate-100">
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
                <span>建筑风格</span>
                <span className="text-blue-600 font-bold">{state.config.style}</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {['现代主义', '粗犷主义', '北欧风格', '极简风格'].map(s => (
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
               <select className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-700 font-bold appearance-none">
                  <option>黄金时刻 (室外)</option>
                  <option>中午晴空</option>
                  <option>阴天氛围</option>
                  <option>夜间照明</option>
               </select>
            </div>

            <div className="pt-6 border-t border-slate-100">
               <button 
                onClick={onGenerate}
                disabled={state.isGenerating}
                className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-black transition-all shadow-lg shadow-black/10 disabled:opacity-50"
              >
                {state.isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><Zap className="w-4 h-4 fill-current text-blue-400" />生成建筑表达</>}
              </button>
            </div>
          </div>

          <div className="mt-8 bg-slate-50 p-5 rounded-2xl border border-dashed border-slate-200">
             <p className="text-[10px] text-slate-400 font-bold font-mono mb-3 uppercase tracking-widest">系统输出日志</p>
             <div className="h-28 overflow-hidden text-[10px] font-mono text-slate-500 space-y-1.5 custom-scrollbar overflow-y-auto">
               <div className="flex gap-2"><span className="text-emerald-500">初始化:</span><span>加载权重...</span></div>
               <div className="flex gap-2"><span className="text-blue-500">同步:</span><span>数据映射完成。</span></div>
               {state.outputImage && <div className="flex gap-2 animate-in fade-in"><span className="text-emerald-500">就绪:</span><span>生成成功。</span></div>}
             </div>
          </div>
        </div>

        <div className="p-5 bg-white border-t border-slate-200 mt-auto flex items-center justify-between gap-3">
            <button className="flex-1 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors">重置</button>
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
