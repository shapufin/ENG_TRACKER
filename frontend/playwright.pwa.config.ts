import { defineConfig, devices } from "@playwright/test";

/**
 * PWA-specific Playwright config — uses the production preview server
 * instead of the Vite dev server so that service-worker offline tests
 * pass against real production artifacts.
 *
 * Usage: npx playwright test --config playwright.pwa.config.ts e2e/pwa.spec.ts
 *        npm run test:e2e:pwa
 *
 * The main playwright.config.ts keeps the dev server for authenticated
 * E2E suites (auth, calendar, offline-data, preferences) which don't
 * need production artifacts and rely on faster dev-server startup.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
    serviceWorkers: "allow",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 5"] } },
  ],
  webServer: [
    {
      command: "python ..\\manage.py runserver 127.0.0.1:8000 --noreload",
      url: "http://127.0.0.1:8000/api/schema/",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "npm run build && npm run preview -- --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
