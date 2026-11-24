/** Pure helpers behind the data grid: column layout and clipboard text. */
import { DEFAULT_COLUMN_WIDTH, MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH, ROWID_ALIAS } from "@/constants";
import type { ColumnLayout } from "@/store/workspace";
import type { CellValue, QueryResult, Row } from "@/lib/sqlite/types";
import { typeAffinity, valueToText } from "./format";

export interface LaidOutColumn {
  name: string;
  /** Index into the row arrays. */
  index: number;
  width: number;
  pinned: boolean;
  /** Sticky left offset for pinned columns (excluding the row-number column). */
  left: number;
}

export function defaultWidth(declaredType: string): number {
  switch (typeAffinity(declaredType)) {
    case "INTEGER":
      return 128;
    case "REAL":
    case "NUMERIC":
      return 132;
    default:
      return DEFAULT_COLUMN_WIDTH;
  }
}

export function clampWidth(width: number): number {
  return Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width)));
}

/**
 * A table query's rows in the order of `columns`, matched by name, with the rowid split off as
 * keys. Rows on screen can be from before the table changed (a column added, dropped or moved
 * by another app or an assistant): a column the result lacks is empty until fresh rows arrive,
 * and no value ever shows under another column's name.
 */
export function alignRows(
  result: Pick<QueryResult, "columns" | "rows">,
  columns: string[],
): { rows: Row[]; keys: CellValue[] } {
  const hasRowid = result.columns[0] === ROWID_ALIAS;
  const at = new Map(result.columns.map((name, i) => [name, i]));
  const picks = columns.map((name) => at.get(name));
  return {
    rows: result.rows.map((row) => picks.map((i) => (i === undefined ? null : (row[i] ?? null)))),
    keys: hasRowid ? result.rows.map((row) => row[0]) : [],
  };
}

/** Applies saved order, visibility, pinning and widths to the current columns. */
export function layoutColumns(
  columns: { name: string; type: string }[],
  layout: ColumnLayout,
): LaidOutColumn[] {
  const byName = new Map(columns.map((c, index) => [c.name, { ...c, index }]));
  const ordered = [
    ...layout.order.filter((n) => byName.has(n)),
    ...columns.map((c) => c.name).filter((n) => !layout.order.includes(n)),
  ];
  const hidden = new Set(layout.hidden);
  const pinned = new Set(layout.pinned);
  const visible = ordered.filter((n) => !hidden.has(n));
  const sorted = [
    ...visible.filter((n) => pinned.has(n)),
    ...visible.filter((n) => !pinned.has(n)),
  ];
  let left = 0;
  return sorted.map((name) => {
    const col = byName.get(name)!;
    const width = clampWidth(layout.widths[name] ?? defaultWidth(col.type));
    const item = { name, index: col.index, width, pinned: pinned.has(name), left };
    if (item.pinned) left += width;
    return item;
  });
}

/** Moves `from` to the position of `to` within the full column order. */
export function reorder(order: string[], from: string, to: string): string[] {
  const next = order.filter((n) => n !== from);
  const target = next.indexOf(to);
  next.splice(target === -1 ? next.length : target, 0, from);
  return next;
}

/** `list` with the item at index `from` moved to index `to`. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = list.slice();
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

function tsvField(value: CellValue): string {
  const text = valueToText(value);
  return /[\t\n\r"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toTsv(rows: CellValue[][], header?: string[]): string {
  const lines = rows.map((r) => r.map(tsvField).join("\t"));
  return (header ? [header.join("\t"), ...lines] : lines).join("\n");
}

/** Parses clipboard text (TSV as produced by spreadsheets) into a matrix of strings. */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  // Line breaks end rows (\n, \r\n or \r); inside a quoted cell they are kept as they are.
  const input = text.replace(/(\r\n|\n|\r)$/, "");
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === "\t") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  rows.push(row);
  return rows;
}
