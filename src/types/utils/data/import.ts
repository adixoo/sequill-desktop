import type { CellValue } from "@/types/lib/sqlite/types";

export type ImportType = "INTEGER" | "REAL" | "TEXT";

export interface ImportTable {
  columns: string[];
  rows: CellValue[][];
}

/** Import text as read: CSV/TSV rows of strings, or a JSON table with its column types. */
export type ParsedImport =
  | { kind: "text"; rows: string[][] }
  | { kind: "json"; columns: string[]; rows: CellValue[][]; types: ImportType[] };
