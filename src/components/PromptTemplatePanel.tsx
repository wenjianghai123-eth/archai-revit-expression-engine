import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { GenerationStep, PromptTemplate } from '../types';
import {
  applyPromptTemplateVariables,
  defaultPromptTemplateCategory,
  filterPromptTemplates,
  mergePromptTemplate,
  PROMPT_TEMPLATE_CATEGORIES,
  WORKSPACE_PROMPT_TEMPLATES,
} from '../prompts/promptTemplates';

interface PromptTemplatePanelProps {
  isOpen: boolean;
  step: GenerationStep;
  editTarget?: string;
  currentPrompt: string;
  onApplyPrompt: (prompt: string) => void;
  onClose: () => void;
}

export function PromptTemplatePanel({ isOpen, step, editTarget, currentPrompt, onApplyPrompt, onClose }: PromptTemplatePanelProps) {
  const [category, setCategory] = useState(() => defaultPromptTemplateCategory(step, editTarget));
  const [query, setQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [mergeMode, setMergeMode] = useState<'replace' | 'append'>('replace');

  const templates = useMemo(() => filterPromptTemplates({ step, editTarget, category, query }), [step, editTarget, category, query]);
  if (!isOpen) return null;

  const applyTemplate = (template: PromptTemplate) => {
    if (template.variables?.length && selectedTemplate?.id !== template.id) {
      setSelectedTemplate(template);
      setVariables(Object.fromEntries(template.variables.map(item => [item.key, item.defaultValue || ''])));
      return;
    }
    const prompt = applyPromptTemplateVariables(template, variables);
    onApplyPrompt(mergePromptTemplate(currentPrompt, prompt, currentPrompt.trim() ? mergeMode : 'replace'));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/30 p-4">
      <div className="ml-auto flex h-full w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">提示词模板</h2>
            <p className="text-xs text-slate-500">选择后只填入提示词，不会自动生成。</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 border-b border-slate-100 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索标题、说明或标签" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-300" />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {PROMPT_TEMPLATE_CATEGORIES.map(item => (
              <button key={item} type="button" onClick={() => setCategory(item)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ${category === item ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-500'}`}>
                {item}
              </button>
            ))}
          </div>
          {currentPrompt.trim() ? (
            <div className="flex gap-2 text-xs font-bold">
              <button type="button" onClick={() => setMergeMode('replace')} className={`rounded-lg px-3 py-1.5 ${mergeMode === 'replace' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>替换当前提示词</button>
              <button type="button" onClick={() => setMergeMode('append')} className={`rounded-lg px-3 py-1.5 ${mergeMode === 'append' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>追加到当前提示词</button>
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="grid gap-3 md:grid-cols-2">
            {templates.map(template => (
              <article key={template.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{template.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{template.description}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">{template.category}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(template.tags || []).map(tag => <span key={tag} className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-600">#{tag}</span>)}
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">{template.feature}</span>
                </div>
                {selectedTemplate?.id === template.id ? (
                  <div className="mt-3 space-y-2">
                    {template.variables?.map(variable => (
                      <label key={variable.key} className="block text-xs font-bold text-slate-600">
                        {variable.label}
                        <input value={variables[variable.key] || ''} onChange={event => setVariables(prev => ({ ...prev, [variable.key]: event.target.value }))} placeholder={variable.placeholder} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium outline-none focus:border-blue-300" />
                      </label>
                    ))}
                  </div>
                ) : null}
                <button type="button" onClick={() => applyTemplate(template)} className="mt-3 w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">
                  应用模板
                </button>
              </article>
            ))}
          </div>
          {templates.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">没有匹配的模板</p> : null}
        </div>
      </div>
    </div>
  );
}

export { WORKSPACE_PROMPT_TEMPLATES };
