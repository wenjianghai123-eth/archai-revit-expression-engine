import { Box, Layers3 } from 'lucide-react';
import { useState } from 'react';
import type { AssetModel, PromptTemplate } from '../../types';
import { demoImageFallbacks, getFeatureDemoImage } from '../../constants/demoImageFallbacks';
import { CaseImage } from '../common/CaseImage';

type ResourceTab = 'templates' | 'models';

export function HomeResources({
  templates,
  modelAssets,
  onOpenTemplates,
  onOpenAssets,
}: {
  templates: PromptTemplate[];
  modelAssets: AssetModel[];
  onOpenTemplates: () => void;
  onOpenAssets: () => void;
}) {
  const [activeTab, setActiveTab] = useState<ResourceTab>('templates');
  const activeItems = activeTab === 'templates' ? templates.slice(0, 4) : modelAssets.slice(0, 4);
  const onOpenAll = activeTab === 'templates' ? onOpenTemplates : onOpenAssets;

  return (
    <section aria-labelledby="home-resources-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="home-resources-title" className="text-xl font-semibold text-[#111827]">资源与灵感</h2>
          <p className="mt-1 text-sm text-[#667085]">从已有模板和模型资产快速开始</p>
        </div>
        <button type="button" onClick={onOpenAll} className="min-h-11 w-fit rounded-xl px-3 text-sm font-medium text-blue-600 hover:bg-blue-50">查看全部</button>
      </div>

      <div className="mt-4 rounded-[18px] border border-[#E7EAF0] bg-white p-4 sm:p-5">
        <div className="flex w-fit rounded-xl bg-[#F1F3F6] p-1" role="tablist" aria-label="资源类型">
          <button type="button" role="tab" aria-selected={activeTab === 'templates'} onClick={() => setActiveTab('templates')} className={`min-h-11 rounded-lg px-4 text-sm font-medium transition ${activeTab === 'templates' ? 'bg-white text-[#111827] shadow-sm' : 'text-[#667085] hover:text-[#111827]'}`}>推荐模板</button>
          <button type="button" role="tab" aria-selected={activeTab === 'models'} onClick={() => setActiveTab('models')} className={`min-h-11 rounded-lg px-4 text-sm font-medium transition ${activeTab === 'models' ? 'bg-white text-[#111827] shadow-sm' : 'text-[#667085] hover:text-[#111827]'}`}>模型资产</button>
        </div>

        {activeItems.length ? (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {activeTab === 'templates'
              ? (activeItems as PromptTemplate[]).map(template => {
                  const fallback = getFeatureDemoImage(template.feature) || demoImageFallbacks.template_library;
                  return (
                  <button key={template.id} type="button" onClick={onOpenTemplates} className="min-w-0 overflow-hidden rounded-[15px] border border-[#E7EAF0] bg-white text-left transition hover:border-blue-200 hover:bg-blue-50/20">
                    <CaseImage
                      src={template.previewImage}
                      previousUiSrc={fallback.previousUiSrc}
                      fallbackSrc={fallback.fallbackSrc}
                      finalFallbackSrc={fallback.finalFallbackSrc}
                      alt={`${template.title}模板缩略图`}
                      className="aspect-video w-full"
                      isDemoAsset
                    />
                    <div className="p-3">
                      <p className="truncate text-sm font-medium text-[#111827]">{template.title}</p>
                      <p className="mt-1 truncate text-xs text-[#667085]">{template.category}</p>
                    </div>
                  </button>
                );})
              : (activeItems as AssetModel[]).map(asset => (
                  <button key={asset.id} type="button" onClick={onOpenAssets} className="min-w-0 overflow-hidden rounded-[15px] border border-[#E7EAF0] bg-white text-left transition hover:border-blue-200 hover:bg-blue-50/20">
                    <CaseImage
                      src={asset.thumbnail}
                      previousUiSrc={demoImageFallbacks.model_snapshot_render.previousUiSrc}
                      fallbackSrc={demoImageFallbacks.model_snapshot_render.fallbackSrc}
                      finalFallbackSrc={demoImageFallbacks.model_snapshot_render.finalFallbackSrc}
                      alt={`${asset.name}模型预览图`}
                      className="aspect-video w-full"
                      isDemoAsset
                    />
                    <div className="p-3">
                      <p className="truncate text-sm font-medium text-[#111827]">{asset.name}</p>
                      <p className="mt-1 truncate text-xs text-[#667085]">{asset.fileType.toUpperCase()} · {asset.category || '未分类'}</p>
                    </div>
                  </button>
                ))}
          </div>
        ) : (
          <div className="mt-4 flex min-h-40 flex-col items-center justify-center rounded-[15px] bg-[#F8F9FB] p-6 text-center">
            {activeTab === 'templates' ? <Layers3 className="h-7 w-7 text-slate-300" /> : <Box className="h-7 w-7 text-slate-300" />}
            <p className="mt-3 text-sm font-medium text-[#111827]">{activeTab === 'templates' ? '暂无推荐模板' : '暂无模型资产'}</p>
            <p className="mt-1 text-xs text-[#667085]">{activeTab === 'templates' ? '保存提示词模板后可从这里快速复用。' : '上传模型后可从这里继续使用。'}</p>
          </div>
        )}
      </div>
    </section>
  );
}
