import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

test('design variants keeps actions accessible from empty to completed states', async ({ page }, testInfo) => {
  await installAuthenticatedUser(page);
  await page.goto('/');
  await page.getByRole('button', { name: '开始创作' }).first().click();
  await expect(page).toHaveURL(/\/app/u);
  await page.getByRole('button', { name: /方案变体/ }).first().click();

  await page.setViewportSize({ width: 1440, height: 900 });
  await expectVariantPanels(page);
  await page.screenshot({ path: testInfo.outputPath('variant-empty-1440.png'), fullPage: false });

  const uploadInput = page.locator('input[type="file"][accept*=".jpg"]').first();
  await uploadInput.setInputFiles(path.resolve('public/cases/fallback-scheme-variant.jpg'));
  await expect(page.getByText('原图', { exact: true }).first()).toBeVisible();

  const generateButton = page.getByRole('button', { name: '生成方案组' });
  await expect(generateButton).toBeEnabled();
  await generateButton.click();
  await expect(page.getByText(/正在生成 4 个方案|正在生成结果/).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('variant-generating-1440.png'), fullPage: false });

  await expect(page.getByText('生成完成', { exact: true }).first()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole('button', { name: '保存全部' })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('variant-completed-1440.png'), fullPage: false });

  await page.setViewportSize({ width: 1280, height: 720 });
  await expectVariantPanels(page);
  await page.screenshot({ path: testInfo.outputPath('variant-completed-1280.png'), fullPage: false });

  await page.setViewportSize({ width: 768, height: 1024 });
  await expectVariantPanels(page);
  await page.screenshot({ path: testInfo.outputPath('variant-mobile-768.png'), fullPage: false });
  await expect(page.getByRole('button', { name: /重新生成方案组/ })).toBeVisible();
});

async function installAuthenticatedUser(page: Page) {
  const user = {
    id: 'variant-layout-user',
    email: 'variant-layout@archai.local',
    name: 'Variant Layout User',
    role: 'admin',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  await page.addInitScript(storedUser => {
    window.localStorage.setItem('auth_access_token', 'variant-layout-token');
    window.localStorage.setItem('auth_user', JSON.stringify(storedUser));
  }, user);
  await page.route(/^https?:\/\/[^/]+\/api\/(me|credits|ai-providers|prompt-templates)$/u, route => {
    const pathName = new URL(route.request().url()).pathname;
    const data = pathName === '/api/me'
      ? { user }
      : pathName === '/api/credits'
        ? { balance: 100, creditBalance: { userId: user.id, balance: 100, updatedAt: user.createdAt } }
        : pathName === '/api/ai-providers'
          ? { defaultProvider: 'mock', providers: [{ value: 'mock', label: 'Mock provider', enabled: true, missingConfig: [] }] }
          : { templates: [] };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });
  });
  await page.route(/^https?:\/\/[^/]+\/api\/assets\/images$/u, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      data: {
        asset: {
          id: 'variant-source-asset',
          userId: user.id,
          projectId: 'variant-project',
          filename: 'fallback-scheme-variant.jpg',
          mimeType: 'image/jpeg',
          size: 1000,
          width: 1600,
          height: 900,
          storagePath: 'cases/fallback-scheme-variant.jpg',
          publicUrl: '/cases/fallback-scheme-variant.jpg',
          url: '/cases/fallback-scheme-variant.jpg',
          createdAt: user.createdAt,
          updatedAt: user.createdAt,
        },
      },
    }),
  }));
  await page.route(/^https?:\/\/[^/]+\/api\/projects\/auto$/u, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      data: {
        project: {
          id: 'variant-project',
          userId: user.id,
          name: '方案变体视觉验收',
          description: '',
          status: 'active',
          coverImageUrl: null,
          createdAt: user.createdAt,
          updatedAt: user.createdAt,
        },
      },
    }),
  }));
  await page.route(/^https?:\/\/[^/]+\/api\/projects\/variant-project\/generations$/u, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { generations: [] } }),
  }));
  let pollCount = 0;
  const createJob = (status: 'queued' | 'running' | 'succeeded') => ({
    id: 'variant-job',
    userId: user.id,
    projectId: 'variant-project',
    mode: 'design-variants',
    step: 'design_variants',
    prompt: 'variant e2e prompt',
    config: { batchCount: 4 },
    inputAssetIds: ['variant-source-asset'],
    status,
    progress: status === 'queued' ? 20 : status === 'running' ? 70 : 100,
    provider: 'mock',
    outputAssetId: status === 'succeeded' ? 'variant-result-0' : null,
    outputAssetIds: status === 'succeeded' ? ['variant-result-0', 'variant-result-1', 'variant-result-2', 'variant-result-3'] : [],
    errorMessage: null,
    createdAt: user.createdAt,
    updatedAt: user.createdAt,
    startedAt: status === 'queued' ? null : user.createdAt,
    finishedAt: status === 'succeeded' ? user.createdAt : null,
    diagnostics: { phase: status === 'queued' ? 'queued' : status === 'running' ? 'provider-request' : 'succeeded' },
    results: status === 'succeeded' ? Array.from({ length: 4 }, (_, index) => ({
      id: `variant-result-${index}`,
      userId: user.id,
      projectId: 'variant-project',
      jobId: 'variant-job',
      assetId: `variant-result-asset-${index}`,
      imageUrl: '/cases/fallback-scheme-variant.jpg',
      isSelected: index === 0,
      isFavorite: false,
      metadata: { variantIndex: index, variantName: `方案 ${String.fromCharCode(65 + index)}` },
      createdAt: user.createdAt,
      updatedAt: user.createdAt,
    })) : [],
    creditCost: 4,
    creditRefunded: false,
    failureReason: null,
    idempotencyKey: 'variant-e2e',
    attemptCount: 1,
    maxAttempts: 3,
    nextAttemptAt: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
    executionTimeoutAt: null,
    providerStartedAt: null,
    providerFinishedAt: null,
    providerDurationMs: null,
    lastErrorCode: null,
    lastErrorCategory: null,
    lastErrorRetryable: null,
  });
  await page.route(/^https?:\/\/[^/]+\/api\/generation-jobs(?:\/variant-job)?$/u, async route => {
    if (route.request().method() === 'POST') {
      pollCount = 0;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { job: createJob('queued') } }) });
    }
    pollCount += 1;
    if (pollCount === 1) await new Promise(resolve => setTimeout(resolve, 800));
    const job = createJob(pollCount < 2 ? 'running' : 'succeeded');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { job } }) });
  });
}

async function expectVariantPanels(page: Page) {
  const workspace = page.locator('.variant-workspace');
  await expect(workspace).toBeVisible();
  await expect(workspace.locator('.variant-left-panel')).toBeVisible();
  await expect(workspace.locator('.variant-center-panel')).toBeVisible();
  await expect(workspace.locator('.variant-right-panel')).toBeVisible();
  await expect(workspace.getByRole('button', { name: '查看原图' }).first()).toBeVisible();
  await expect(workspace.getByRole('button', { name: '查看结果图' }).first()).toBeVisible();
  await expect(workspace.getByRole('button', { name: '保存文件' }).first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}
