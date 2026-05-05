import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'msedge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
  ],
  webServer: [
    {
      command: 'node e2e/clean.cjs && npx tsx server/index.ts',
      url: 'http://127.0.0.1:8787/api/health',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      env: {
        ...process.env,
        AI_PROVIDER: 'mock',
        AUTH_MODE: 'dev',
        DATA_BACKEND: 'json',
        DATA_DIR: 'e2e-data',
        FILE_STORAGE: 'local',
        UPLOADS_DIR: 'e2e-uploads',
        PORT: '8787',
        HOST: '127.0.0.1',
        CORS_ORIGIN: 'http://127.0.0.1:3000,http://localhost:3000',
        GENERATION_JOB_RATE_LIMIT_PER_MINUTE: '100',
      },
    },
    {
      command: 'npx vite --port=3000 --host=127.0.0.1',
      url: 'http://127.0.0.1:3000',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
