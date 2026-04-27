import React, { useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage, PerspectiveCamera, Backdrop, Float, MeshDistortMaterial, RoundedBox } from '@react-three/drei';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Box, 
  Search, 
  Filter, 
  Download, 
  ExternalLink, 
  Clock, 
  HardDrive, 
  Torus,
  ChevronRight,
  Maximize2,
  Trash2,
  Plus,
  Upload,
  Palette,
  Layers
} from 'lucide-react';
import { AssetModel, MaterialAsset } from '../types';

const MOCK_ASSETS: AssetModel[] = [
  { id: '1', name: '现代主义住宅 一号', thumbnail: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=200', type: '三维模型 2024', vertices: '120万', size: '45 兆字节', date: '2024-04-20', tags: ['现代', '住宅'] },
  { id: '2', name: '极简办公空间 四号', thumbnail: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=200', type: '三维模型 2023', vertices: '85万', size: '22 兆字节', date: '2024-04-18', tags: ['极简', '办公'] },
  { id: '3', name: '商业综合体 十二号', thumbnail: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=200', type: '通用交换 4.0', vertices: '450万', size: '120 兆字节', date: '2024-04-15', tags: ['商业', '综合体'] },
  { id: '4', name: '工业风改造项目', thumbnail: 'https://images.unsplash.com/photo-1503387762-5929c3674681?auto=format&fit=crop&q=80&w=200', type: '模型 / 动画', vertices: '210万', size: '68 兆字节', date: '2024-04-12', tags: ['工业', '改造'] },
];

function Scene() {
  return (
    <>
      <PerspectiveCamera makeDefault position={[5, 5, 5]} fov={50} />
      <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 1.75} />
      <Stage intensity={0.5} environment="city" shadows={{ type: 'contact', opacity: 0.2 }} adjustCamera={false}>
        <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
          <RoundedBox args={[2, 3, 2]} radius={0.05} smoothness={4}>
            <MeshDistortMaterial color="#2563eb" speed={2} distort={0.2} radius={1} />
          </RoundedBox>
        </Float>
      </Stage>
      <Backdrop receiveShadow floor={20} segments={20} scale={[50, 30, 10]} position={[0, -2, -10]}>
        <meshStandardMaterial color="#f8fafc" />
      </Backdrop>
      <ambientLight intensity={0.5} />
      <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} castShadow />
    </>
  );
}

export function AssetBank() {
  const [models, setModels] = useState<AssetModel[]>(MOCK_ASSETS);
  const [selectedAsset, setSelectedAsset] = useState<AssetModel | null>(MOCK_ASSETS[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'type' | 'date' | 'size'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [tagInput, setTagInput] = useState('');

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim() && selectedAsset) {
      const newTag = tagInput.trim();
      const updatedAsset = { 
        ...selectedAsset, 
        tags: [...(selectedAsset.tags || []), newTag] 
      };
      setModels(prev => prev.map(m => m.id === selectedAsset.id ? updatedAsset : m));
      setSelectedAsset(updatedAsset);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    if (selectedAsset) {
      const updatedAsset = { 
        ...selectedAsset, 
        tags: (selectedAsset.tags || []).filter(t => t !== tagToRemove) 
      };
      setModels(prev => prev.map(m => m.id === selectedAsset.id ? updatedAsset : m));
      setSelectedAsset(updatedAsset);
    }
  };

  const handleFileUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        const newModel: AssetModel = {
          id: Date.now().toString(),
          name: file.name.split('.')[0],
          thumbnail: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&q=80&w=200',
          type: file.name.split('.').pop()?.toUpperCase() || '未知',
          vertices: '待处理',
          size: `${(file.size / (1024 * 1024)).toFixed(1)} 兆字节`,
          date: new Date().toISOString().split('T')[0],
          tags: []
        };
        setModels(prev => [newModel, ...prev]);
        setSelectedAsset(newModel);
      }
    };
    input.click();
  };

  const handleSort = (field: 'name' | 'type' | 'date' | 'size') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const sortedAndFilteredAssets = React.useMemo(() => {
    const filtered = models.filter(item => {
      const query = searchQuery.toLowerCase();
      const tagsMatch = item.tags?.some(tag => tag.toLowerCase().includes(query)) || false;
      return (
        item.name.toLowerCase().includes(query) ||
        item.type.toLowerCase().includes(query) ||
        item.size.toLowerCase().includes(query) ||
        tagsMatch
      );
    });

    return [...filtered].sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'name': comparison = a.name.localeCompare(b.name); break;
        case 'type': comparison = a.type?.localeCompare(b.type || '') || 0; break;
        case 'date': comparison = a.date.localeCompare(b.date); break;
        case 'size':
          const getVal = (s: string) => parseFloat(s) || 0;
          comparison = getVal(a.size || '0') - getVal(b.size || '0');
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [models, searchQuery, sortBy, sortOrder]);

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-slate-50 animate-in fade-in duration-500">
      {/* 资产列表 */}
      <div className="w-full md:w-96 border-r border-slate-200 flex flex-col bg-white shrink-0">
        <div className="p-5 border-b border-slate-100 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col gap-1">
               <h2 className="text-lg font-bold text-slate-900 tracking-tight">资产管理</h2>
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">模型库</p>
            </div>
            <button 
              onClick={handleFileUpload}
              className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
              title="上传模型"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex bg-slate-100 p-1 rounded-xl">
             <div className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold bg-white shadow-sm text-slate-900 transition-all">
                <Box className="w-3.5 h-3.5" />
                <span>模型库</span>
             </div>
          </div>

          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="搜索模型名称、类型或大小..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-blue-300 outline-none transition-all placeholder:text-slate-400"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              <button 
                onClick={() => handleSort('type')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase border transition-all shrink-0 ${sortBy === 'type' ? 'bg-slate-900 border-slate-900 text-white shadow-md' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
              >
                类型
                {sortBy === 'type' && <span className="ml-0.5 opacity-60 text-[8px]">{sortOrder === 'asc' ? '▲' : '▼'}</span>}
              </button>
              <button 
                onClick={() => handleSort('size')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase border transition-all shrink-0 ${sortBy === 'size' ? 'bg-slate-900 border-slate-900 text-white shadow-md' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
              >
                大小
                {sortBy === 'size' && <span className="ml-0.5 opacity-60 text-[8px]">{sortOrder === 'asc' ? '▲' : '▼'}</span>}
              </button>
              <button 
                onClick={() => handleSort('date')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase border transition-all shrink-0 ${sortBy === 'date' ? 'bg-slate-900 border-slate-900 text-white shadow-md' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
              >
                日期
                {sortBy === 'date' && <span className="ml-0.5 opacity-60 text-[8px]">{sortOrder === 'asc' ? '▲' : '▼'}</span>}
              </button>
              <button 
                onClick={() => handleSort('name')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase border transition-all shrink-0 ${sortBy === 'name' ? 'bg-slate-900 border-slate-900 text-white shadow-md' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
              >
                名称
                {sortBy === 'name' && <span className="ml-0.5 opacity-60 text-[8px]">{sortOrder === 'asc' ? '▲' : '▼'}</span>}
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
          {sortedAndFilteredAssets.length > 0 ? (
            sortedAndFilteredAssets.map((item) => {
              const isSelected = selectedAsset?.id === item.id;
              return (
                <motion.div
                  key={item.id}
                  onClick={() => setSelectedAsset(item)}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    isSelected 
                      ? 'bg-blue-50 border-blue-200 shadow-sm' 
                      : 'bg-white border-slate-100 hover:border-slate-200'
                  }`}
                >
                  <div className="flex gap-4">
                    <div className="w-16 h-16 rounded-lg overflow-hidden border border-slate-100 shrink-0">
                      <img src={item.thumbnail} className="w-full h-full object-cover" alt={item.name} referrerPolicy="no-referrer" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-slate-800 truncate">{item.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-bold uppercase">
                          {item.type}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">{item.size}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3" /> {item.date}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
               <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                 <Search className="w-6 h-6 opacity-20" />
               </div>
               <p className="text-xs font-medium">未找到符合搜索条件的模型</p>
            </div>
          )}
        </div>
      </div>

      {/* 可视化区 */}
      <div className="flex-1 flex flex-col bg-slate-100 relative">
        {selectedAsset ? (
          <>
            <div className="flex-1 relative">
              <div className="absolute inset-0 z-0">
                <Suspense fallback={
                  <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-slate-50">
                    <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin" />
                    <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">正在初始化三维引擎...</span>
                  </div>
                }>
                  <Canvas shadows dpr={[1, 2]}>
                    <Scene />
                  </Canvas>
                </Suspense>
              </div>

              {/* 信息浮层 */}
              <div className="absolute top-6 left-6 z-10 space-y-4">
                 <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={selectedAsset.id}
                  className="bg-white/90 backdrop-blur-md p-6 rounded-2xl border border-slate-200 shadow-xl max-w-sm"
                 >
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xl font-bold text-slate-900 tracking-tight">{selectedAsset.name}</h2>
                      <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                        <Box className="w-4 h-4 text-blue-600" />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-1">
                         <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">顶点数</p>
                         <p className="text-sm font-mono font-bold text-slate-700">{selectedAsset.vertices}</p>
                       </div>
                       <div className="space-y-1">
                         <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">格式</p>
                         <p className="text-sm font-mono font-bold text-slate-700">{selectedAsset.type}</p>
                       </div>
                       <div className="space-y-1">
                         <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">最近更新</p>
                         <p className="text-sm font-mono font-bold text-slate-700">{selectedAsset.date}</p>
                       </div>
                       <div className="space-y-1">
                         <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">文件大小</p>
                         <p className="text-sm font-mono font-bold text-slate-700">{selectedAsset.size}</p>
                       </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">标签</p>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {selectedAsset.tags?.map(tag => (
                          <span key={tag} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] flex items-center gap-1">
                            {tag}
                            <button onClick={() => handleRemoveTag(tag)} className="hover:text-red-500"><Trash2 className="w-2.5 h-2.5" /></button>
                          </span>
                        ))}
                      </div>
                      <input 
                        type="text" 
                        placeholder="输入标签并按回车..." 
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={handleAddTag}
                        className="w-full px-2 py-1.5 bg-slate-50 border border-slate-100 rounded text-[10px] outline-none focus:border-blue-300"
                      />
                    </div>

                    <div className="mt-6 flex gap-3">
                       <button className="flex-1 arch-button-primary py-2.5 flex items-center justify-center gap-2">
                         <Download className="w-4 h-4" />
                         <span>下载模型文件</span>
                       </button>
                       <button className="p-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors">
                         <Maximize2 className="w-5 h-5" />
                       </button>
                    </div>
                 </motion.div>
              </div>

              {/* 控制按钮组 */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-900/90 backdrop-blur text-white px-4 py-2 rounded-full shadow-2xl border border-white/10 z-10">
                 <button className="p-2 hover:bg-white/10 rounded-full transition-colors"><Torus className="w-4 h-4" /></button>
                 <div className="w-px h-4 bg-white/20 mx-1" />
                 <span className="text-[10px] font-mono font-bold px-2">帧率: 60 | 图形处理: 32%</span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
             <Box className="w-16 h-16 mb-4 opacity-20" />
             <p className="text-sm font-medium">请从左侧选择一个资产进行预览</p>
          </div>
        )}
      </div>
    </div>
  );
}
