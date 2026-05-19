import { useCallback, useState } from 'react';
import { DEFAULT_CONFIGS } from '../constants';
import { GenerationConfig, GenerationStep, MaterialTexture, PromptTemplate, ReferenceImage, StepState, UploadedImage } from '../types';

function createInitialStepState(step: GenerationStep): StepState {
  return {
    config: DEFAULT_CONFIGS[step],
    inputImage: null,
    materialImage: null,
    materialTextures: [],
    furnitureReferences: [],
    maskImage: null,
    useFullImageMask: false,
    outputImage: null,
    generationResults: [],
    selectedGenerationResultId: null,
    isGenerating: false,
    generationStatus: 'ready',
    generationError: null,
    generationWarnings: [],
    generationProvider: null,
    generationResultId: null,
    generationCreatedAt: null,
    generationJobId: null,
    generationJobStatus: null,
    generationJobDiagnostics: null,
    generationProgress: 0,
    generationLogs: [],
    viewMode: 'original',
    selectedModelAsset: null,
    modelSnapshot: null,
    modelSnapshotMetadata: null,
  };
}

function createInitialStepStates(): Record<GenerationStep, StepState> {
  return {
    [GenerationStep.FloorplanTo3D]: createInitialStepState(GenerationStep.FloorplanTo3D),
    [GenerationStep.StyleRender]: createInitialStepState(GenerationStep.StyleRender),
    [GenerationStep.LocalInpainting]: createInitialStepState(GenerationStep.LocalInpainting),
    [GenerationStep.ModelSnapshotRender]: createInitialStepState(GenerationStep.ModelSnapshotRender),
    [GenerationStep.DesignVariants]: createInitialStepState(GenerationStep.DesignVariants),
    [GenerationStep.PlanColorize]: createInitialStepState(GenerationStep.PlanColorize),
    [GenerationStep.MaterialReplace]: createInitialStepState(GenerationStep.MaterialReplace),
  };
}

export function useGenerationWorkflow(onOpenGenerate: () => void) {
  const [currentStep, setCurrentStep] = useState<GenerationStep>(GenerationStep.FloorplanTo3D);
  const [stepStates, setStepStates] = useState<Record<GenerationStep, StepState>>(createInitialStepStates);

  const handleUpdateConfig = useCallback((config: Partial<GenerationConfig>) => {
    setStepStates(prev => ({
      ...prev,
      [currentStep]: {
        ...prev[currentStep],
        config: { ...prev[currentStep].config, ...config },
      },
    }));
  }, [currentStep]);

  const handleUpdateInputImage = useCallback((image: UploadedImage | null) => {
    setStepStates(prev => ({
      ...prev,
      [currentStep]: {
        ...prev[currentStep],
        inputImage: image,
        maskImage: null,
        useFullImageMask: false,
        outputImage: image ? prev[currentStep].outputImage : null,
        generationResults: image ? prev[currentStep].generationResults : [],
        selectedGenerationResultId: image ? prev[currentStep].selectedGenerationResultId : null,
        generationStatus: 'ready',
        generationError: null,
        generationWarnings: [],
        generationProvider: null,
        generationResultId: null,
        generationCreatedAt: null,
        generationJobId: null,
        generationJobStatus: null,
        generationJobDiagnostics: null,
        generationProgress: 0,
        generationLogs: [],
        viewMode: image ? prev[currentStep].viewMode : 'original',
      },
    }));
  }, [currentStep]);

  const handleUpdateMaterialImage = useCallback((image: UploadedImage | null) => {
    setStepStates(prev => ({
      ...prev,
      [currentStep]: {
        ...prev[currentStep],
        materialImage: image,
      },
    }));
  }, [currentStep]);

  const handleUpdateMaterialTextures = useCallback((textures: MaterialTexture[]) => {
    setStepStates(prev => ({
      ...prev,
      [currentStep]: {
        ...prev[currentStep],
        materialTextures: textures,
        materialImage: textures[0]
          ? {
              id: textures[0].id,
              name: textures[0].name || '材质贴图',
              type: 'image/*',
              size: 0,
              dataUrl: textures[0].dataUrl || textures[0].url,
              url: textures[0].url,
              assetId: textures[0].assetId,
            }
          : null,
      },
    }));
  }, [currentStep]);

  const handleUpdateFurnitureReferences = useCallback((references: ReferenceImage[]) => {
    setStepStates(prev => ({
      ...prev,
      [currentStep]: {
        ...prev[currentStep],
        furnitureReferences: references,
      },
    }));
  }, [currentStep]);

  const handleUpdateMaskImage = useCallback((maskDataUrl: string | null, useFullImage: boolean, feather = 0) => {
    setStepStates(prev => ({
      ...prev,
      [currentStep]: {
        ...prev[currentStep],
        maskImage: maskDataUrl
          ? {
              id: `mask-${Date.now()}`,
              name: useFullImage ? '整图 mask' : '矩形 mask',
              type: 'image/png',
              size: 0,
              dataUrl: maskDataUrl,
            }
          : null,
        useFullImageMask: useFullImage,
        config: {
          ...prev[currentStep].config,
          feather,
        },
        generationStatus: 'ready',
        generationError: null,
        generationWarnings: [],
        generationProvider: null,
        generationResultId: null,
        generationCreatedAt: null,
        generationJobId: null,
        generationJobStatus: null,
        generationJobDiagnostics: null,
        generationProgress: 0,
        generationLogs: [],
      },
    }));
  }, [currentStep]);

  const handleResetConfig = useCallback(() => {
    setStepStates(prev => ({
      ...prev,
      [currentStep]: createInitialStepState(currentStep),
    }));
  }, [currentStep]);

  const resetWorkflow = useCallback(() => {
    setCurrentStep(GenerationStep.FloorplanTo3D);
    setStepStates(createInitialStepStates());
  }, []);

  const handleApplyTemplate = useCallback((template: PromptTemplate) => {
    const targetStep =
      template.feature === 'floorplan'
        ? GenerationStep.FloorplanTo3D
        : template.feature === 'style-render'
          ? GenerationStep.StyleRender
          : template.feature === 'design-variants'
            ? GenerationStep.DesignVariants
          : template.feature === 'plan-colorize'
            ? GenerationStep.PlanColorize
          : template.feature === 'model-render'
            ? GenerationStep.ModelSnapshotRender
            : template.feature === 'material-replace'
              ? GenerationStep.MaterialReplace
            : GenerationStep.LocalInpainting;

    const nextConfig = targetStep === GenerationStep.FloorplanTo3D
      ? omitFloorplanStyle(template.config)
      : template.config;

    setStepStates(prev => ({
      ...prev,
      [targetStep]: {
        ...prev[targetStep],
        config: { ...prev[targetStep].config, ...nextConfig },
      },
    }));
    setCurrentStep(targetStep);
    onOpenGenerate();
  }, [onOpenGenerate]);

  return {
    currentStep,
    setCurrentStep,
    stepStates,
    setStepStates,
    handleUpdateConfig,
    handleUpdateInputImage,
    handleUpdateMaterialImage,
    handleUpdateMaterialTextures,
    handleUpdateFurnitureReferences,
    handleUpdateMaskImage,
    handleResetConfig,
    handleApplyTemplate,
    resetWorkflow,
  };
}

function omitFloorplanStyle(config: Partial<GenerationConfig>): Partial<GenerationConfig> {
  const { style: _style, ...restConfig } = config;
  return restConfig;
}
