import { useMemo, useState } from 'react';
import { isShowcaseDemoEnabled, showcaseCases } from '../constants/showcaseCases';
import {
  debugFeatureClick,
  defaultFeatureIds,
  type FeatureDefinition,
  getOptionalFeatures,
  getVisibleFeatures,
  readStoredVisibleFeatureIds,
  writeStoredVisibleFeatureIds,
} from '../featureRegistry';
import type { AssetModel, GenerationHistoryItem, GenerationStep, PromptTemplate } from '../types';
import { ShowcaseDemoDialog } from './showcase/ShowcaseAssets';
import { ContinueProjectPanel } from './home/ContinueProjectPanel';
import { FeaturePickerDialog } from './home/FeaturePickerDialog';
import { buildRecentProjectSummary } from './home/homeData';
import { HomeFeatureGrid } from './home/HomeFeatureGrid';
import { HomeHeader } from './home/HomeHeader';
import { HomeHero } from './home/HomeHero';
import { HomeResources } from './home/HomeResources';
import { RecentGenerationList } from './home/RecentGenerationList';

interface CreativeHomeProps {
  templates: PromptTemplate[];
  historyItems: GenerationHistoryItem[];
  onStartCreate: (step?: GenerationStep) => void;
  onStartScenario?: (scenarioId: string, step: GenerationStep) => void;
  onOpenTemplates: () => void;
  onOpenAssets: () => void;
  onOpenHistory: () => void;
  onOpenProject?: (projectId: string) => void;
  onOpenProjects?: () => void;
}

const ASSET_STORAGE_KEY = 'archai-model-assets-v1';

export function CreativeHome({
  templates,
  historyItems,
  onStartCreate,
  onStartScenario,
  onOpenTemplates,
  onOpenAssets,
  onOpenHistory,
  onOpenProject,
  onOpenProjects,
}: CreativeHomeProps) {
  const modelAssets = useMemo(readStoredAssets, []);
  const recentProject = useMemo(() => buildRecentProjectSummary(historyItems), [historyItems]);
  const [addedFeatureIds, setAddedFeatureIds] = useState<string[]>(() => readStoredVisibleFeatureIds());
  const [isFeaturePickerOpen, setIsFeaturePickerOpen] = useState(false);
  const [isShowcaseDemoOpen, setIsShowcaseDemoOpen] = useState(false);
  const visibleFeatures = getVisibleFeatures(addedFeatureIds);
  const optionalFeatures = getOptionalFeatures();
  const visibleFeatureIds = new Set(visibleFeatures.map(feature => feature.id));
  const demoEnabled = isShowcaseDemoEnabled(import.meta.env.DEV, import.meta.env.VITE_ENABLE_SHOWCASE_DEMO);

  const handleAddFeature = (featureId: string) => {
    if (defaultFeatureIds.includes(featureId as typeof defaultFeatureIds[number]) || addedFeatureIds.includes(featureId)) return;
    const nextIds = [...addedFeatureIds, featureId];
    setAddedFeatureIds(nextIds);
    writeStoredVisibleFeatureIds(nextIds);
  };

  const handleRemoveFeature = (featureId: string) => {
    if (defaultFeatureIds.includes(featureId as typeof defaultFeatureIds[number])) return;
    const nextIds = addedFeatureIds.filter(id => id !== featureId);
    setAddedFeatureIds(nextIds);
    writeStoredVisibleFeatureIds(nextIds);
  };

  const handleStartFeature = (feature: FeatureDefinition) => {
    debugFeatureClick(feature);
    onStartCreate(feature.step);
  };

  const handleStartScenario = (scenarioId: string, step: GenerationStep) => {
    if (onStartScenario) onStartScenario(scenarioId, step);
    else onStartCreate(step);
  };

  const handleContinueProject = (projectId: string) => {
    if (onOpenProject) onOpenProject(projectId);
    else onOpenHistory();
  };

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#F6F7F9] custom-scrollbar">
      <div className="mx-auto flex w-full max-w-[1440px] min-w-0 flex-col gap-7 px-4 py-6 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
        <HomeHeader onCreate={() => onStartCreate()} />

        <HomeHero
          showcaseCase={showcaseCases[0]}
          onStart={() => handleStartFeature(visibleFeatures[0])}
          onStartScenario={handleStartScenario}
          onOpenDemo={demoEnabled ? () => setIsShowcaseDemoOpen(true) : undefined}
        />

        <HomeFeatureGrid
          features={visibleFeatures}
          onStartFeature={handleStartFeature}
          onManage={() => setIsFeaturePickerOpen(true)}
        />

        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <ContinueProjectPanel
            project={recentProject}
            onContinue={handleContinueProject}
            onCreateProject={() => onOpenProjects ? onOpenProjects() : onStartCreate()}
          />
          <RecentGenerationList items={historyItems} onOpenHistory={onOpenHistory} />
        </div>

        <HomeResources
          templates={templates}
          modelAssets={modelAssets}
          onOpenTemplates={onOpenTemplates}
          onOpenAssets={onOpenAssets}
        />
      </div>

      {isFeaturePickerOpen ? (
        <FeaturePickerDialog
          features={optionalFeatures}
          visibleFeatureIds={visibleFeatureIds}
          onAdd={handleAddFeature}
          onRemove={handleRemoveFeature}
          onClose={() => setIsFeaturePickerOpen(false)}
        />
      ) : null}

      {isShowcaseDemoOpen ? <ShowcaseDemoDialog cases={showcaseCases} onClose={() => setIsShowcaseDemoOpen(false)} /> : null}
    </div>
  );
}

function readStoredAssets(): AssetModel[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(ASSET_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed as AssetModel[] : [];
  } catch {
    return [];
  }
}
