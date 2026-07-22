import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AssetModel } from '../../types';
import { ModelProcessingStatus, readModelProcessingStages } from './ModelProcessingStatus';

const model: AssetModel = {
  id: 'model-1',
  name: 'Office',
  fileName: 'office.obj',
  fileType: 'obj',
  format: 'obj',
  modelUrl: '/uploads/office.obj',
  thumbnail: '',
  size: '40 MB',
  date: '2026-07-16',
  source: 'uploaded',
  previewable: true,
  conversionStatus: 'converting',
  optimizationStatus: 'processing',
};

describe('ModelProcessingStatus', () => {
  it('shows conversion and optimization as independent progress stages', () => {
    expect(readModelProcessingStages(model).map(stage => stage.status)).toEqual(['running', 'running']);
    const html = renderToStaticMarkup(<ModelProcessingStatus model={model} />);
    expect(html).toContain('格式转换');
    expect(html).toContain('正在转换');
    expect(html).toContain('预览轻量化');
    expect(html).toContain('正在处理');
  });
});
