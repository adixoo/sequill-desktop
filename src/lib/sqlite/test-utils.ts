/** Test helpers: SQLite sessions and database files (Node build of sqlite-wasm, no OPFS). */
import init, { type Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import { SqliteSession } from "./session";

let sqlite3: Promise<Sqlite3Static> | null = null;

export async function memorySession(sql?: string): Promise<SqliteSession> {
  sqlite3 ??= init();
  const s = await sqlite3;
  const session = new SqliteSession(s, new s.oo1.DB(":memory:"));
  if (sql) session.db.exec(sql);
  return session;
}

let files = 0;

/**
 * Builds a database and returns its file. File-backed (in the engine's own
 * in-memory file system) because only the pager stamps the header's version
 * fields; a ":memory:" database leaves them zero.
 */
export async function databaseFile(sql: string): Promise<Blob> {
  sqlite3 ??= init();
  const s = await sqlite3;
  const db = new s.oo1.DB({ filename: `/test-${++files}.db`, flags: "c", vfs: "unix-none" });
  try {
    db.exec(sql);
    return new Blob([new Uint8Array(s.capi.sqlite3_js_db_export(db))]);
  } finally {
    db.close();
  }
}
