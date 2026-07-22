import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Search, 
  Filter, 
  Maximize2, 
  Download, 
  Tag, 
  Layers, 
  Palette, 
  Clock,
  ArrowRight
} from 'lucide-react';
import { MaterialAsset } from '../types';
import { MOCK_MATERIALS } from '../constants';
import { useEnterpriseAssetPreferences } from '../hooks/useEnterpriseAssetPreferences';

interface MaterialLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (material: MaterialAsset) => void;
  selectedId?: string;
}

type MaterialManifestItem = {
  id: string;
  name: string;
  thumbnail: string;
  category?: string;
  tags?: string[];
  source?: string;
  originalFileName?: string;
  originalPath?: string;
  importedAt?: string;
  hash?: string;
};

const materialImageFallback =
  'data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22400%22 viewBox=%220 0 400 400%22%3E%3Crect width=%22400%22 height=%22400%22 fill=%22%23f1f5f9%22/%3E%3Cpath d=%22M90 255h220v55H90zM112 90h176v138H112z%22 fill=%22%23cbd5e1%22/%3E%3Cpath d=%22M134 116h132v18H134zm0 43h132v18H134zm0 43h84v18h-84z%22 fill=%22%2394a3b8%22/%3E%3Ctext x=%22200%22 y=%22345%22 text-anchor=%22middle%22 font-family=%22Arial,sans-serif%22 font-size=%2220%22 font-weight=%22700%22 fill=%22%2364758b%22%3EMaterial%3C/text%3E%3C/svg%3E';

function handleMaterialImageError(event: React.SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.onerror = null;
  event.currentTarget.src = materialImageFallback;
}

function isMaterialManifestItem(value: unknown): value is MaterialManifestItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && typeof item.name === 'string' && typeof item.thumbnail === 'string';
}

function mapManifestMaterial(item: MaterialManifestItem): MaterialAsset {
  return {
    id: item.id,
    name: item.name,
    thumbnail: item.thumbnail,
    category: item.category || '其他',
    date: item.importedAt ? item.importedAt.slice(0, 10) : '本地导入',
    description: item.originalFileName ? `本地导入材质：${item.originalFileName}` : '本地导入材质贴图。',
    tags: item.tags && item.tags.length > 0 ? item.tags : [item.category || '其他', '本地导入'],
    source: item.source,
    originalFileName: item.originalFileName,
    originalPath: item.originalPath,
    importedAt: item.importedAt,
    hash: item.hash,
  };
}

