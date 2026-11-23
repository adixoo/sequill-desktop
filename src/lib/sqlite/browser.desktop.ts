/**
 * Stands in for `browser.ts` in the desktop app's build (vite.config.ts, mode "desktop"):
 * the app runs SQLite natively, so the WASM worker isn't shipped. Never called there, because
 * `client.ts` picks the native engine whenever it runs in the desktop app.
 */
import type { browserSqlite as BrowserSqlite } from "./browser";

const unavailable = (): never => {
  throw new Error("The desktop app has no browser SQLite engine");
};

export const browserSqlite: typeof BrowserSqlite = unavailable;
export const bootBrowser = unavailable;
export const watchBrowserStorage = unavailable;
