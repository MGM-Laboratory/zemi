import { defineConfig, devices } from '@playwright/test';

/**
 * Zemi end-to-end suite (e2e/). Runs against the dev servers that are already up:
 *   web  http://localhost:3300 (Next dev, compiles pages on demand, so timeouts are generous)
 *   api  http://localhost:4400 (reached through the web's /api/v1 rewrite; media and HLS go direct)
 *
 *   pnpm e2e                          everything
 *   pnpm e2e --grep-invert "@stream|@camera"   skip the slow livestream and fake camera tests
 *   pnpm e2e e2e/smoke.spec.ts        one file
 *
 * Override the targets with E2E_WEB_URL, E2E_API_URL, E2E_SUPERADMIN_PASSPHRASE, E2E_RTMP_URL.
 * No webServer block on purpose: the suite never starts or restarts servers.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // Files run in parallel on two workers; tests inside one file run in order.
  fullyParallel: false,
  workers: 2,
  retries: 1,
  forbidOnly: !!process.env.CI,
  timeout: 150_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: process.env.E2E_WEB_URL ?? 'http://localhost:3300',
    navigationTimeout: 90_000,
    actionTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    locale: 'en-GB',
    timezoneId: 'Asia/Jakarta',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // The public flows again on a phone (touch, mobile viewport): layouts, sheets and lazy chunks differ there.
      name: 'phone',
      testMatch: /(smoke|registration|contact|checkin)\.spec\.ts/,
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
  ],
});
