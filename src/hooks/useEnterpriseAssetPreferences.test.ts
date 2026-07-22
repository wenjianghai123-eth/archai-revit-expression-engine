import { beforeEach, describe, expect, it } from 'vitest';

import { readEnterpriseAssetPreferences } from './useEnterpriseAssetPreferences';

describe('enterprise asset preferences compatibility', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('migrates existing prompt-template favorites and recent usage into unified ids', () => {
    window.localStorage.setItem('archai-template-favorites-v1', JSON.stringify(['template-1']));
    window.localStorage.setItem('archai-template-recent-v1', JSON.stringify({
      'template-1': '2026-07-16T12:00:00.000Z',
    }));

    expect(readEnterpriseAssetPreferences()).toMatchObject({
      favoriteIds: ['prompt-template:template-1'],
      recentUsage: {
        'prompt-template:template-1': '2026-07-16T12:00:00.000Z',
      },
    });
  });
});
