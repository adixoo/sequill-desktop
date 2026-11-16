import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Rules of Hooks plus the React Compiler's checks.
  reactHooks.configs.flat.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  // Must stay last: turns off stylistic rules that Prettier owns.
  prettier,
  globalIgnores([
    "dist/**",
    // Rust/Tauri build output and generated schemas
    "target/**",
    "src-tauri/gen/**",
    "public/sqlite/**",
    "playwright-report/**",
    "test-results/**",
    // Third-party agent skills and their working files are not app code.
    ".claude/skills/**",
    ".taste-skill/**",
  ]),
]);
