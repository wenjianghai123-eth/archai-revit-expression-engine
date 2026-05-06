import { useCallback, useState } from 'react';
import { DEFAULT_CONFIGS } from '../constants';
import { GenerationConfig, GenerationStep, PromptTemplate, StepState, UploadedImage } from '../types';

function createInitialStepState(step: GenerationStep): StepState {
  return {
    config: DEFAULT_CONFIGS[step],
    inputImage: null,
    materialImage: null,
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
    generationProgress: 0,
    generationLogs: [],
    viewMode: 'original',
  };
}

function createInitialStepStates(): Record<GenerationStep, StepState> {
  return {
    [GenerationStep.FloorplanTo3D]: createInitialStepState(GenerationStep.FloorplanTo3D),
    [GenerationStep.StyleRender]: createInitialStepState(GenerationStep.StyleRender),
    [GenerationStep.LocalInpainting]: createInitialStepState(GenerationStep.LocalInpainting),
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

  const handleApplyTemplate = useCallback((template: PromptTemplate) => {
    const targetStep =
      template.feature === 'floorplan'
        ? GenerationStep.FloorplanTo3D
        : template.feature === 'style-render'
          ? GenerationStep.StyleRender
          : GenerationStep.LocalInpainting;

    setStepStates(prev => ({
      ...prev,
      [targetStep]: {
        ...prev[targetStep],
        config: { ...prev[targetStep].config, ...template.config },
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
    handleUpdateMaskImage,
    handleResetConfig,
    handleApplyTemplate,
  };
}
