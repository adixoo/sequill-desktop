/** Turns parsed CSV/JSON into typed columns and rows ready for INSERT. */
import type { CellValue } from "@/lib/sqlite/types";

export type ImportType = "INTEGER" | "REAL" | "TEXT";

export interface ImportTable {
  columns: string[];
  rows: CellValue[][];
}

const INT_RE = /^[+-]?\d+$/;
const REAL_RE = /^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$/;

/** Infers one type per column; empty cells do not vote. */
export function inferTypes(rows: string[][], columnCount: number): ImportType[] {
  return Array.from({ length: columnCount }, (_, c) => {
    let type: ImportType | null = null;
    for (const row of rows) {
      const cell = (row[c] ?? "").trim();
      if (cell === "") continue;
      // Leading zeros (zip codes, ids) must stay text.
      if (/^[+-]?0\d/.test(cell)) return "TEXT";
      const cellType: ImportType = INT_RE.test(cell)
        ? "INTEGER"
        : REAL_RE.test(cell)
          ? "REAL"
          : "TEXT";
      if (cellType === "TEXT") return "TEXT";
      type = type === "REAL" || cellType === "REAL" ? "REAL" : "INTEGER";
    }
    return type ?? "TEXT";
  });
}

export function coerceCell(
  text: string | undefined,
  type: ImportType,
  emptyAsNull: boolean,
): CellValue {
  if (text === undefined) return null;
  if (text.trim() === "") return emptyAsNull ? null : text;
  if (type === "INTEGER") {
    const n = Number(text.trim());
    return Number.isSafeInteger(n) ? n : BigInt(text.trim());
  }
  if (type === "REAL") return Number(text.trim());
  return text;
}

/** Header names: trimmed, non-empty and unique (case-insensitively, like SQLite). */
export function normalizeHeader(header: string[]): string[] {
  const seen = new Map<string, number>();
  return header.map((raw, i) => {
    const base = raw.trim() || `column_${i + 1}`;
    const key = base.toLowerCase();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

/** Normalises a JSON document (array of objects) into columns and rows. */
export function jsonToTable(data: unknown): ImportTable {
  if (!Array.isArray(data)) throw new Error("Expected a JSON array of objects");
  const columns: string[] = [];
  const index = new Map<string, number>();
  for (const item of data) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Every item in the array must be an object");
    }
    for (const key of Object.keys(item)) {
      if (!index.has(key)) {
        index.set(key, columns.length);
        columns.push(key);
      }
    }
  }
  const rows = data.map((item: Record<string, unknown>) => columns.map((c) => jsonValue(item[c])));
  return { columns, rows };
}

function jsonValue(value: unknown): CellValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" || typeof value === "string") return value;
  return JSON.stringify(value);
}

/** Column types for a JSON import, from the values actually present. */
export function inferJsonTypes(table: ImportTable): ImportType[] {
  return table.columns.map((_, c) => {
    let type: ImportType | null = null;
    for (const row of table.rows) {
      const v = row[c];
      if (v === null) continue;
      if (typeof v !== "number") return "TEXT";
      type = type === "REAL" || !Number.isInteger(v) ? "REAL" : "INTEGER";
    }
    return type ?? "TEXT";
  });
}
