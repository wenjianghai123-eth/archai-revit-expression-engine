import { expect, test } from '@playwright/test';

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

test('project generation happy path with mock provider', async ({ page }) => {
  const uniqueId = Date.now();
  const projectName = `E2E Project ${uniqueId}`;
  const projectDescription = `Playwright smoke project ${uniqueId}`;
  const prompt = `E2E mock generation prompt ${uniqueId}`;

  await page.goto('/');
  await expect(page.locator('body')).toContainText('ArchAI');

  await test.step('进入项目页', async () => {
    await page.locator('nav button').nth(1).click();
    await expect(page.locator('form')).toBeVisible();
  });

  await test.step('创建项目并进入详情', async () => {
    const form = page.locator('form').first();
    await form.locator('input').first().fill(projectName);
    await form.locator('textarea').first().fill(projectDescription);
    await form.locator('button').last().click();
    await expect(page.locator('body')).toContainText(projectName);
  });

  await test.step('进入 AI 生成工作台', async () => {
    await page.getByRole('button', { name: /AI/ }).click();
    await expect(page.locator('input[type="file"]').first()).toBeAttached();
  });

  await test.step('上传图片并创建 mock 生成任务', async () => {
    const uploadResponse = page.waitForResponse(response => (
      response.url().includes('/api/assets/images') &&
      response.request().method() === 'POST' &&
      response.status() === 201
    ));

    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'floorplan.png',
      mimeType: 'image/png',
      buffer: onePixelPng,
    });
    await uploadResponse;

    await page.locator('textarea').first().fill(prompt);

    const jobResponse = page.waitForResponse(response => (
      response.url().includes('/api/generation-jobs') &&
      response.request().method() === 'POST' &&
      response.status() === 201
    ));
    await page.locator('button.bg-slate-900').click();
    await jobResponse;

    await expect(page.locator('body')).toContainText('succeeded', { timeout: 60_000 });
  });

  await test.step('返回项目详情查看生成记录', async () => {
    await page.locator('nav button').nth(1).click();
    await expect(page.locator('body')).toContainText(projectName);
    await page.getByText(projectName).first().click();
    await expect(page.locator('body')).toContainText(prompt, { timeout: 20_000 });
  });
});
