import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** Port of the dev server; `src-tauri/tauri.conf.json` (devUrl) points at it. */
const DEV_PORT = 5173;

const src = fileURLToPath(new URL("./src", import.meta.url));

/** The browser build's SQLite WASM (copied to public/sqlite) isn't shipped in the desktop app. */
const dropBrowserSqlite: Plugin = {
  name: "sequill:drop-browser-sqlite",
  apply: "build",
  closeBundle() {
    rmSync(fileURLToPath(new URL("./dist/sqlite", import.meta.url)), {
      recursive: true,
      force: true,
    });
  },
};

/**
 * `vite build --mode desktop` (Tauri's build, `build:desktop`) leaves out the browser build's
 * SQLite: the app runs SQLite natively, so the WASM worker and files would only add weight.
 */
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    ...(mode === "desktop" ? [dropBrowserSqlite] : []),
  ],
  resolve: {
    alias: [
      ...(mode === "desktop"
        ? [{ find: "@/lib/sqlite/browser", replacement: `${src}/lib/sqlite/browser.desktop.ts` }]
        : []),
      { find: "@", replacement: src },
    ],
  },
  // Keep Tauri's and Rust's output visible while `tauri dev` runs.
  clearScreen: false,
  server: {
    port: DEV_PORT,
    strictPort: true,
    // Rust builds write here; watching it would reload the page on every compile.
    watch: { ignored: ["**/src-tauri/**", "**/target/**", "**/crates/**"] },
  },
  preview: { port: 4173, strictPort: true },
  worker: { format: "es" },
}));