export function MaterialLibrary({ isOpen, onClose, onSelect, selectedId }: MaterialLibraryProps) {
  const { markUsed } = useEnterpriseAssetPreferences();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('全部');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [manifestMaterials, setManifestMaterials] = useState<MaterialAsset[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    let isCancelled = false;
    fetch('/materials/materials-manifest.json', { cache: 'no-cache' })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then(value => {
        if (isCancelled || !Array.isArray(value)) return;
        setManifestMaterials(value.filter(isMaterialManifestItem).map(mapManifestMaterial));
      })
      .catch(() => {
        if (!isCancelled) setManifestMaterials([]);
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen]);

  const materials = useMemo(() => {
    const seenIds = new Set<string>();
    return [...manifestMaterials, ...MOCK_MATERIALS].filter(material => {
      if (seenIds.has(material.id)) return false;
      seenIds.add(material.id);
      return true;
    });
  }, [manifestMaterials]);

  const categories = ['全部', ...Array.from(new Set(materials.map(m => m.category).filter(Boolean)))];

  const filteredMaterials = materials.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         m.tags?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = activeCategory === '全部' || m.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const selectedMaterial = materials.find(m => m.id === (hoveredId || selectedId)) || filteredMaterials[0] || materials[0];
  const handleSelect = (material: MaterialAsset) => {
    markUsed(`material:${material.id}`);
    onSelect(material);
  };

  if (!isOpen) return null;
  if (!selectedMaterial) return null;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8"
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" 
        onClick={onClose}
      />

      {/* Modal Content */}
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="relative w-full max-w-6xl h-[85vh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row border border-white/20"
      >
        {/* Sidebar / List */}
        <div className="w-full md:w-96 border-r border-slate-100 flex flex-col bg-slate-50/50">
          <div className="p-6 border-b border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">材质库</h2>
              <button 
                onClick={onClose}
                className="p-1.5 hover:bg-slate-200 rounded-full transition-colors md:hidden"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="搜索材质、标签..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:border-blue-300 outline-none transition-all shadow-sm"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all border ${activeCategory === cat ? 'bg-slate-900 border-slate-900 text-white shadow-md' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {filteredMaterials.map(m => (
              <motion.div
                key={m.id}
                onMouseEnter={() => setHoveredId(m.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => handleSelect(m)}
                className={`group p-3 rounded-2xl border cursor-pointer transition-all flex items-center gap-4 ${m.id === selectedId ? 'bg-white border-blue-200 shadow-lg shadow-blue-500/5' : 'bg-transparent border-transparent hover:bg-white hover:border-slate-200'}`}
              >
                <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-slate-100 shadow-sm transition-transform group-hover:scale-105">
                  <img src={m.thumbnail} onError={handleMaterialImageError} className="w-full h-full object-cover" alt={m.name} referrerPolicy="no-referrer" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[8px] font-bold uppercase tracking-widest">{m.category}</span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 truncate">{m.name}</h3>
                  <div className="flex items-center gap-1.5 mt-2">
                    {m.tags?.slice(0, 2).map(tag => (
                      <span key={tag} className="text-[9px] text-slate-400 font-medium">#{tag}</span>
                    ))}
                  </div>
                </div>
                <ArrowRight className={`w-4 h-4 text-blue-500 transition-all ${m.id === selectedId ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0'}`} />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Detailed Preview */}
        <div className="flex-1 bg-white flex flex-col overflow-hidden relative">
           <button 
              onClick={onClose}
              className="absolute top-6 right-6 z-50 p-2 hover:bg-slate-100 rounded-full transition-colors hidden md:block"
            >
              <X className="w-6 h-6 text-slate-400" />
            </button>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="p-8 md:p-12">
                <div className="grid md:grid-cols-2 gap-12">
                  <div className="space-y-6">
                    <motion.div 
                      key={selectedMaterial.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="aspect-square bg-slate-50 rounded-3xl overflow-hidden border border-slate-100 shadow-inner group relative"
                    >
                      <img src={selectedMaterial.thumbnail} onError={handleMaterialImageError} className="w-full h-full object-cover" alt={selectedMaterial.name} referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Maximize2 className="w-8 h-8 text-white" />
                      </div>
                    </motion.div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="aspect-square rounded-xl bg-slate-50 border border-slate-100 overflow-hidden">
                        <img src={selectedMaterial.thumbnail} onError={handleMaterialImageError} className="w-full h-full object-cover opacity-60 grayscale" alt="贴图一" referrerPolicy="no-referrer" />
                        <span className="absolute bottom-1 right-1 text-[8px] font-bold text-slate-400 uppercase">漫反射</span>
                      </div>
                      <div className="aspect-square rounded-xl bg-slate-50 border border-slate-100 overflow-hidden relative">
                         <div className="absolute inset-0 bg-slate-400 mix-blend-multiply opacity-20" />
                         <img src={selectedMaterial.thumbnail} onError={handleMaterialImageError} className="w-full h-full object-cover opacity-60 grayscale brightness-125" alt="贴图二" referrerPolicy="no-referrer" />
                         <span className="absolute bottom-1 right-1 text-[8px] font-bold text-slate-400 uppercase">法线</span>
                      </div>
                      <div className="aspect-square rounded-xl bg-slate-50 border border-slate-100 overflow-hidden relative">
                         <div className="absolute inset-0 bg-blue-400 mix-blend-color opacity-20" />
                         <img src={selectedMaterial.thumbnail} onError={handleMaterialImageError} className="w-full h-full object-cover opacity-40 brightness-50" alt="贴图三" referrerPolicy="no-referrer" />
                         <span className="absolute bottom-1 right-1 text-[8px] font-bold text-slate-400 uppercase">粗糙度</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col h-full bg-white relative">
                     <div className="mb-8">
                       <div className="flex items-center gap-3 mb-4">
                          <span className="px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold uppercase tracking-widest">{selectedMaterial.category}</span>
                          <div className="flex items-center gap-1.5 text-slate-400">
                             <Clock className="w-3.5 h-3.5" />
                             <span className="text-[10px] font-mono">{selectedMaterial.date}</span>
                          </div>
                       </div>
                       <h1 className="text-4xl font-bold text-slate-900 tracking-tight mb-4">{selectedMaterial.name}</h1>
                       <p className="text-slate-500 leading-relaxed text-sm">{selectedMaterial.description}</p>
                     </div>

                     <div className="space-y-8 flex-1">
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-4">技术参数</p>
                          <div className="grid grid-cols-2 gap-y-6 gap-x-12">
                             <div className="space-y-1">
                                <span className="text-[10px] text-slate-400 flex items-center gap-1.5 uppercase tracking-tighter">
                                   <Maximize2 className="w-3 h-3" /> 分辨率
                                </span>
                                <p className="text-sm font-bold text-slate-800 tracking-tight">4096 × 4096（四千级）</p>
                             </div>
                             <div className="space-y-1">
                                <span className="text-[10px] text-slate-400 flex items-center gap-1.5 uppercase tracking-tighter">
                                   <Palette className="w-3 h-3" /> 贴图通道
                                </span>
                                <p className="text-sm font-bold text-slate-800 tracking-tight">物理金属 / 粗糙度</p>
                             </div>
                             <div className="space-y-1">
                                <span className="text-[10px] text-slate-400 flex items-center gap-1.5 uppercase tracking-tighter">
                                   <Layers className="w-3 h-3" /> 源工程
                                </span>
                                <p className="text-sm font-bold text-slate-800 tracking-tight">原生渲染工程</p>
                             </div>
                             <div className="space-y-1">
                                <span className="text-[10px] text-slate-400 flex items-center gap-1.5 uppercase tracking-tighter">
                                   <Download className="w-3 h-3" /> 文件大小
                                </span>
                                <p className="text-sm font-bold text-slate-800 tracking-tight">45.2 兆字节</p>
                             </div>
                          </div>
                        </div>

                        <div>
                           <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-4">材质标签</p>
                           <div className="flex flex-wrap gap-2">
                             {selectedMaterial.tags?.map(tag => (
                               <span key={tag} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-bold text-slate-600">
                                 <Tag className="w-3 h-3 opacity-40" />
                                 {tag}
                               </span>
                             ))}
                           </div>
                        </div>
                     </div>

                     <div className="mt-12 pt-8 border-t border-slate-100 flex items-center gap-4">
                        <button 
                          onClick={() => handleSelect(selectedMaterial)}
                          className="flex-1 bg-slate-900 text-white font-bold py-4 rounded-2xl hover:bg-black transition-all flex items-center justify-center gap-3 shadow-xl shadow-slate-200"
                        >
                          <Palette className="w-5 h-5 fill-current text-blue-400" />
                          <span>应用此材质</span>
                        </button>
                        <button className="p-4 bg-slate-50 text-slate-400 rounded-2xl hover:text-slate-900 transition-all">
                           <Download className="w-5 h-5" />
                        </button>
                     </div>
                  </div>
                </div>
              </div>
            </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
