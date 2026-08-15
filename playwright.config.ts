import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 4,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    locale: 'zh-CN',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1',
    port: 4173,
    reuseExistingServer: true,
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /mobile-web\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'edge',
      testIgnore: /(?:release-visual|accessibility|mobile-web)\.spec\.ts/,
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
    {
      name: 'firefox',
      testIgnore: /(?:release-visual|accessibility|mobile-web)\.spec\.ts/,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testIgnore: /(?:release-visual|accessibility|mobile-web)\.spec\.ts/,
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'android-chrome',
      testMatch: /mobile-web\.spec\.ts/,
      use: { ...devices['Pixel 5'], viewport: { width: 780, height: 360 } },
    },
    {
      name: 'mobile-safari',
      testMatch: /mobile-web\.spec\.ts/,
      use: { ...devices['iPhone 13'], viewport: { width: 780, height: 360 } },
    },
  ],
});
