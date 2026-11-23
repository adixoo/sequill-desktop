/**
 * The browser build's SQLite: a worker running the WASM build on OPFS, created lazily so
 * pages that never need it stay light. The desktop app's build swaps this module for
 * `browser.desktop.ts` (see vite.config.ts), so neither the worker nor the WASM ships there.
 */
import * as Comlink from "comlink";
import type { SqliteWorkerApi } from "./worker";
import type { BootProgress, StorageState } from "./types";

let remote: Comlink.Remote<SqliteWorkerApi> | null = null;
/** Rejects if the worker script itself fails to load or crashes (Comlink calls would hang forever). */
let crashed: Promise<never> | null = null;

export function browserSqlite(): Comlink.Remote<SqliteWorkerApi> {
  if (!remote) {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
      name: "sqlite",
    });
    crashed = new Promise<never>((_, reject) => {
      worker.addEventListener("error", (e) => {
        remote = null;
        reject(new Error(`The SQLite worker failed to start${e.message ? `: ${e.message}` : ""}`));
      });
    });
    crashed.catch(() => undefined); // observed by bootBrowser; avoid unhandled-rejection noise
    remote = Comlink.wrap<SqliteWorkerApi>(worker);
  }
  return remote;
}

/** Starts the worker, its WASM and its storage, reporting each stage. Returns the SQLite version. */
export function bootBrowser(onProgress: (p: BootProgress) => void): Promise<string> {
  const api = browserSqlite();
  return Promise.race([api.init(Comlink.proxy(onProgress)), crashed!]);
}

/** Calls `listener` whenever this window gets or loses the database files (OPFS is per origin). */
export function watchBrowserStorage(
  listener: (state: StorageState) => void,
): Promise<StorageState> {
  return browserSqlite().watchStorage(Comlink.proxy(listener));
}
