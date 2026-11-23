import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import tailwind from "eslint-plugin-tailwindcss";
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
  // Tailwind classes checked against the theme in globals.css.
  tailwind.configs.recommended,
  {
    files: tailwind.configs.recommended.files,
    settings: { tailwindcss: { cssConfigPath: "./src/styles/globals.css" } },
    rules: {
      // Prettier (prettier-plugin-tailwindcss) already sorts classes.
      "tailwindcss/classnames-order": "off",
      // Its suggestions can change meaning (leading-[1.7] is not leading-1.7 in Tailwind 4);
      // enforces-canonical-classname asks the Tailwind compiler instead.
      "tailwindcss/no-unnecessary-arbitrary-value": "off",
      // The design system's classes (globals.css, vis.css) and React Flow / Sonner hooks.
      "tailwindcss/no-custom-classname": [
        "warn",
        { whitelist: ["pn-.+", "is-(active|draft|invalid)", "nodrag", "toaster"] },
      ],
    },
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
