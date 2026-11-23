/**
 * The pages' handle to SQLite. In browsers it is the SQLite worker (WASM + OPFS, `browser.ts`);
 * in the desktop app it is the native engine (`desktop.ts`).
 */
import { isDesktop } from "@/lib/platform";
import { bootBrowser, browserSqlite, watchBrowserStorage } from "@/lib/sqlite/browser";
import { bootDesktop, desktopSqlite, watchDesktopChanges, type ExternalChanges } from "./desktop";
import type { SqliteWorkerApi } from "./worker";
import type { BootProgress, StorageState } from "./types";

type DataMethods = Omit<SqliteWorkerApi, "init" | "watchStorage">;

/** The SQLite API as pages use it: every call is async, whichever engine runs it. */
export type SqliteApi = {
  [K in keyof DataMethods]: (
    ...args: Parameters<DataMethods[K]>
  ) => Promise<Awaited<ReturnType<DataMethods[K]>>>;
};

export function getSqlite(): SqliteApi {
  if (typeof window === "undefined") throw new Error("SQLite runs only in the browser");
  return isDesktop() ? desktopSqlite : browserSqlite();
}

/** Boots the engine and storage, reporting each stage. Returns the SQLite version. */
export async function bootSqlite(onProgress: (p: BootProgress) => void): Promise<string> {
  if (isDesktop()) {
    onProgress({ stage: "engine", message: "Starting SQLite" });
    const version = await bootDesktop();
    onProgress({ stage: "ready", message: "Ready" });
    return version;
  }
  return bootBrowser(onProgress);
}

/** Calls `listener` whenever this window gets or loses the database files; returns the current state. */
export function watchStorage(listener: (state: StorageState) => void): Promise<StorageState> {
  // The desktop app is the only process that manages the files, so they are always here.
  if (isDesktop()) return Promise.resolve("active");
  return watchBrowserStorage(listener);
}

/**
 * Calls `listener` when something outside this app (an AI assistant over MCP) changes the
 * databases. Only the desktop app can see that; in browsers this does nothing.
 */
export function watchExternalChanges(listener: (changes: ExternalChanges) => void): () => void {
  return isDesktop() ? watchDesktopChanges(listener) : () => undefined;
}
