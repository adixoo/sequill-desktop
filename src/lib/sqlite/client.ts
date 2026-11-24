/** The pages' handle to SQLite: the desktop app's native engine (`desktop.ts`). */
import { isDesktop } from "@/lib/platform";
import { bootDesktop, desktopSqlite, watchDesktopChanges } from "./desktop";
import type { ExternalChanges } from "@/types/lib/sqlite/desktop";
import type { BootProgress } from "@/types/lib/sqlite/types";
import type { SqliteApi } from "@/types/lib/sqlite/client";

export function getSqlite(): SqliteApi {
  if (!isDesktop()) throw new Error("Sequill runs only in its desktop app");
  return desktopSqlite;
}

/** Starts the engine, reporting each stage. Returns the SQLite version. */
export async function bootSqlite(onProgress: (p: BootProgress) => void): Promise<string> {
  getSqlite();
  onProgress({ stage: "engine", message: "Starting SQLite" });
  const version = await bootDesktop();
  onProgress({ stage: "ready", message: "Ready" });
  return version;
}

/**
 * Calls `listener` when something outside this app (an AI assistant over MCP) changes the
 * databases. Does nothing outside the desktop app (the component gallery in a browser).
 */
export function watchExternalChanges(listener: (changes: ExternalChanges) => void): () => void {
  return isDesktop() ? watchDesktopChanges(listener) : () => undefined;
}
