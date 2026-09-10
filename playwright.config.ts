import { defineConfig, devices } from "@playwright/test";

const localChromium = process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } }
  : {};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: process.env.CI
      ? "corepack pnpm --filter @eventrail/web start"
      : "corepack pnpm --filter @eventrail/web dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], ...localChromium } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"], ...localChromium, reducedMotion: "reduce" },
    },
  ],
});
