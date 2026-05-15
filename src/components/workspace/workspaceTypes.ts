import { StepState } from '../../types';

export type UploadTarget = 'input' | 'material' | 'texture' | 'furniture';

export interface ViewModeOption {
  value: StepState['viewMode'];
  label: string;
  disabled: boolean;
}

export type UploadErrors = Record<UploadTarget, string | null>;

