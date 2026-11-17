/**
 * Runs SQL against one open database. Storage-agnostic, so the worker (OPFS)
 * and the tests (in-memory) share it.
 */
import type { Database, PreparedStatement, Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import { dumpDatabase } from "./dump";
import { errorMessage } from "./errors";
import { readSchema } from "./introspect";
import { splitStatements } from "./split";
import type { CellValue, QueryResult, Row, Schema, SqlStatement, StatementResult } from "./types";

/** Thrown inside a design check's transaction to undo it; never escapes. */
const UNDO = Symbol("undo design");

/**
 * Everything that makes up a database's structure, minus what SQLite makes by itself (its
 * internal tables, virtual tables' shadow tables). Tables first, so views and triggers find
 * them. Mirrors `Session::schema_only_copy` in `crates/sequill-core/src/session.rs`.
 */
const STRUCTURE_SQL = `SELECT sql FROM sqlite_schema
  WHERE sql IS NOT NULL AND substr(name, 1, 7) <> 'sqlite_'
    AND name NOT IN (SELECT name FROM pragma_table_list WHERE schema = 'main' AND type = 'shadow')
  ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 ELSE 3 END, rowid`;

interface CapiExtras {
  sqlite3_complete(sql: string): number;
  sqlite3_stmt_readonly(stmt: number): number;
}

export class SqliteSession {
  private readonly capi: CapiExtras;

  constructor(
    private readonly sqlite3: Sqlite3Static,
    readonly db: Database,
  ) {
    this.capi = sqlite3.capi as unknown as CapiExtras;
  }

  /** A new, empty in-memory database with foreign keys on, like every other session. */
  static memory(sqlite3: Sqlite3Static): SqliteSession {
    const session = new SqliteSession(sqlite3, new sqlite3.oo1.DB(":memory:"));
    session.db.exec("PRAGMA foreign_keys = ON");
    return session;
  }

  query(sql: string, params: CellValue[] = [], limit = Number.POSITIVE_INFINITY): QueryResult {
    const started = performance.now();
    const stmt = this.db.prepare(sql);
    try {
      return this.run(stmt, params, limit, started);
    } finally {
      stmt.finalize();
    }
  }

  private run(
    stmt: PreparedStatement,
    params: CellValue[],
    limit: number,
    started: number,
  ): QueryResult {
    if (params.length > 0) stmt.bind(params);
    // getColumnNames() throws for statements without result columns (DDL, plain DML).
    const columns = stmt.columnCount > 0 ? stmt.getColumnNames() : [];
    const readonly = stmt.pointer ? this.capi.sqlite3_stmt_readonly(stmt.pointer) !== 0 : true;
    const rows: Row[] = [];
    let truncated = false;
    while (stmt.step()) {
      if (rows.length >= limit) {
        truncated = true;
        break;
      }
      const row: Row = new Array(columns.length);
      for (let i = 0; i < columns.length; i++) row[i] = stmt.get(i) as CellValue;
      rows.push(row);
    }
    return {
      columns,
      rows,
      changes: readonly ? 0 : this.db.changes(),
      durationMs: performance.now() - started,
      truncated,
    };
  }

  /** SQLite's own check for whether text ends a complete statement. */
  isComplete(sql: string): boolean {
    return this.capi.sqlite3_complete(sql) !== 0;
  }

  /** Runs a multi-statement script and reports every statement. Stops at the first error. */
  execScript(script: string, rowLimit: number): StatementResult[] {
    const statements = splitStatements(script, (s) => this.isComplete(s));
    const results: StatementResult[] = [];
    for (const sql of statements) {
      const started = performance.now();
      try {
        results.push({ sql, ...this.query(sql, [], rowLimit) });
      } catch (error) {
        results.push({
          sql,
          columns: [],
          rows: [],
          changes: 0,
          durationMs: performance.now() - started,
          truncated: false,
          error: errorMessage(error),
        });
        break;
      }
    }
    return results;
  }

  /** EXPLAIN QUERY PLAN for every statement in a script. Nothing is executed. */
  explainScript(script: string): StatementResult[] {
    return splitStatements(script, (s) => this.isComplete(s)).map((sql) => {
      const started = performance.now();
      try {
        return { sql, ...this.query(`EXPLAIN QUERY PLAN ${sql}`) };
      } catch (error) {
        return {
          sql,
          columns: [],
          rows: [],
          changes: 0,
          durationMs: performance.now() - started,
          truncated: false,
          error: errorMessage(error),
        };
      }
    });
  }

  /** Runs statements atomically; returns the total number of changed rows. */
  transaction(statements: SqlStatement[]): number {
    let changes = 0;
    this.db.transaction(() => {
      for (const s of statements) changes += this.query(s.sql, s.params).changes;
    });
    return changes;
  }

  /**
   * Applies schema changes (renames, drops, table rebuilds) in one transaction
   * with foreign keys paused, as SQLite requires for rebuilds. Rolls back if
   * the result has more broken foreign-key references than before.
   */
  applyDesign(statements: string[]): void {
    this.runDesign(statements, true);
  }

  /** Runs a design exactly like `applyDesign`, then undoes it. Throws when saving would fail. */
  checkDesign(statements: string[]): void {
    this.runDesign(statements, false);
  }

  private runDesign(statements: string[], keep: boolean): void {
    this.db.exec("PRAGMA foreign_keys = OFF");
    try {
      this.db.transaction(() => {
        const before = this.foreignKeyViolations();
        for (const sql of statements) this.db.exec(sql);
        const added = this.foreignKeyViolations() - before;
        if (added > 0) {
          throw new Error(
            `Saving would leave ${added} ${added === 1 ? "row" : "rows"} pointing at missing rows (foreign keys). Nothing was changed.`,
          );
        }
        if (!keep) throw UNDO;
      });
    } catch (error) {
      if (error !== UNDO) throw error;
    } finally {
      this.db.exec("PRAGMA legacy_alter_table = OFF");
      this.db.exec("PRAGMA foreign_keys = ON");
    }
  }

  /** Counts every change to the database's structure (SQLite's schema cookie). */
  schemaVersion(): number {
    return Number(this.query("PRAGMA schema_version").rows[0]?.[0] ?? 0);
  }

  /**
   * A new in-memory database with this one's structure (tables, indexes, views, triggers)
   * and none of its rows, so it stays small however big this one is.
   */
  schemaOnlyCopy(): SqliteSession {
    let pending = this.query(STRUCTURE_SQL).rows.map((row) => String(row[0]));
    const copy = SqliteSession.memory(this.sqlite3);
    // A view can use one made after it (after a rebuild): retry until nothing more works.
    while (pending.length > 0) {
      const failed: string[] = [];
      let lastError: unknown = null;
      for (const sql of pending) {
        try {
          copy.db.exec(sql);
        } catch (error) {
          failed.push(sql);
          lastError = error;
        }
      }
      if (failed.length === pending.length) {
        copy.db.close();
        throw new Error(
          `Sequill could not copy this database's structure to check the design (${errorMessage(lastError)})`,
        );
      }
      pending = failed;
    }
    return copy;
  }

  private foreignKeyViolations(): number {
    return this.query("PRAGMA foreign_key_check").rows.length;
  }

  /** Inserts many rows with one prepared statement inside one transaction. */
  insertMany(sql: string, rows: CellValue[][]): number {
    let inserted = 0;
    this.db.transaction(() => {
      const stmt = this.db.prepare(sql);
      try {
        for (const row of rows) {
          stmt.bind(row).stepReset();
          stmt.clearBindings();
          inserted++;
        }
      } finally {
        stmt.finalize();
      }
    });
    return inserted;
  }

  objects(sql: string, params: CellValue[] = []): Record<string, CellValue>[] {
    const { columns, rows } = this.query(sql, params);
    return rows.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
  }

  schema(): Schema {
    return readSchema((sql, params) => this.objects(sql, params));
  }

  count(sql: string, params: CellValue[]): number {
    return Number(this.query(sql, params).rows[0]?.[0] ?? 0);
  }

  dump(): string {
    return dumpDatabase(
      (sql, params) => this.objects(sql, params),
      (sql, params) => this.query(sql, params).rows,
    );
  }

  sizeBytes(): number {
    const pages = Number(this.query("PRAGMA page_count").rows[0]?.[0] ?? 0);
    const pageSize = Number(this.query("PRAGMA page_size").rows[0]?.[0] ?? 0);
    return pages * pageSize;
  }
}
