/** INSERT statements for exporting rows as SQL. */
import { quoteIdent, sqlLiteral } from "./sql";
import type { Row } from "./types";

export function insertStatements(table: string, columns: string[], rows: Row[]): string[] {
  const target = `${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")})`;
  return rows.map((row) => `INSERT INTO ${target} VALUES (${row.map(sqlLiteral).join(", ")});`);
}
