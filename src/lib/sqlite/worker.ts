/// <reference lib="webworker" />
/**
 * Dedicated worker that owns SQLite. Databases live in OPFS through the
 * opfs-sahpool VFS; a small catalog database keeps their display names.
 *
 * The VFS holds every file exclusively, so only one window of the app can use
 * the databases at a time. Windows hand them over on a BroadcastChannel: a
 * window that can't get them claims them, and the holder closes its databases
 * and pauses the VFS. A window in the background releases them on its own.
 */
import type { Database, SAHPoolUtil, Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import * as Comlink from "comlink";
import {
  CATALOG_PATH,
  DB_FILE_PREFIX,
  DB_FILE_SUFFIX,
  STORAGE_CHANNEL,
  STORAGE_RETRIES,
  STORAGE_RETRY_MS,
  VFS_DIRECTORY,
  VFS_MIN_CAPACITY,
  VFS_NAME,
  VFS_SLOTS_PER_DB,
  SQLITE_RUNTIME_URL,
} from "@/constants";
import { SqliteSession } from "./session";
import { errorMessage } from "./errors";
import type {
  BootProgress,
  CellValue,
  DbInfo,
  DesignPreview,
  Schema,
  SqlStatement,
  StorageState,
} from "./types";

interface Engine {
  sqlite3: Sqlite3Static;
  pool: SAHPoolUtil;
  /** Reopened whenever this window takes the files back. */
  catalog: SqliteSession;
}

let engine: Promise<Engine> | null = null;
let current: { id: string; session: SqliteSession } | null = null;
/**
 * The schema designer's structure-only copy of a database (`of` null for a blank design),
 * kept while that database's structure (`base`) is unchanged.
 */
let design: { of: string | null; base: number | null; session: SqliteSession } | null = null;

/** Matches `STRUCTURE_CHANGED` in `crates/sequill-core/src/store.rs`. */
const STRUCTURE_CHANGED =
  "The database's structure changed since your design was checked (another app or an assistant changed it). Nothing was saved; review the changes and save again.";

const filePath = (id: string) => `${DB_FILE_PREFIX}${id}${DB_FILE_SUFFIX}`;
const idFromPath = (path: string) =>
  path.startsWith(DB_FILE_PREFIX) && path.endsWith(DB_FILE_SUFFIX)
    ? path.slice(DB_FILE_PREFIX.length, -DB_FILE_SUFFIX.length)
    : null;

// ---------------------------------------------------------------------------
// One call at a time, so the files are never released in the middle of a write.

let queue: Promise<unknown> = Promise.resolve();

function exclusive<T>(fn: () => Promise<T> | T): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

// ---------------------------------------------------------------------------
// Handing the files between windows.

const windowId = crypto.randomUUID();
const channel = new BroadcastChannel(STORAGE_CHANNEL);
let storage: StorageState = "active";
let onStorage: ((state: StorageState) => void) | null = null;

const TAKEN_MESSAGE =
  "Your databases are open in another window. Use them here to continue in this window.";

function setStorage(state: StorageState): void {
  storage = state;
  // The page may be gone or frozen; a lost notification must not fail the call.
  void Promise.resolve(onStorage?.(state)).catch(() => undefined);
}

function claim(): void {
  channel.postMessage({ type: "claim", from: windowId });
}

channel.addEventListener("message", ({ data }: MessageEvent<{ type?: string; from?: string }>) => {
  if (data?.type !== "claim" || data.from === windowId) return;
  void exclusive(async () => {
    await releaseFiles();
    setStorage("taken");
  });
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** True when the files are held by another window (OPFS allows one access handle per file). */
function isHeldElsewhere(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "NoModificationAllowedError" ||
      /another open Access Handle/i.test(error.message))
  );
}

/** Runs `take` until it succeeds, asking whichever window holds the files to let go. */
async function withClaims<T>(take: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await take();
    } catch (error) {
      if (!isHeldElsewhere(error) || attempt >= STORAGE_RETRIES) throw error;
      claim();
      await sleep(STORAGE_RETRY_MS);
    }
  }
}

