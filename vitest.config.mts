import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

/**
 * Unit tests: one function or module at a time. Integration tests: modules together against a
 * faked desktop backend. SQLite itself is tested in Rust and by the desktop end-to-end tests.
 * Both include stress tests (large inputs, seeded random fuzzing). End-to-end tests are
 * Playwright's (playwright.config.ts).
 */
export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: "unit", environment: "node", include: ["tests/unit/**/*.test.ts"] },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          // The drafts stress case saves a design thousands of times.
          testTimeout: 60_000,
        },
      },
    ],
  },
});
