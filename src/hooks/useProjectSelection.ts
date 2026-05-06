import { useCallback, useState } from 'react';
import { GenerationStep } from '../types';

export function useProjectSelection() {
  const [activeTab, setActiveTab] = useState('home');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const openProject = useCallback((projectId: string) => {
    setSelectedProjectId(projectId);
    setActiveTab('project-detail');
  }, []);

  const backToProjects = useCallback(() => {
    setActiveTab('projects');
  }, []);

  const startCreate = useCallback((setCurrentStep: (step: GenerationStep) => void, step: GenerationStep = GenerationStep.FloorplanTo3D) => {
    setCurrentStep(step);
    setActiveTab('generate');
  }, []);

  return {
    activeTab,
    setActiveTab,
    selectedProjectId,
    setSelectedProjectId,
    openProject,
    backToProjects,
    startCreate,
  };
}