function openCatalog(sqlite3: Sqlite3Static, pool: SAHPoolUtil): SqliteSession {
  const catalogDb: Database = new pool.OpfsSAHPoolDb(CATALOG_PATH);
  return new SqliteSession(sqlite3, catalogDb);
}

/** Closes every database and pauses the VFS, so another window can open the files. */
async function releaseFiles(): Promise<void> {
  if (!engine || storage !== "active") return;
  const e = await engine.catch(() => null);
  if (!e) return;
  closeCurrent();
  e.catalog.db.close();
  e.pool.pauseVfs();
}

/** Takes the files back after this window released them or another window took them. */
async function acquireFiles(): Promise<Engine> {
  const e = await getEngine();
  if (storage === "active") return e;
  try {
    await withClaims(() => e.pool.unpauseVfs());
  } catch (error) {
    if (!isHeldElsewhere(error)) throw error;
    setStorage("taken");
    throw new Error(TAKEN_MESSAGE, { cause: error });
  }
  e.catalog = openCatalog(e.sqlite3, e.pool);
  setStorage("active");
  return e;
}

/** The engine, ready to use: takes the files back if this window let them go on its own. */
async function ready(): Promise<Engine> {
  if (storage === "taken") throw new Error(TAKEN_MESSAGE);
  if (storage === "released") return acquireFiles();
  return getEngine();
}

// ---------------------------------------------------------------------------

