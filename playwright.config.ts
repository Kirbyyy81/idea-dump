import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.BROWSER_TEST_PORT || 4179);

export default defineConfig({
    testDir: './tests/browser', testMatch: '**/*.spec.ts', fullyParallel: true,
    reporter: [['list']], use: { baseURL: `http://127.0.0.1:${port}`, timezoneId: 'Asia/Kuala_Lumpur', trace: 'retain-on-failure' },
    projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
        { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } }],
    webServer: { command: 'node tests/browser/server.mjs', url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 60_000 },
});
