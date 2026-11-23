import { defineConfig, devices } from "@playwright/test";
import { BRAVE_PATH } from "./scripts/brave.ts";

const PORT = 4173;

/**
 * End-to-end tests (tests/e2e), two projects:
 * - browser: the browser build (`bun run build` first), served by `vite preview`, in the
 *   installed Brave browser.
 * - desktop: the real desktop app (`bun run desktop:build:debug` first), driven through its
 *   WebView2 (Windows only); see tests/e2e/desktop/app.ts.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
  projects: [
    {
      name: "browser",
      testDir: "./tests/e2e/browser",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        baseURL: `http://localhost:${PORT}`,
        launchOptions: { executablePath: BRAVE_PATH },
        // Tests start past the first-run guide; the guide's own test clears this.
        storageState: {
          cookies: [],
          origins: [
            {
              origin: `http://localhost:${PORT}`,
              localStorage: [{ name: "sbe:guide-seen", value: "true" }],
            },
          ],
        },
      },
    },
    {
      name: "desktop",
      testDir: "./tests/e2e/desktop",
      // Each test starts its own app; two at a time keeps the machine responsive.
      workers: 2,
    },
  ],
  webServer: {
    command: `bunx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
