/**
 * The SQLite API backed by the desktop app's native engine (Tauri commands in
 * `src-tauri/src/commands.rs`) instead of the browser worker. Same methods and
 * results as `worker.ts`, so every page works unchanged.
 */
import { invoke as tauriInvoke, type InvokeArgs, type InvokeOptions } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { SavedQuery } from "@/utils/data/saved-queries";
import type { McpActivity, McpStatus, ShowRequest } from "@/lib/mcp";
import type { SqliteApi } from "./client";
import { decodeRows, encodeCell, encodeRow, type WireCell } from "./cell-codec";
import type { DbInfo, QueryResult, StatementResult } from "./types";

/** Matches `NAME_HEADER` in `src-tauri/src/commands.rs`. */
const NAME_HEADER = "x-sequill-name";
/** Matches `EXTERNAL_CHANGE_EVENT` in `src-tauri/src/watch.rs`. */
const EXTERNAL_CHANGE_EVENT = "sequill://external-change";
/** Matches `SHOW_EVENT` in `src-tauri/src/watch.rs`. */
const SHOW_EVENT = "sequill://show";

/** What another process (an AI assistant over MCP) changed. */
export interface ExternalChanges {
  /** The list of databases (names, sizes, times) changed. */
  catalog: boolean;
  /** Id of the open database when its data or schema changed. */
  database: string | null;
}

/**
 * Calls a command. Tauri rejects with the command's error text (a string); it becomes an
 * Error here, so pages read `.message` the same way as with the browser build's worker.
 */
function invoke<T>(cmd: string, args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return tauriInvoke<T>(cmd, args, options).catch((error: unknown) => {
    throw error instanceof Error ? error : new Error(String(error));
  });
}

type Wire<T extends QueryResult> = Omit<T, "rows"> & { rows: WireCell[][] };
const decodeResult = <T extends QueryResult>(result: Wire<T>): T =>
  ({ ...result, rows: decodeRows(result.rows) }) as T;

export const desktopSqlite: SqliteApi = {
  // One process owns the files, so there is nothing to hand between windows.
  release: async () => undefined,
  acquire: async () => undefined,

  listDatabases: () => invoke("list_databases"),
  createDatabase: (name, seedSql) => invoke("create_database", { name, seedSql }),
  importDatabase: (name, bytes) =>
    invoke("import_database", bytes, { headers: { [NAME_HEADER]: encodeURIComponent(name) } }),
  exportDatabase: async (id) =>
    new Uint8Array(await invoke<ArrayBuffer>("export_database", { id })),
  renameDatabase: (id, name) => invoke("rename_database", { id, name }),
  deleteDatabase: (id) => invoke("delete_database", { id }),
  open: (id) => invoke("open_database", { id }),
  schema: (id) => invoke("schema", { id }),
  count: (id, sql, params) => invoke("count", { id, sql, params: params.map(encodeCell) }),
  query: async (id, sql, params = [], limit) =>
    decodeResult(
      await invoke<Wire<QueryResult>>("query", { id, sql, params: params.map(encodeCell), limit }),
    ),
  execScript: async (id, sql, rowLimit) =>
    (await invoke<Wire<StatementResult>[]>("exec_script", { id, sql, rowLimit })).map(decodeResult),
  explainScript: async (id, sql) =>
    (await invoke<Wire<StatementResult>[]>("explain_script", { id, sql })).map(decodeResult),
  transaction: (id, statements) =>
    invoke("transaction", {
      id,
      statements: statements.map((s) => ({ sql: s.sql, params: s.params.map(encodeCell) })),
    }),
  previewDesign: (id, statements) => invoke("preview_design", { id, statements }),
  applyDesign: (id, statements, base) => invoke("apply_design", { id, statements, base }),
  insertMany: (id, sql, rows) => invoke("insert_many", { id, sql, rows: rows.map(encodeRow) }),
  dump: (id) => invoke("dump", { id }),
};

export async function bootDesktop(): Promise<string> {
  return invoke<string>("sqlite_version");
}

/**
 * Asks for a database file with the system's file picker and opens it where it is: changes
 * are saved to that file, and no copy is made. Null when the person cancels.
 */
export function openDatabaseFile(): Promise<DbInfo | null> {
  return invoke("open_database_file");
}

/** Calls `listener` when another process changes the databases; returns a stop function. */
export function watchDesktopChanges(listener: (changes: ExternalChanges) => void): () => void {
  const stop = listen<ExternalChanges>(EXTERNAL_CHANGE_EVENT, (event) => listener(event.payload));
  return () => void stop.then((unlisten) => unlisten());
}

/** The MCP switch and how an MCP client starts this app's MCP server. */
export function mcpStatus(): Promise<McpStatus> {
  return invoke("mcp_status");
}

/** Turns MCP access on or off; returns the new status. */
export function setMcpEnabled(enabled: boolean): Promise<McpStatus> {
  return invoke("set_mcp_enabled", { enabled });
}

/** Lets assistants change things over MCP, or only read; returns the new status. */
export function setMcpAllowChanges(allowed: boolean): Promise<McpStatus> {
  return invoke("set_mcp_allow_changes", { allowed });
}

/** What assistants did over MCP, newest first. */
export function mcpActivity(limit: number): Promise<McpActivity[]> {
  return invoke("mcp_activity", { limit });
}

export function clearMcpActivity(): Promise<void> {
  return invoke("clear_mcp_activity");
}

/** How long the MCP history is kept (null: forever); returns the new status. */
export function setMcpHistoryDays(days: number | null): Promise<McpStatus> {
  return invoke("set_mcp_history_days", { days });
}

/** Saved queries, kept in the catalog on desktop so assistants can use them too. */
export const desktopSavedQueries = {
  list: () => invoke<SavedQuery[]>("list_saved_queries"),
  upsert: (query: SavedQuery) => invoke<void>("upsert_saved_query", { query }),
  remove: (id: string) => invoke<boolean>("delete_saved_query", { id }),
};

/** A schema design as the catalog keeps it; `version` goes up by one on every save. */
export interface StoredDesign {
  key: string;
  draft: unknown;
  version: number;
}

/** Unsaved schema designs, kept in the catalog on desktop so assistants can edit them too. */
export const desktopDesigns = {
  list: () => invoke<StoredDesign[]>("list_designs"),
  /** The new version, or null when an assistant saved first (then nothing is saved). */
  save: (key: string, draft: unknown, version: number) =>
    invoke<number | null>("save_design", { key, draft, version }),
};

/** Calls `listener` when an assistant asks the app to show something; returns a stop function. */
export function watchShowRequests(listener: (request: ShowRequest) => void): () => void {
  const stop = listen<ShowRequest>(SHOW_EVENT, (event) => listener(event.payload));
  return () => void stop.then((unlisten) => unlisten());
}
