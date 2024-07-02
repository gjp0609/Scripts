import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

export default defineConfig({
    testDir: './js/playwright/tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: {
        actionTimeout: 0,
        trace: 'on-first-retry',
        // headless: false,
        viewport: {
            height: 1080,
            width: 1920
        }
    },
    projects: [
        {
            name: 'chromium',
            use: {
                channel: 'msedge',
                ...devices['Desktop Chrome']
            }
        }
    ],
    outputDir: './js/playwright/test-results',

    timeout: 1000 * 60 * 60,
    expect: {
        timeout: 5000
    }
});
