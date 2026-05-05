import React, { FormEvent, useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, FolderKanban, Loader2, Plus, RefreshCw } from 'lucide-react';
import { createProject, listProjects, Project } from '../lib/api';

interface ProjectListProps {
  onOpenProject: (projectId: string) => void;
}

export function ProjectList({ onOpenProject }: ProjectListProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = async () => {
    setIsLoading(true);
    setError(null);

    try {
      setProjects(await listProjects());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '项目列表加载失败。');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadProjects();
  }, []);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError('请先填写项目名称。');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const project = await createProject({
        name: trimmedName,
        description: description.trim(),
      });
      setProjects(prev => [project, ...prev]);
      setName('');
      setDescription('');
      onOpenProject(project.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '项目创建失败。');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="arch-page">
      <div className="arch-page-inner">
        <header className="arch-page-header">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-blue-600">
                <FolderKanban className="h-4 w-4" />
                Project Workspace
              </div>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">项目</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                管理方案表达项目，把平面图、参考图、AI 生成记录和交付成果放在同一个上下文里。
              </p>
            </div>
            <button onClick={() => void loadProjects()} className="arch-button-secondary w-fit" disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              刷新
            </button>
          </div>
        </header>

        <section className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[360px_1fr]">
          <form onSubmit={handleCreate} className="arch-card flex h-fit flex-col gap-4 p-4">
            <div>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <Plus className="h-5 w-5" />
              </div>
              <h2 className="mt-3 text-base font-bold text-slate-900">创建项目</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">先建立项目，再进入 AI 生成工作台开始方案表达。</p>
            </div>
            <label className="space-y-2">
              <span className="text-xs font-bold text-slate-600">项目名称</span>
              <input
                value={name}
                onChange={event => setName(event.target.value)}
                className="arch-input w-full"
                placeholder="例如：滨水展厅概念方案"
                disabled={isCreating}
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-bold text-slate-600">项目描述</span>
              <textarea
                value={description}
                onChange={event => setDescription(event.target.value)}
                className="arch-input min-h-24 w-full resize-none"
                placeholder="补充客户、风格方向或交付目标"
                disabled={isCreating}
              />
            </label>
            <button className="arch-button-primary" disabled={isCreating}>
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              创建并进入
            </button>
          </form>

          <div className="min-h-0 overflow-y-auto custom-scrollbar">
            {error && (
              <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {isLoading ? (
              <div className="arch-empty">
                <Loader2 className="mb-4 h-8 w-8 animate-spin text-blue-600" />
                <h2 className="text-base font-bold text-slate-900">正在加载项目</h2>
                <p className="mt-2 text-sm text-slate-500">正在从本地后端读取项目列表。</p>
              </div>
            ) : projects.length === 0 ? (
              <div className="arch-empty">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <FolderKanban className="h-7 w-7" />
                </div>
                <h2 className="text-lg font-bold text-slate-900">还没有项目</h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                  创建第一个项目后，可以把生成方案、参考图和后续版本都整理到这里。
                </p>
              </div>
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {projects.map(project => (
                  <button
                    key={project.id}
                    onClick={() => onOpenProject(project.id)}
                    className="arch-card group p-4 text-left"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <span className="arch-pill">{project.status === 'archived' ? '已归档' : '进行中'}</span>
                        <h2 className="mt-3 truncate text-lg font-bold text-slate-950">{project.name}</h2>
                        <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-slate-500">
                          {project.description || '暂无项目描述。'}
                        </p>
                      </div>
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-slate-400 transition-colors group-hover:bg-blue-50 group-hover:text-blue-600">
                        <ArrowRight className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400">
                      <span>创建：{formatDate(project.createdAt)}</span>
                      <span>更新：{formatDate(project.updatedAt)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