async function boot(onProgress?: (p: BootProgress) => void): Promise<Engine> {
  onProgress?.({ stage: "engine", message: "Loading SQLite engine" });
  // Loaded at runtime from public/ (see scripts/copy-sqlite-wasm.ts); bundling it breaks.
  // An absolute URL: Vite's dev server tags root-relative runtime imports with `?import`
  // and then refuses to serve public/ files that way.
  const runtimeUrl = new URL(SQLITE_RUNTIME_URL, self.location.origin).href;
  const runtime: { default: () => Promise<Sqlite3Static> } = await import(
    /* @vite-ignore */ runtimeUrl
  );
  const sqlite3 = await runtime.default();
  onProgress?.({ stage: "storage", message: "Opening browser storage" });
  // `forceReinitIfPreviouslyFailed` is supported at runtime but missing from the package's types.
  // Without it a failed attempt is cached, and retrying in this window could never work.
  const options: Parameters<Sqlite3Static["installOpfsSAHPoolVfs"]>[0] & {
    forceReinitIfPreviouslyFailed: boolean;
  } = {
    name: VFS_NAME,
    directory: VFS_DIRECTORY,
    initialCapacity: VFS_MIN_CAPACITY,
    preserveOnInitFailure: true,
    forceReinitIfPreviouslyFailed: true,
  };
  let pool: SAHPoolUtil;
  try {
    pool = await withClaims(() => sqlite3.installOpfsSAHPoolVfs(options));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      isHeldElsewhere(error)
        ? "Your databases are open in another window that isn't responding. Close other " +
            `windows or tabs of this app, then try again. (${detail})`
        : "Browser storage is unavailable. Check that this browser supports the Origin " +
            `Private File System and isn't in private browsing. (${detail})`,
    );
  }
  const catalog = openCatalog(sqlite3, pool);
  catalog.query(
    `CREATE TABLE IF NOT EXISTS databases (
       id TEXT PRIMARY KEY, name TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0,
       created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  );
  reconcile(pool, catalog);
  setStorage("active");
  return { sqlite3, pool, catalog };
}

/** Keeps the catalog and the pool in sync after crashes or interrupted imports. */
function reconcile(pool: SAHPoolUtil, catalog: SqliteSession): void {
  const files = new Set(
    pool
      .getFileNames()
      .map(idFromPath)
      .filter((id): id is string => !!id),
  );
  const known = new Set(catalog.objects("SELECT id FROM databases").map((r) => String(r.id)));
  const now = Date.now();
  for (const id of files) {
    if (!known.has(id)) {
      catalog.query(
        "INSERT INTO databases (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
        [id, `Recovered ${id.slice(0, 8)}`, now, now],
      );
    }
  }
  for (const id of known) {
    if (!files.has(id)) catalog.query("DELETE FROM databases WHERE id = ?", [id]);
  }
}

function getEngine(onProgress?: (p: BootProgress) => void): Promise<Engine> {
  if (!engine) {
    engine = boot(onProgress).catch((error) => {
      engine = null;
      throw error;
    });
  }
  return engine;
}

function toInfo(row: Record<string, CellValue>): DbInfo {
  return {
    id: String(row.id),
    name: String(row.name),
    sizeBytes: Number(row.size),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    // Browsers can't edit a file where it is: every database lives in this browser's storage.
    path: null,
  };
}

async function getInfo(id: string): Promise<DbInfo> {
  const { catalog } = await getEngine();
  const row = catalog.objects("SELECT * FROM databases WHERE id = ?", [id])[0];
  if (!row) throw new Error("That database no longer exists");
  return toInfo(row);
}

async function reserveSlotForOneMore(): Promise<void> {
  const { pool } = await getEngine();
  const dbCount = pool.getFileNames().filter((n) => idFromPath(n)).length;
  await pool.reserveMinimumCapacity(
    Math.max(VFS_MIN_CAPACITY, (dbCount + 2) * VFS_SLOTS_PER_DB + 1),
  );
}

async function register(id: string, name: string, size: number): Promise<DbInfo> {
  const { catalog } = await getEngine();
  const now = Date.now();
  catalog.query(
    "INSERT INTO databases (id, name, size, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    [id, name, size, now, now],
  );
  return getInfo(id);
}

/** Opens the database if it is not the current one. Data calls name their database explicitly. */
async function session(id: string): Promise<SqliteSession> {
  if (current?.id === id) return current.session;
  const { sqlite3, pool } = await getEngine();
  await getInfo(id);
  closeCurrent();
  const db = new pool.OpfsSAHPoolDb(filePath(id));
  db.exec("PRAGMA foreign_keys = ON");
  current = { id, session: new SqliteSession(sqlite3, db) };
  return current.session;
}

function closeCurrent(): void {
  current?.session.db.close();
  current = null;
}

function dropDesignCopy(): void {
  design?.session.db.close();
  design = null;
}

/** Records the new size and modification time after a write. */
async function touch(): Promise<void> {
  if (!current) return;
  const { catalog } = await getEngine();
  catalog.query("UPDATE databases SET size = ?, updated_at = ? WHERE id = ?", [
    current.session.sizeBytes(),
    Date.now(),
    current.id,
  ]);
}

/** A data call: queued behind any other call, and run only while this window holds the files. */
function op<A extends unknown[], R>(fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return (...args) =>
    exclusive(async () => {
      await ready();
      return fn(...args);
    });
}

const api = {
  /** Boots the engine, or takes the files back if another window has them. */
  init(onProgress?: (p: BootProgress) => void): Promise<string> {
    return exclusive(async () => {
      const { sqlite3 } = engine ? await acquireFiles() : await getEngine(onProgress);
      onProgress?.({ stage: "ready", message: "Ready" });
      return sqlite3.version.libVersion;
    });
  },

  /** Calls `listener` whenever this window gets or loses the files. */
  watchStorage(listener: (state: StorageState) => void): StorageState {
    onStorage = listener;
    return storage;
  },

  /** Lets go of the files while this window is in the background. */
  release(): Promise<void> {
    return exclusive(async () => {
      if (storage !== "active") return;
      await releaseFiles();
      setStorage("released");
    });
  },

  /** Takes the files back (this window is showing again, or the user chose to use it here). */
  acquire(): Promise<void> {
    return exclusive(async () => {
      if (engine) await acquireFiles();
    });
  },

  listDatabases: op(async (): Promise<DbInfo[]> => {
    const { catalog } = await getEngine();
    return catalog.objects("SELECT * FROM databases ORDER BY updated_at DESC").map(toInfo);
  }),

  createDatabase: op(async (name: string, seedSql?: string): Promise<DbInfo> => {
    const { sqlite3, pool } = await getEngine();
    await reserveSlotForOneMore();
    const id = crypto.randomUUID();
    const db = new pool.OpfsSAHPoolDb(filePath(id));
    const session = new SqliteSession(sqlite3, db);
    try {
      if (seedSql) session.db.exec(seedSql);
      const size = session.sizeBytes();
      db.close();
      return register(id, name, size);
    } catch (error) {
      db.close();
      pool.unlink(filePath(id));
      throw error;
    }
  }),

  importDatabase: op(async (name: string, bytes: Uint8Array): Promise<DbInfo> => {
    const { pool } = await getEngine();
    await reserveSlotForOneMore();
    const id = crypto.randomUUID();
    try {
      await pool.importDb(filePath(id), bytes);
    } catch (error) {
      pool.unlink(filePath(id));
      throw new Error(
        `This file does not look like a SQLite database (${error instanceof Error ? error.message : String(error)})`,
      );
    }
    return register(id, name, bytes.byteLength);
  }),

  exportDatabase: op(async (id: string): Promise<Uint8Array> => {
    const { pool } = await getEngine();
    const bytes = pool.exportFile(filePath(id));
    return Comlink.transfer(bytes, [bytes.buffer]);
  }),

  renameDatabase: op(async (id: string, name: string): Promise<DbInfo> => {
    const { catalog } = await getEngine();
    if (!name.trim()) throw new Error("The name is empty");
    catalog.query("UPDATE databases SET name = ? WHERE id = ?", [name.trim(), id]);
    return getInfo(id);
  }),

  deleteDatabase: op(async (id: string): Promise<void> => {
    const { pool, catalog } = await getEngine();
    if (current?.id === id) closeCurrent();
    if (design?.of === id) dropDesignCopy();
    pool.unlink(filePath(id));
    catalog.query("DELETE FROM databases WHERE id = ?", [id]);
  }),

  open: op(async (id: string): Promise<{ info: DbInfo; schema: Schema }> => {
    const s = await session(id);
    return { info: await getInfo(id), schema: s.schema() };
  }),

  schema: op(async (id: string): Promise<Schema> => (await session(id)).schema()),

  count: op(async (id: string, sql: string, params: CellValue[]): Promise<number> =>
    (await session(id)).count(sql, params),
  ),

  query: op(async (id: string, sql: string, params: CellValue[] = [], limit?: number) => {
    const result = (await session(id)).query(sql, params, limit);
    if (result.changes > 0) await touch();
    return result;
  }),

  execScript: op(async (id: string, sql: string, rowLimit: number) => {
    const results = (await session(id)).execScript(sql, rowLimit);
    await touch();
    return results;
  }),

  explainScript: op(async (id: string, sql: string) => (await session(id)).explainScript(sql)),

  transaction: op(async (id: string, statements: SqlStatement[]): Promise<number> => {
    const changes = (await session(id)).transaction(statements);
    await touch();
    return changes;
  }),

  /**
   * Checks a schema design on a copy of the database's structure (no rows); the database
   * itself is untouched. A null id checks a design for a new, empty database.
   */
  previewDesign: op(async (id: string | null, statements: string[]): Promise<DesignPreview> => {
    const source = id ? await session(id) : null;
    const base = source ? source.schemaVersion() : null;
    if (!design || design.of !== id || design.base !== base) {
      dropDesignCopy();
      const { sqlite3 } = await getEngine();
      design = {
        of: id,
        base,
        session: source ? source.schemaOnlyCopy() : SqliteSession.memory(sqlite3),
      };
    }
    try {
      design.session.checkDesign(statements);
      return { base, error: null };
    } catch (error) {
      return { base, error: errorMessage(error) };
    }
  }),

  /**
   * Saves a schema design in one transaction. With `base` (from `previewDesign`), refuses
   * if the database's structure changed since the design was checked.
   */
  applyDesign: op(async (id: string, statements: string[], base?: number | null): Promise<void> => {
    const s = await session(id);
    if (base != null && s.schemaVersion() !== base) throw new Error(STRUCTURE_CHANGED);
    s.applyDesign(statements);
    await touch();
  }),

  insertMany: op(async (id: string, sql: string, rows: CellValue[][]): Promise<number> => {
    const inserted = (await session(id)).insertMany(sql, rows);
    await touch();
    return inserted;
  }),

  dump: op(async (id: string): Promise<string> => (await session(id)).dump()),
};

export type SqliteWorkerApi = typeof api;

Comlink.expose(api);
