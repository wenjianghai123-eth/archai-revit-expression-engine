import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ResultQualityReport, readGenerationQualityReport } from './ResultQualityReport';

const report = {
  version: 1,
  status: 'failed',
  score: 52,
  checkedAt: '2026-07-16T00:00:00.000Z',
  issues: [{
    code: 'ASPECT_RATIO_CHANGED',
    severity: 'error',
    title: '画幅发生变化',
    message: '结果图画幅与原图明显不一致。',
  }],
  warnings: ['结果图画幅与原图明显不一致。'],
  metrics: {},
};

describe('ResultQualityReport', () => {
  it('renders readable warnings and explicit keep or retry decisions', () => {
    const html = renderToStaticMarkup(
      <ResultQualityReport resultId="result-1" metadata={{ qualityReport: report }} />,
    );
    expect(html).toContain('质量检查未通过');
    expect(html).toContain('画幅发生变化');
    expect(html).toContain('仍然保留');
    expect(html).toContain('标记需重做');
    expect(html).toContain('结果不会被自动删除');
  });

  it('rejects malformed metadata instead of assuming it is a report', () => {
    expect(readGenerationQualityReport({ version: 2, status: 'failed' })).toBeNull();
    expect(readGenerationQualityReport(null)).toBeNull();
  });
});
