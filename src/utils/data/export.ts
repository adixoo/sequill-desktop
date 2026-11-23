/** Serialises query results for download. */
import { insertStatements } from "@/lib/sqlite/dump";
import type { CellValue, Row } from "@/lib/sqlite/types";

export type ExportFormat = "csv" | "json" | "sql";

export const EXPORT_FORMATS: Record<
  ExportFormat,
  { label: string; extension: string; mime: string }
> = {
  csv: { label: "CSV", extension: "csv", mime: "text/csv" },
  json: { label: "JSON", extension: "json", mime: "application/json" },
  sql: { label: "SQL INSERTs", extension: "sql", mime: "application/sql" },
};

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function csvField(value: CellValue): string {
  if (value === null) return "";
  const text = value instanceof Uint8Array ? bytesToBase64(value) : String(value);
  return /[",\r\n]/.test(text) || /^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns: string[], rows: Row[]): string {
  const lines = [columns.map(csvField).join(",")];
  for (const row of rows) lines.push(row.map(csvField).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

/** JSON array of objects. BigInts become strings (JSON numbers lose precision), BLOBs base64. */
export function toJson(columns: string[], rows: Row[]): string {
  const objects = rows.map((row) =>
    Object.fromEntries(
      columns.map((c, i) => {
        const v = row[i];
        if (typeof v === "bigint") return [c, v.toString()];
        if (v instanceof Uint8Array) return [c, bytesToBase64(v)];
        return [c, v];
      }),
    ),
  );
  return `${JSON.stringify(objects, null, 2)}\n`;
}

export function toSqlInserts(table: string, columns: string[], rows: Row[]): string {
  return `${insertStatements(table, columns, rows).join("\n")}\n`;
}

export function serialize(
  format: ExportFormat,
  table: string,
  columns: string[],
  rows: Row[],
): string {
  switch (format) {
    case "csv":
      return toCsv(columns, rows);
    case "json":
      return toJson(columns, rows);
    case "sql":
      return toSqlInserts(table, columns, rows);
  }
}

export function safeFileName(name: string): string {
  return name.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "export";
}

/** Triggers a browser download of in-memory content. */
export function downloadBlob(content: BlobPart, fileName: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
