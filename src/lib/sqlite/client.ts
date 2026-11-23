/**
 * The pages' handle to SQLite. In browsers it is the SQLite worker (WASM + OPFS), created
 * lazily so pages that never need it stay light; in the desktop app it is the native engine.
 */
import * as Comlink from "comlink";
import { isDesktop } from "@/lib/platform";
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

let remote: Comlink.Remote<SqliteWorkerApi> | null = null;
/** Rejects if the worker script itself fails to load or crashes (Comlink calls would hang forever). */
let crashed: Promise<never> | null = null;

function getWorker(): Comlink.Remote<SqliteWorkerApi> {
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
    crashed.catch(() => undefined); // observed by bootSqlite; avoid unhandled-rejection noise
    remote = Comlink.wrap<SqliteWorkerApi>(worker);
  }
  return remote;
}

export function getSqlite(): SqliteApi {
  if (typeof window === "undefined") throw new Error("SQLite runs only in the browser");
  return isDesktop() ? desktopSqlite : getWorker();
}

/** Boots the engine and storage, reporting each stage. Returns the SQLite version. */
export async function bootSqlite(onProgress: (p: BootProgress) => void): Promise<string> {
  if (isDesktop()) {
    onProgress({ stage: "engine", message: "Starting SQLite" });
    const version = await bootDesktop();
    onProgress({ stage: "ready", message: "Ready" });
    return version;
  }
  const api = getWorker();
  return Promise.race([api.init(Comlink.proxy(onProgress)), crashed!]);
}

/** Calls `listener` whenever this window gets or loses the database files; returns the current state. */
export function watchStorage(listener: (state: StorageState) => void): Promise<StorageState> {
  // The desktop app is the only process that manages the files, so they are always here.
  if (isDesktop()) return Promise.resolve("active");
  return getWorker().watchStorage(Comlink.proxy(listener));
}

/**
 * Calls `listener` when something outside this app (an AI assistant over MCP) changes the
 * databases. Only the desktop app can see that; in browsers this does nothing.
 */
export function watchExternalChanges(listener: (changes: ExternalChanges) => void): () => void {
  return isDesktop() ? watchDesktopChanges(listener) : () => undefined;
}
