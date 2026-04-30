import React from 'react';
import { motion } from 'motion/react';
import { 
  History, 
  Settings, 
  Zap, 
  LayoutDashboard,
  Database,
  Layers
} from 'lucide-react';
import { GenerationStep } from '../types';

interface SidebarProps {
  activeTab: string;
  onTabChange: (id: string) => void;
  onSettingsOpen: () => void;
}

export function Sidebar({ activeTab, onTabChange, onSettingsOpen }: SidebarProps) {
  const tabs = [
    { id: 'generate', icon: LayoutDashboard, label: '智能生成' },
    { id: 'assets', icon: Database, label: '资产库' },
    { id: 'templates', icon: Layers, label: '提示词模板' },
    { id: 'history', icon: History, label: '生成记录' },
  ];

  return (
    <div className="w-16 md:w-20 lg:w-20 border-r border-slate-800 flex flex-col items-center h-screen bg-slate-900 z-20 shrink-0">
      <div className="p-6 mb-4 flex items-center justify-center">
        <div className="w-10 h-10 bg-blue-600 rounded flex items-center justify-center shadow-lg shadow-blue-600/20">
          <Zap className="text-white w-5 h-5 fill-current" />
        </div>
      </div>

      <nav className="flex-1 space-y-4 px-2 w-full flex flex-col items-center">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`p-3 rounded-xl transition-all group relative ${
              activeTab === tab.id 
                ? 'bg-blue-600/20 text-blue-400' 
                : 'text-slate-500 hover:text-white hover:bg-white/5'
            }`}
          >
            <tab.icon className="w-6 h-6 shrink-0" />
            {activeTab === tab.id && (
              <motion.div 
                layoutId="active-pill"
                className="absolute -left-2 w-1 h-6 bg-blue-500 rounded-r-full"
              />
            )}
            <div className="absolute left-full ml-4 px-2 py-1 bg-slate-800 text-white text-[10px] uppercase font-bold rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
              {tab.label}
            </div>
          </button>
        ))}
      </nav>

      <div className="p-6 mt-auto">
        <button onClick={onSettingsOpen} className="text-slate-500 hover:text-white transition-colors" title="设置">
          <Settings className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}

interface StepperProps {
  currentStep: GenerationStep;
}

export function Stepper({ currentStep, onStepChange }: { currentStep: GenerationStep, onStepChange: (step: GenerationStep) => void }) {
  const steps = [
    { id: GenerationStep.FloorplanTo3D, title: '平面 → 三维' },
    { id: GenerationStep.StyleRender, title: '风格渲染' },
    { id: GenerationStep.LocalInpainting, title: '局部修饰' },
  ];

  return (
    <div className="flex items-center h-16 border-b border-slate-200 bg-white sticky top-0 z-10 w-full px-6 shrink-0">
      <div className="flex items-center gap-3 mr-auto">
        <span className="font-bold tracking-tight text-lg text-slate-900 hidden md:inline">ArchAI Expression Engine MVP 0.1</span>
        <span className="font-bold tracking-tight text-lg text-slate-900 md:hidden">ArchAI MVP 0.1</span>
      </div>

      <nav className="flex items-center gap-4 md:gap-6">
        {steps.map((step, index) => {
          const isActive = currentStep === step.id;
          return (
            <React.Fragment key={step.id}>
              <button 
                onClick={() => onStepChange(step.id)}
                className={`flex items-center gap-2 transition-all hover:opacity-100 ${isActive ? 'opacity-100 scale-105' : 'opacity-40 hover:scale-102'}`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                  isActive ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'bg-slate-300 text-slate-600'
                }`}>
                  {`0${step.id}`}
                </div>
                <span className={`text-sm font-semibold whitespace-nowrap hidden sm:block ${isActive ? 'text-slate-900' : 'text-slate-500'}`}>
                  {step.title}
                </span>
              </button>
              
              {index < steps.length - 1 && (
                <div className="w-8 md:w-12 h-px bg-slate-200" />
               )}
            </React.Fragment>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-4 pl-6 border-l border-slate-100">
        <div className="text-xs text-right hidden sm:block">
          <p className="font-bold text-slate-800 uppercase tracking-tighter">项目一号</p>
          <p className="text-slate-400 font-mono">首层平面图</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 overflow-hidden">
           <div className="w-full h-full bg-gradient-to-br from-blue-100 to-indigo-100" />
        </div>
      </div>
    </div>
  );
}
