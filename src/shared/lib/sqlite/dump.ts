/** SQL dump in the spirit of the sqlite3 shell's `.dump`. */
import type { ExecObjects } from "./introspect";
import { quoteIdent, sqlLiteral } from "./sql";
import type { CellValue, Row } from "./types";

export type ExecRows = (sql: string, params?: CellValue[]) => Row[];

const DUMP_CHUNK_ROWS = 5000;

export function insertStatements(table: string, columns: string[], rows: Row[]): string[] {
  const target = `${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")})`;
  return rows.map((row) => `INSERT INTO ${target} VALUES (${row.map(sqlLiteral).join(", ")});`);
}

export function dumpDatabase(execObjects: ExecObjects, execRows: ExecRows): string {
  const out: string[] = ["PRAGMA foreign_keys=OFF;", "BEGIN TRANSACTION;"];
  const objects = execObjects(
    `SELECT s.type, s.name, s.sql, l.type AS kind FROM sqlite_schema s
       LEFT JOIN pragma_table_list l ON l.name = s.name AND l.schema = 'main'
      WHERE s.sql IS NOT NULL ORDER BY s.rowid`,
  );

  const tables = objects.filter(
    (o) => o.type === "table" && o.kind !== "shadow" && !String(o.name).startsWith("sqlite_"),
  );
  for (const t of tables) {
    const name = String(t.name);
    out.push(`${String(t.sql)};`);
    const columns = execObjects(`SELECT name FROM pragma_table_info(?) ORDER BY cid`, [name]).map(
      (c) => String(c.name),
    );
    if (columns.length === 0) continue;
    const select = `SELECT ${columns.map(quoteIdent).join(", ")} FROM ${quoteIdent(name)} LIMIT ? OFFSET ?`;
    for (let offset = 0; ; offset += DUMP_CHUNK_ROWS) {
      const rows = execRows(select, [DUMP_CHUNK_ROWS, offset]);
      out.push(...insertStatements(name, columns, rows));
      if (rows.length < DUMP_CHUNK_ROWS) break;
    }
  }

  const hasSequence = objects.some((o) => o.name === "sqlite_sequence");
  if (hasSequence) {
    const seq = execRows(`SELECT name, seq FROM sqlite_sequence`);
    if (seq.length > 0) {
      out.push("DELETE FROM sqlite_sequence;");
      out.push(...insertStatements("sqlite_sequence", ["name", "seq"], seq));
    }
  }

  for (const type of ["index", "trigger", "view"]) {
    for (const o of objects) {
      if (o.type === type && !String(o.name).startsWith("sqlite_")) out.push(`${String(o.sql)};`);
    }
  }
  out.push("COMMIT;");
  return `${out.join("\n")}\n`;
}
