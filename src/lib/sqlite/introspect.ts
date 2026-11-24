/** Helpers over the schema the desktop engine reads (`crates/sequill-core/src/schema.rs`). */
import type { RelationInfo, ColumnInfo } from "@/types/lib/sqlite/types";

/** Columns that a SELECT * would return (virtual-table hidden columns excluded). */
export function visibleColumns(relation: RelationInfo): ColumnInfo[] {
  return relation.columns.filter((c) => c.hidden !== 1);
}

/** Generated columns cannot be written. */
export function isWritableColumn(column: ColumnInfo): boolean {
  return column.hidden === 0;
}

const NUMBER_DEFAULT = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
const QUOTED_DEFAULT = /^'((?:[^']|'')*)'$|^"((?:[^"]|"")*)"$/;
const NOW_DEFAULT = /^(current_(timestamp|date|time)|(datetime|date|time)\(\s*'now'\s*\))$/i;

/**
 * The text a new-row form can fill in for a column's DEFAULT (`dflt_value`): a number, a
 * quoted string, a boolean, or the current date/time (UTC, as SQLite gives it). Null for no
 * default, a NULL default, or any other expression, which SQLite then fills in on insert.
 */
export function defaultValueText(dflt: string | null, now: Date): string | null {
  if (dflt === null) return null;
  let value = dflt.trim();
  // SQLite keeps the parentheses of `DEFAULT (expr)`.
  if (value.startsWith("(") && value.endsWith(")")) value = value.slice(1, -1).trim();
  if (NUMBER_DEFAULT.test(value)) return value;
  const quoted = QUOTED_DEFAULT.exec(value);
  if (quoted)
    return quoted[1] !== undefined ? quoted[1].replace(/''/g, "'") : quoted[2].replace(/""/g, '"');
  const upper = value.toUpperCase();
  if (upper === "TRUE") return "1";
  if (upper === "FALSE") return "0";
  const nowMatch = NOW_DEFAULT.exec(value);
  if (!nowMatch) return null;
  const [date, time] = now.toISOString().slice(0, 19).split("T");
  const part = (nowMatch[2] ?? nowMatch[3]).toLowerCase();
  return part === "date" ? date : part === "time" ? time : `${date} ${time}`;
}
