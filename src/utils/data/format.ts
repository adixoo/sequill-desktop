/** Display helpers for SQLite values. */
import { CELL_PREVIEW_CHARS } from "@/constants";
import type { CellValue } from "@/lib/sqlite/types";

export type ValueKind = "null" | "integer" | "real" | "text" | "blob" | "json";

export function valueKind(value: CellValue): ValueKind {
  if (value === null) return "null";
  if (typeof value === "bigint") return "integer";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "real";
  if (value instanceof Uint8Array) return "blob";
  return looksLikeJson(value) ? "json" : "text";
}

export function looksLikeJson(text: string): boolean {
  const t = text.trim();
  if (t.length < 2 || !((t[0] === "{" && t.endsWith("}")) || (t[0] === "[" && t.endsWith("]")))) {
    return false;
  }
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat("en").format(n);
}

export function formatDuration(ms: number): string {
  return ms < 1 ? "<1 ms" : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

/** Text shown in a grid cell (one line, truncated). */
export function cellPreview(value: CellValue): string {
  if (value === null) return "NULL";
  if (value instanceof Uint8Array) return `BLOB · ${formatBytes(value.byteLength)}`;
  const text = String(value);
  const oneLine = text.length > CELL_PREVIEW_CHARS ? `${text.slice(0, CELL_PREVIEW_CHARS)}…` : text;
  return oneLine.replace(/\s*\n\s*/g, " ⏎ ");
}

/** Text used when editing or copying a value. NULL becomes an empty string. */
export function valueToText(value: CellValue): string {
  if (value === null) return "";
  if (value instanceof Uint8Array)
    return `\\x${Array.from(value, (b) => b.toString(16).padStart(2, "0")).join("")}`;
  return String(value);
}

/** Image signature sniffing for BLOB previews. */
export function blobImageType(bytes: Uint8Array): string | null {
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (starts([0x52, 0x49, 0x46, 0x46]) && bytes[8] === 0x57 && bytes[9] === 0x45)
    return "image/webp";
  return null;
}

/** Declared-type affinity, following SQLite's rules (section 3.1 of datatype3). */
export function typeAffinity(declared: string): "INTEGER" | "TEXT" | "BLOB" | "REAL" | "NUMERIC" {
  const t = declared.toUpperCase();
  if (t.includes("INT")) return "INTEGER";
  if (t.includes("CHAR") || t.includes("CLOB") || t.includes("TEXT")) return "TEXT";
  if (t === "" || t.includes("BLOB")) return "BLOB";
  if (t.includes("REAL") || t.includes("FLOA") || t.includes("DOUB")) return "REAL";
  return "NUMERIC";
}

/**
 * Turns edited text into a value for a column. Numeric affinities get numbers
 * when the text is numeric; `\x…` hex becomes a BLOB.
 */
export function textToValue(text: string, declaredType: string): CellValue {
  const hex = /^\\x((?:[0-9a-fA-F]{2})*)$/.exec(text);
  if (hex) return Uint8Array.from(hex[1].match(/../g) ?? [], (h) => parseInt(h, 16));
  const affinity = typeAffinity(declaredType);
  if (affinity === "TEXT" || affinity === "BLOB") return text;
  const trimmed = text.trim();
  if (/^[+-]?\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isSafeInteger(n) ? n : BigInt(trimmed);
  }
  if (trimmed !== "" && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  return text;
}
