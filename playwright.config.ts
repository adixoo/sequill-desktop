import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests (tests/e2e) run against the real desktop app (`bun run desktop:build:debug`
 * first), driven through its WebView2 (Windows only); see tests/e2e/desktop/app.ts.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  retries: process.env.CI ? 1 : 0,
  // Each test starts its own app (a debug build); one at a time keeps the stress test's
  // timings honest.
  workers: 1,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
});
