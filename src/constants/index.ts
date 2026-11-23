/** App-wide constants. Values used in more than one place live here. */

export const APP_NAME = "Sequill";

/** SQLite WASM runtime copied into public/ by scripts/copy-sqlite-wasm.ts. */
export const SQLITE_RUNTIME_URL = "/sqlite/index.mjs";

/**
 * OPFS SAHPool VFS settings. The directory keeps our files apart from other apps on the origin.
 * It keeps the app's earlier name on purpose: renaming it would orphan databases already saved.
 */
export const VFS_NAME = "opfs-sahpool";
export const VFS_DIRECTORY = ".pastel-sqlite";
/** Each database needs a few pool slots (db + journal + temp files). */
export const VFS_SLOTS_PER_DB = 3;
export const VFS_MIN_CAPACITY = 8;

/**
 * Windows of the app (tabs, the installed app) hand the database files to each other over
 * this BroadcastChannel. A window that can't get them asks the holder and retries; the
 * holder may be finishing a write, so allow a few seconds.
 */
export const STORAGE_CHANNEL = "sequill-storage";
export const STORAGE_RETRY_MS = 250;
export const STORAGE_RETRIES = 40;

/** Catalog database that maps file ids to display names, sizes and timestamps. */
export const CATALOG_PATH = "/__catalog.sqlite3";
export const DB_FILE_PREFIX = "/db-";
export const DB_FILE_SUFFIX = ".sqlite3";

/** Accepted extensions when opening a database file. */
export const DB_FILE_ACCEPT = ".sqlite,.sqlite3,.db,.db3,.s3db,.sl3";

/** Column alias for the rowid we select alongside table columns to identify rows. */
export const ROWID_ALIAS = "__sbe_rowid";
export const ROWID_CANDIDATES = ["rowid", "_rowid_", "oid"] as const;

/** Grid paging. */
export const PAGE_SIZES = [100, 250, 500, 1000] as const;
export const DEFAULT_PAGE_SIZE = 250;
export const ROW_HEIGHT = { compact: 30, comfortable: 40 } as const;
export const DEFAULT_COLUMN_WIDTH = 180;
export const MIN_COLUMN_WIDTH = 64;
export const MAX_COLUMN_WIDTH = 720;
export const ROW_NUMBER_WIDTH = 64;
/** Text longer than this is truncated in grid cells (full value in the inspector). */
export const CELL_PREVIEW_CHARS = 300;

/** SQLite caps bound parameters; keep batches well under the default 32766. */
export const MAX_PARAMS_PER_STATEMENT = 500;
export const IMPORT_BATCH_ROWS = 1000;
export const IMPORT_PREVIEW_ROWS = 50;

/** SQL console. */
export const QUERY_HISTORY_LIMIT = 100;
export const QUERY_RESULT_ROW_LIMIT = 10_000;

/** localStorage keys (per-viewer conveniences only). */
export const STORAGE_KEYS = {
  tableView: "sbe:table-view:",
  queryHistory: "sbe:query-history",
  savedQueries: "sbe:saved-queries",
  density: "sbe:density",
  lastDatabase: "sbe:last-db",
  /** Visualizer draft design and table positions, per database id (or "blank"). */
  visDraft: "sbe:vis-draft:",
  visLayout: "sbe:vis-layout:",
  visColors: "sbe:vis-colors:",
  visShowViews: "sbe:vis-views",
  /** Whether the schema page's tables sidebar is shown (wide screens). */
  visOutline: "sbe:vis-outline",
  /** The first-run guide was shown (it opens once, on the first start). */
  guideSeen: "sbe:guide-seen",
} as const;

/**
 * Where a schema imported from another database keeps its database type and the objects
 * SQLite can't run (enums, functions, triggers…). Hidden like SQLite's own tables. Matches
 * `OBJECTS_TABLE` in `crates/sequill-core/src/schema.rs`.
 */
export const OBJECTS_TABLE = "_sequill_objects";

/** Name prefix of the temporary table a schema design rebuilds into (see draftStatements). */
export const REBUILD_TABLE_PREFIX = "__sbe_rebuild_";

export const SQLITE_TYPES = ["INTEGER", "REAL", "TEXT", "BLOB", "NUMERIC", "ANY"] as const;
export const FK_ACTIONS = ["NO ACTION", "RESTRICT", "SET NULL", "SET DEFAULT", "CASCADE"] as const;

/** Media query for users who asked the OS for less motion. */
export const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
