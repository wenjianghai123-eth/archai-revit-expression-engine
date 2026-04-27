import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Search, 
  Maximize2, 
  Download, 
  Tag, 
  Palette, 
  Clock,
  ArrowRight,
  Armchair,
  Home
} from 'lucide-react';
import { FurnitureStyle } from '../types';
import { MOCK_FURNITURE_STYLES } from '../constants';

interface StyleLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (style: FurnitureStyle) => void;
  selectedId?: string;
}

export function StyleLibrary({ isOpen, onClose, onSelect, selectedId }: StyleLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('全部');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const categories = ['全部', ...Array.from(new Set(MOCK_FURNITURE_STYLES.map(s => s.category)))];

  const filteredStyles = MOCK_FURNITURE_STYLES.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         s.tags?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase())) ||
                         s.style.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === '全部' || s.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const selectedStyle = MOCK_FURNITURE_STYLES.find(s => s.id === (hoveredId || selectedId)) || MOCK_FURNITURE_STYLES[0];

  if (!isOpen) return null;

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
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">家具风格库</h2>
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
                placeholder="搜索家具、风格、标签..."
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
            {filteredStyles.map(s => (
              <motion.div
                key={s.id}
                onMouseEnter={() => setHoveredId(s.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => onSelect(s)}
                className={`group p-3 rounded-2xl border cursor-pointer transition-all flex items-center gap-4 ${s.id === selectedId ? 'bg-white border-blue-200 shadow-lg shadow-blue-500/5' : 'bg-transparent border-transparent hover:bg-white hover:border-slate-200'}`}
              >
                <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-slate-100 shadow-sm transition-transform group-hover:scale-105">
                  <img src={s.thumbnail} className="w-full h-full object-cover" alt={s.name} referrerPolicy="no-referrer" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[8px] font-bold uppercase tracking-widest">{s.style}</span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 truncate">{s.name}</h3>
                  <div className="flex items-center gap-1.5 mt-2">
                    {s.tags?.slice(0, 2).map(tag => (
                      <span key={tag} className="text-[9px] text-slate-400 font-medium">#{tag}</span>
                    ))}
                  </div>
                </div>
                <ArrowRight className={`w-4 h-4 text-blue-500 transition-all ${s.id === selectedId ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0'}`} />
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
                      key={selectedStyle.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="aspect-square bg-slate-50 rounded-3xl overflow-hidden border border-slate-100 shadow-inner group relative"
                    >
                      <img src={selectedStyle.thumbnail} className="w-full h-full object-cover" alt={selectedStyle.name} referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Maximize2 className="w-8 h-8 text-white" />
                      </div>
                    </motion.div>
                  </div>

                  <div className="flex flex-col h-full bg-white relative">
                     <div className="mb-8">
                       <div className="flex items-center gap-3 mb-4">
                          <span className="px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold uppercase tracking-widest">{selectedStyle.style}</span>
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-bold">{selectedStyle.category}</span>
                       </div>
                       <h1 className="text-4xl font-bold text-slate-900 tracking-tight mb-4">{selectedStyle.name}</h1>
                       <p className="text-slate-500 leading-relaxed text-sm">{selectedStyle.description}</p>
                     </div>

                     <div className="space-y-8 flex-1">
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-4">风格属性</p>
                          <div className="grid grid-cols-2 gap-y-6 gap-x-12">
                             <div className="space-y-1">
                                <span className="text-[10px] text-slate-400 flex items-center gap-1.5 uppercase tracking-tighter">
                                   <Home className="w-3 h-3" /> 主体风格
                                </span>
                                <p className="text-sm font-bold text-slate-800 tracking-tight">{selectedStyle.style}</p>
                             </div>
                             <div className="space-y-1">
                                <span className="text-[10px] text-slate-400 flex items-center gap-1.5 uppercase tracking-tighter">
                                   <Palette className="w-3 h-3" /> 家具分类
                                </span>
                                <p className="text-sm font-bold text-slate-800 tracking-tight">{selectedStyle.category}</p>
                             </div>
                          </div>
                        </div>

                        <div>
                           <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-4">搜索标签</p>
                           <div className="flex flex-wrap gap-2">
                             {selectedStyle.tags?.map(tag => (
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
                          onClick={() => onSelect(selectedStyle)}
                          className="flex-1 bg-slate-900 text-white font-bold py-4 rounded-2xl hover:bg-black transition-all flex items-center justify-center gap-3 shadow-xl shadow-slate-200"
                        >
                          <Armchair className="w-5 h-5 fill-current text-blue-400" />
                          <span>应用此风格</span>
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
