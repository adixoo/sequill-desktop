import { fileURLToPath } from "node:url";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Port of the dev server; `src-tauri/tauri.conf.json` (devUrl) points at it. */
const DEV_PORT = 5173;

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
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
});
