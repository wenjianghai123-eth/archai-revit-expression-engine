import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GenerationProgress } from './GenerationProgress';

describe('GenerationProgress', () => {
  it('shows an indeterminate stage when the backend has no real percentage', () => {
    const html = renderToStaticMarkup(<GenerationProgress status="generating" progress={null} />);

    expect(html).toContain('正在生成结果');
    expect(html).toContain('阶段进度');
    expect(html).toContain('data-testid="indeterminate-progress"');
  });

  it('always shows 100 percent for a completed task', () => {
    const html = renderToStaticMarkup(<GenerationProgress status="completed" progress={67} />);

    expect(html).toContain('生成完成');
    expect(html).toContain('100%');
    expect(html).toContain('width:100%');
  });

  it('keeps a concrete failure reason visible', () => {
    const html = renderToStaticMarkup(<GenerationProgress status="failed" errorMessage="模型请求超时" />);

    expect(html).toContain('生成失败');
    expect(html).toContain('模型请求超时');
  });
});
