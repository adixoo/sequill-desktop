import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

/**
 * Unit tests: one function or module at a time, no SQLite. Integration tests: modules
 * together on a real SQLite (the WASM build, in memory) or with a faked desktop backend.
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
          // Stress cases build databases with 100k rows.
          testTimeout: 60_000,
        },
      },
    ],
  },
});
