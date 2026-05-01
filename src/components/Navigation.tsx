import React from 'react';
import { motion } from 'motion/react';
import { 
  History, 
  Settings, 
  Zap, 
  LayoutDashboard,
  Database,
  Layers,
  Wand2,
  Paintbrush,
  ScanLine,
  Sparkles
} from 'lucide-react';
import { GenerationStep } from '../types';

interface SidebarProps {
  activeTab: string;
  onTabChange: (id: string) => void;
  onSettingsOpen: () => void;
}

export function Sidebar({ activeTab, onTabChange, onSettingsOpen }: SidebarProps) {
  const groups = [
    {
      title: '创作',
      items: [
        { id: 'home', icon: Sparkles, label: '首页', desc: '创作台概览' },
        { id: 'generate', icon: LayoutDashboard, label: 'AI 生成', desc: '图像生成工作台' },
      ],
    },
    {
      title: '资源',
      items: [
        { id: 'assets', icon: Database, label: '模型资产', desc: '管理三维资产' },
        { id: 'templates', icon: Layers, label: '提示词模板', desc: '效果图提示词库' },
        { id: 'history', icon: History, label: '生成历史', desc: '回溯方案记录' },
      ],
    },
  ];
  const mobileTabs = groups.flatMap((group) => group.items);

  return (
    <>
    <div className="hidden h-screen w-72 shrink-0 flex-col border-r border-white/10 bg-[#070b16] text-white shadow-2xl lg:flex">
      <div className="border-b border-white/10 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-950/40">
            <Zap className="h-5 w-5 fill-current text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-black tracking-tight">ArchAI</p>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Expression Engine</p>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <span className="rounded-full border border-blue-400/30 bg-blue-500/10 px-2.5 py-1 text-[10px] font-bold text-blue-200">MVP</span>
          <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-[10px] font-bold text-violet-200">AI Studio</span>
        </div>
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-300">当前项目</p>
          <h2 className="mt-2 text-lg font-bold leading-tight">建筑 AI 创作工作台</h2>
          <p className="mt-2 text-xs leading-5 text-slate-400">从平面、风格到局部修饰，统一管理生成资产与方案记录。</p>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 custom-scrollbar">
        {groups.map((group) => (
          <div key={group.title} className="space-y-2">
            <p className="px-3 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-600">{group.title}</p>
            {group.items.map((tab) => (
              <NavItem key={tab.id} tab={tab} active={activeTab === tab.id} onClick={() => onTabChange(tab.id)} />
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-4">
        <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-600">系统</p>
        <button onClick={onSettingsOpen} className="group flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-slate-400 transition-colors hover:bg-white/5 hover:text-white" title="设置">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 group-hover:bg-white/10">
            <Settings className="h-5 w-5" />
          </div>
          <span className="min-w-0">
            <span className="block text-sm font-bold">设置</span>
            <span className="block text-xs text-slate-500">后端与模型状态</span>
          </span>
        </button>
      </div>
    </div>
    <div className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-white/10 bg-slate-950/95 px-2 py-2 text-white backdrop-blur lg:hidden">
      {mobileTabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-bold ${
            activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-slate-400'
          }`}
        >
          <tab.icon className="h-4 w-4" />
          {tab.id === 'generate' ? '生成' : tab.label}
        </button>
      ))}
      <button onClick={onSettingsOpen} className="flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-bold text-slate-400">
        <Settings className="h-4 w-4" />
        设置
      </button>
    </div>
    </>
  );
}

function NavItem({
  tab,
  active,
  onClick,
}: {
  tab: { id: string; icon: React.ComponentType<{ className?: string }>; label: string; desc: string };
  active: boolean;
  onClick: () => void;
}) {
  const Icon = tab.icon;

  return (
    <button
      onClick={onClick}
      className={`group relative flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all ${
        active
          ? 'bg-gradient-to-r from-blue-600/90 to-indigo-600/90 text-white shadow-lg shadow-blue-950/40'
          : 'text-slate-400 hover:bg-white/5 hover:text-white'
      }`}
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${active ? 'bg-white/15' : 'bg-white/5 group-hover:bg-white/10'}`}>
        <Icon className="h-5 w-5 shrink-0" />
      </div>
      <span className="min-w-0">
        <span className="block text-sm font-bold">{tab.label}</span>
        <span className={`mt-0.5 block text-xs ${active ? 'text-blue-100' : 'text-slate-500'}`}>{tab.desc}</span>
      </span>
      {active && <motion.div layoutId="active-pill" className="absolute -left-4 h-8 w-1 rounded-r-full bg-indigo-300" />}
    </button>
  );
}

interface StepperProps {
  currentStep: GenerationStep;
}

export function Stepper({ currentStep, onStepChange }: { currentStep: GenerationStep, onStepChange: (step: GenerationStep) => void }) {
  const steps = [
    {
      id: GenerationStep.FloorplanTo3D,
      title: '平面彩平',
      desc: '上传平面图，生成三维彩平表达',
      icon: ScanLine,
      image: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&q=80&w=600',
    },
    {
      id: GenerationStep.StyleRender,
      title: '风格渲染',
      desc: '参考图生成建筑或室内风格效果',
      icon: Wand2,
      image: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&q=80&w=600',
    },
    {
      id: GenerationStep.LocalInpainting,
      title: '局部修饰',
      desc: '画 mask 精修材质、家具与光影',
      icon: Paintbrush,
      image: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&q=80&w=600',
    },
  ];

  return (
    <div className="shrink-0 border-b border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-6 px-5 py-4 md:px-8">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-blue-600">
            <Sparkles className="h-3.5 w-3.5" />
            AI Creative Platform
          </div>
          <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-950 md:text-2xl">建筑设计 AI 生成工作台</h1>
        </div>
        <div className="hidden rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-500 md:block">
          MVP 0.1 / Express Backend
        </div>
      </div>

      <div className="grid gap-3 px-5 pb-5 md:grid-cols-3 md:px-8">
        {steps.map((step) => {
          const isActive = currentStep === step.id;
          const Icon = step.icon;
          return (
            <button
              key={step.id}
              onClick={() => onStepChange(step.id)}
              className={`group relative min-h-28 overflow-hidden rounded-2xl border p-4 text-left transition-all ${
                isActive
                  ? 'border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-lg shadow-blue-100/60'
                  : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'
              }`}
            >
              <img
                src={step.image}
                alt={step.title}
                className="absolute inset-0 h-full w-full object-cover opacity-10 transition-transform duration-500 group-hover:scale-105"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-white via-white/90 to-white/45" />
              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${isActive ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-100' : 'bg-slate-100 text-slate-600'}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <h2 className="text-sm font-bold text-slate-950">{step.title}</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{step.desc}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                    isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  0{step.id}
                </span>
              </div>
              {isActive && (
                <motion.div
                  layoutId="active-step-card"
                  className="absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-blue-600 to-indigo-600"
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500 md:px-8">
        <span>选择任务后，在下方工作区上传图片、配置提示词并生成结果。</span>
        <button
          className="rounded-full bg-slate-100 px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-200"
          type="button"
        >
          项目一号
        </button>
      </div>

      <div className="flex border-t border-slate-100 lg:hidden">
        {steps.map((step) => {
          const isActive = currentStep === step.id;
          return (
            <button
              key={step.id}
              onClick={() => onStepChange(step.id)}
              className={`flex-1 px-2 py-3 text-xs font-bold ${isActive ? 'bg-blue-600 text-white' : 'text-slate-500'}`}
            >
              {step.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}
