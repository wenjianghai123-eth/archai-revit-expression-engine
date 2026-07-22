import type { GenerationConfig, StepState } from '../../types';

export type DrawingTool =
  | 'color-plan-2d'
  | 'color-plan-3d'
  | 'region-recognition'
  | 'material-mapping'
  | 'functional-zoning'
  | 'circulation-analysis';

export type DrawingViewerMode = 'original' | 'result' | 'compare' | 'overlay';

export type DrawingWorkflowStage = 'empty' | 'uploaded' | 'configuring' | 'generating' | 'completed' | 'failed';

export interface DrawingExpressionUiState {
  activeTool: DrawingTool;
  viewerMode: DrawingViewerMode;
  workflowStage: DrawingWorkflowStage;
  isInspectingResult: boolean;
}

export type DrawingExpressionUiAction =
  | { type: 'select-tool'; tool: DrawingTool }
  | { type: 'set-viewer-mode'; viewerMode: DrawingViewerMode }
  | { type: 'return-to-editor' }
  | { type: 'sync-workflow-stage'; workflowStage: DrawingWorkflowStage }
  | { type: 'reset'; state: DrawingExpressionUiState };

export function drawingExpressionUiReducer(
  state: DrawingExpressionUiState,
  action: DrawingExpressionUiAction,
): DrawingExpressionUiState {
  if (action.type === 'select-tool') {
    return {
      ...state,
      activeTool: action.tool,
      workflowStage: state.workflowStage === 'empty' ? 'empty' : 'configuring',
      isInspectingResult: !usesFloorPlanRegionWorkflow(action.tool),
    };
  }
  if (action.type === 'set-viewer-mode') return { ...state, viewerMode: action.viewerMode, isInspectingResult: true };
  if (action.type === 'return-to-editor') return { ...state, isInspectingResult: false };
  if (action.type === 'sync-workflow-stage') return { ...state, workflowStage: action.workflowStage };
  return action.state;
}

export function createDrawingExpressionUiState(state: StepState): DrawingExpressionUiState {
  return {
    activeTool: resolveDrawingTool(state.config),
    viewerMode: fromStepViewMode(state.viewMode),
    workflowStage: resolveDrawingWorkflowStage(state),
    isInspectingResult: false,
  };
}

export function resolveDrawingTool(config: GenerationConfig): DrawingTool {
  if (config.template === 'circulation-analysis' || config.enableCirculationArrows === true) return 'circulation-analysis';
  if (config.template === 'zoning-color' || config.enableZoningColor === true) return 'functional-zoning';
  if (config.floorPlanExpressionMode === 'three-dimensional' || config.floorplanRenderMode === 'semi-3d') return 'color-plan-3d';
  if (config.floorPlanExpressionMode === 'analysis' || config.floorplanRenderMode === 'presentation') return 'functional-zoning';
  return 'region-recognition';
}

export function buildDrawingToolConfigPatch(tool: DrawingTool, config: GenerationConfig): Partial<GenerationConfig> {
  if (tool === 'color-plan-3d') {
    return {
      floorPlanExpressionMode: 'three-dimensional',
      floorplanOutputMode: 'single',
      floorplanRenderMode: 'semi-3d',
      planColorizeBatchEnabled: false,
      batchCount: 1,
      template: 'colored-plan',
      lineworkPreservation: config.lineworkPreservation || 'high',
      preserveLinework: true,
    };
  }
  if (tool === 'functional-zoning') {
    return {
      floorPlanExpressionMode: 'analysis',
      floorplanOutputMode: 'single',
      floorplanRenderMode: 'presentation',
      planColorizeBatchEnabled: false,
      batchCount: 1,
      template: 'zoning-color',
      enableZoningColor: true,
      enableCirculationArrows: false,
      preserveLinework: true,
    };
  }
  if (tool === 'circulation-analysis') {
    return {
      floorPlanExpressionMode: 'analysis',
      floorplanOutputMode: 'single',
      floorplanRenderMode: 'presentation',
      planColorizeBatchEnabled: false,
      batchCount: 1,
      template: 'circulation-analysis',
      enableZoningColor: false,
      enableCirculationArrows: true,
      preserveLinework: true,
    };
  }

  return {
    floorPlanExpressionMode: 'precise-material',
    floorplanOutputMode: 'single',
    floorplanRenderMode: 'flat-color',
    planColorizeBatchEnabled: false,
    batchCount: 1,
    template: 'colored-plan',
    lineworkPreservation: 'strict',
    preserveLinework: true,
  };
}

export function resolveDrawingWorkflowStage(state: StepState): DrawingWorkflowStage {
  if (!state.inputImage) return 'empty';
  if (state.isGenerating || state.generationStatus === 'uploading' || state.generationStatus === 'generating') return 'generating';
  if (state.generationStatus === 'success') return 'completed';
  if (state.generationStatus === 'error') return 'failed';
  return state.inputImage.uploadStatus === 'uploaded' ? 'uploaded' : 'configuring';
}

export function fromStepViewMode(viewMode: StepState['viewMode']): DrawingViewerMode {
  return viewMode === 'after' ? 'result' : viewMode;
}

export function toStepViewMode(viewerMode: DrawingViewerMode): StepState['viewMode'] {
  return viewerMode === 'result' ? 'after' : viewerMode;
}

export function usesFloorPlanRegionWorkflow(tool: DrawingTool): boolean {
  return tool === 'region-recognition' || tool === 'material-mapping';
}
