// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * Chromium runs the same sources the APK is built from, through the same Vite
 * pipeline - `vite` here, `vite build` for dist/. What it does not cover is the
 * SQLite driver and the Capacitor plugins - the browser takes the localStorage
 * path instead. See tests/README.md.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.js/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : [['list']],

  use: {
    ...devices['Pixel 7'],
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    // The fixed clock freezes document.timeline, so a CSS animation would
    // never settle and every measurement would read a mid-flight transform.
    // The app already zeroes its durations under this preference.
    reducedMotion: 'reduce'
  },

  projects: [
    { name: 'light', use: { colorScheme: 'light' } },
    { name: 'dark', use: { colorScheme: 'dark' } }
  ],

  webServer: {
    command: 'npx vite',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30000
  }
});
