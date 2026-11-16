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

interface CapiExtras {
  sqlite3_complete(sql: string): number;
  sqlite3_stmt_readonly(stmt: number): number;
}

export class SqliteSession {
  private readonly capi: CapiExtras;

  constructor(
    sqlite3: Sqlite3Static,
    readonly db: Database,
  ) {
    this.capi = sqlite3.capi as unknown as CapiExtras;
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
      });
    } finally {
      this.db.exec("PRAGMA legacy_alter_table = OFF");
      this.db.exec("PRAGMA foreign_keys = ON");
    }
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
