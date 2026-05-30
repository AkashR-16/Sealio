import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,   // tests share login state; run sequentially within a file
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : 1,
  reporter: "list",
  timeout: 30_000,

  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    video: "on-first-retry",
    // All tests use the saved auth state (see auth.setup.ts)
    storageState: "e2e/.auth/user.json",
  },

  projects: [
    // 1. Login setup — runs first, saves cookies to e2e/.auth/user.json
    {
      name: "setup",
      testMatch: "**/auth.setup.ts",
      use: { storageState: undefined },
    },
    // 2. Chromium tests — depend on setup
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],

  // Start Next.js dev server before running tests
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
