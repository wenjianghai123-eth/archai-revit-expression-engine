import React from 'react';
import { Check, Layers, Sparkles } from 'lucide-react';
import { GenerationConfig, PromptTemplate } from '../types';

interface TemplatesLibraryProps {
  templates: PromptTemplate[];
  currentConfig: GenerationConfig;
  onApply: (template: PromptTemplate) => void;
}

export function TemplatesLibrary({ templates, currentConfig, onApply }: TemplatesLibraryProps) {
  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-6 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white shadow-lg shadow-blue-200">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">提示词模板</h1>
              <p className="text-sm text-slate-500">选择一个建筑表达模板，立即应用到当前生成配置。</p>
            </div>
          </div>
        </div>

        {templates.length === 0 ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white p-10 text-center">
            <Sparkles className="mb-4 h-10 w-10 text-slate-300" />
            <h2 className="text-base font-bold text-slate-900">暂无模板</h2>
            <p className="mt-2 max-w-sm text-sm text-slate-500">模板库会在这里显示可复用的建筑提示词与默认参数。</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {templates.map((template) => {
              const isActive = currentConfig.prompt === template.config.prompt;

              return (
                <button
                  key={template.id}
                  onClick={() => onApply(template)}
                  className={`group flex min-h-56 flex-col rounded-lg border bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md ${
                    isActive ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'
                  }`}
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      {template.category}
                    </span>
                    {isActive && (
                      <span className="flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">
                        <Check className="h-3 w-3" />
                        已应用
                      </span>
                    )}
                  </div>
                  <h2 className="text-base font-bold text-slate-900">{template.title}</h2>
                  <p className="mt-2 flex-1 text-sm leading-6 text-slate-500">{template.description}</p>
                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <p className="line-clamp-3 text-xs leading-5 text-slate-600">{template.config.prompt}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
