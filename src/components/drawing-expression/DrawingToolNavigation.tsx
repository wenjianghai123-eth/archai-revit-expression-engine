import { Boxes, Footprints, Grid2X2, Layers3, ScanLine, SquareDashed } from 'lucide-react';
import type { DrawingTool, DrawingWorkflowStage } from './drawingExpressionState';

interface DrawingToolNavigationProps {
  activeTool: DrawingTool;
  workflowStage: DrawingWorkflowStage;
  onSelectTool: (tool: DrawingTool) => void;
}

export const drawingTools: Array<{
  key: DrawingTool;
  label: string;
  description: string;
  icon: typeof Grid2X2;
}> = [
  { key: 'color-plan-2d', label: '二维彩平', description: '快速彩色平面表达', icon: Grid2X2 },
  { key: 'color-plan-3d', label: '三维彩平', description: '材质与空间层次表达', icon: Boxes },
  { key: 'region-recognition', label: '区域识别', description: '识别并校正封闭区域', icon: ScanLine },
  { key: 'material-mapping', label: '材质配置', description: '按区域映射材质', icon: Layers3 },
  { key: 'functional-zoning', label: '功能分区', description: '生成分区分析表达', icon: SquareDashed },
  { key: 'circulation-analysis', label: '动线分析', description: '生成人流与交通分析', icon: Footprints },
];

const stageLabels: Record<DrawingWorkflowStage, string> = {
  empty: '等待上传',
  uploaded: '图纸已上传',
  configuring: '参数配置中',
  generating: '正在生成',
  completed: '生成完成',
  failed: '生成失败',
};

export function DrawingToolNavigation({ activeTool, workflowStage, onSelectTool }: DrawingToolNavigationProps) {
  return (
    <header className="relative z-20 shrink-0 border-b border-slate-200 bg-white px-3 py-3 sm:px-4" data-testid="drawing-tool-navigation">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-black text-slate-950 sm:text-base">图纸表达中心</h2>
          <p className="hidden text-xs text-slate-500 sm:block">功能工具与看图方式相互独立，切换工具不会丢失原图和已有结果。</p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600">{stageLabels[workflowStage]}</span>
      </div>
      <div className="drawing-tool-navigation-scroll w-full min-w-0 overflow-x-auto overflow-y-hidden pb-1">
        <div className="flex min-w-max items-stretch gap-2" role="tablist" aria-label="图纸表达功能">
          {drawingTools.map(tool => {
            const Icon = tool.icon;
            const active = activeTool === tool.key;
            return (
              <button
                key={tool.key}
                type="button"
                role="tab"
                aria-selected={active}
                data-tool={tool.key}
                onClick={() => onSelectTool(tool.key)}
                className={`flex min-h-11 flex-none items-center gap-2 whitespace-nowrap rounded-xl border px-3 py-2 text-left transition sm:px-4 ${
                  active
                    ? 'border-blue-500 bg-blue-50 text-blue-800 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50/50'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>
                  <span className="block text-xs font-black">{tool.label}</span>
                  <span className="hidden text-[10px] opacity-70 xl:block">{tool.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
