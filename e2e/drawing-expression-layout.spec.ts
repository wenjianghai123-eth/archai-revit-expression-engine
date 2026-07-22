import { expect, test, type Page } from '@playwright/test';

const viewports = [
  { width: 1920, height: 1080, mode: 'desktop' },
  { width: 1440, height: 900, mode: 'desktop', screenshot: 'drawing-center-1440.png' },
  { width: 1366, height: 768, mode: 'desktop' },
  { width: 1280, height: 720, mode: 'desktop', screenshot: 'drawing-center-1280.png' },
  { width: 1024, height: 768, mode: 'medium', screenshot: 'drawing-center-1024.png' },
  { width: 1152, height: 720, mode: 'medium', screenshot: 'drawing-center-1440-zoom-equivalent.png' },
  { width: 960, height: 600, mode: 'medium' },
] as const;

test('drawing expression workspace remains accessible at target widths', async ({ page }, testInfo) => {
  const user = {
    id: 'layout-test-user',
    email: 'layout-test@archai.local',
    name: 'Layout Test User',
    role: 'admin',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  await page.addInitScript(storedUser => {
    window.localStorage.setItem('auth_access_token', 'layout-test-token');
    window.localStorage.setItem('auth_user', JSON.stringify(storedUser));
  }, user);
  await page.route(/^https?:\/\/[^/]+\/api(?:\/|$)/u, route => {
    const path = new URL(route.request().url()).pathname;
    const data = path === '/api/me'
      ? { user }
      : path === '/api/credits'
        ? { balance: 100, creditBalance: { userId: user.id, balance: 100, updatedAt: user.createdAt } }
        : path === '/api/ai-providers'
          ? { defaultProvider: 'mock', providers: [{ value: 'mock', label: 'Mock provider', enabled: true, missingConfig: [] }] }
          : path === '/api/prompt-templates'
            ? { templates: [] }
            : {};
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });
  });

  await page.goto('/');
  await page.getByRole('button', { name: '开始创作' }).first().click();
  await expect(page).toHaveURL(/\/app/u);
  await page.getByRole('button', { name: /AI 生成/ }).click();
  await expect(page.locator('[data-testid="drawing-tool-navigation"]')).toBeVisible();

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await assertDrawingLayout(page, viewport.mode);
    if ('screenshot' in viewport) {
      await page.screenshot({ path: testInfo.outputPath(viewport.screenshot), fullPage: false });
    }
  }
});

async function assertDrawingLayout(page: Page, mode: 'desktop' | 'medium') {
  const settings = page.locator('[data-testid="drawing-settings-panel"]');
  const viewer = page.locator('[data-testid="drawing-viewer"]');
  const actions = page.locator('[data-testid="drawing-action-panel"]');
  const footer = actions.locator('.drawing-right-panel-footer');

  await expect(settings).toBeVisible();
  await expect(viewer).toBeVisible();
  await expect(actions).toBeVisible();
  await expect(footer.getByRole('button', { name: '生成预览' })).toBeVisible();

  const [settingsBox, viewerBox, actionBox, footerBox] = await Promise.all([
    settings.boundingBox(),
    viewer.boundingBox(),
    actions.boundingBox(),
    footer.boundingBox(),
  ]);
  expect(settingsBox).not.toBeNull();
  expect(viewerBox).not.toBeNull();
  expect(actionBox).not.toBeNull();
  expect(footerBox).not.toBeNull();
  if (!settingsBox || !viewerBox || !actionBox || !footerBox) return;

  expect(viewerBox.width).toBeGreaterThan(actionBox.width);
  expect(viewerBox.x + viewerBox.width).toBeLessThanOrEqual(actionBox.x + 1);
  expect(footerBox.y + footerBox.height).toBeLessThanOrEqual(actionBox.y + actionBox.height + 1);

  if (mode === 'desktop') {
    expect(viewerBox.width).toBeGreaterThan(settingsBox.width);
    expect(settingsBox.x + settingsBox.width).toBeLessThanOrEqual(viewerBox.x + 1);
  } else {
    expect(settingsBox.x).toBeLessThanOrEqual(viewerBox.x + 1);
    expect(settingsBox.y + settingsBox.height).toBeLessThanOrEqual(viewerBox.y + 1);
  }

  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    workspace: (() => {
      const element = document.querySelector<HTMLElement>('.drawing-workspace');
      return element ? element.scrollWidth - element.clientWidth : Number.POSITIVE_INFINITY;
    })(),
  }));
  expect(overflow.document).toBeLessThanOrEqual(1);
  expect(overflow.workspace).toBeLessThanOrEqual(1);
}
