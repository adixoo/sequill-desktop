import { defineConfig, devices } from "@playwright/test";
import { BRAVE_PATH } from "./scripts/brave.ts";

const PORT = 4173;

/**
 * End-to-end tests run against the production build (`bun run build` first),
 * served by `vite preview`, in the installed Brave browser.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: { executablePath: BRAVE_PATH },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `bunx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
