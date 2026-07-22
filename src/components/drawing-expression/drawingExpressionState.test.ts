import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIGS } from '../../constants';
import { GenerationStep } from '../../types';
import {
  buildDrawingToolConfigPatch,
  drawingExpressionUiReducer,
  type DrawingExpressionUiState,
} from './drawingExpressionState';

const initialState: DrawingExpressionUiState = {
  activeTool: 'region-recognition',
  viewerMode: 'original',
  workflowStage: 'uploaded',
  isInspectingResult: false,
};

describe('drawingExpressionUiReducer', () => {
  it('selects the 3D color plan tool without changing viewer mode', () => {
    const next = drawingExpressionUiReducer(initialState, { type: 'select-tool', tool: 'color-plan-3d' });
    expect(next.activeTool).toBe('color-plan-3d');
    expect(next.viewerMode).toBe('original');
    expect(next.workflowStage).toBe('configuring');
    expect(next.isInspectingResult).toBe(true);
  });

  it('changes overlay viewing without changing the active drawing tool', () => {
    const next = drawingExpressionUiReducer(
      { ...initialState, activeTool: 'color-plan-3d' },
      { type: 'set-viewer-mode', viewerMode: 'overlay' },
    );
    expect(next.viewerMode).toBe('overlay');
    expect(next.activeTool).toBe('color-plan-3d');
  });

  it('maps functional zoning and circulation to distinct explicit config keys', () => {
    const config = DEFAULT_CONFIGS[GenerationStep.FloorplanTo3D];
    expect(buildDrawingToolConfigPatch('functional-zoning', config)).toMatchObject({
      template: 'zoning-color',
      enableZoningColor: true,
      enableCirculationArrows: false,
    });
    expect(buildDrawingToolConfigPatch('circulation-analysis', config)).toMatchObject({
      template: 'circulation-analysis',
      enableZoningColor: false,
      enableCirculationArrows: true,
    });
  });

  it('keeps the selected tool and viewer mode when generation fails', () => {
    const current: DrawingExpressionUiState = {
      activeTool: 'circulation-analysis',
      viewerMode: 'overlay',
      workflowStage: 'generating',
      isInspectingResult: true,
    };
    const next = drawingExpressionUiReducer(current, { type: 'sync-workflow-stage', workflowStage: 'failed' });
    expect(next).toEqual({ ...current, workflowStage: 'failed' });
  });
});
