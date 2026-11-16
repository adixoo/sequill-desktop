/**
 * SQLite values as JSON for the desktop app's commands. JSON has no 64-bit integers,
 * binary or infinities, so those travel as tagged objects. The Rust side is
 * `crates/sequill-core/src/value.rs`.
 */
import { bytesToBase64 } from "@/shared/lib/data/export";
import type { CellValue, Row } from "./types";

export type WireCell =
  null | number | string | { $bigint: string } | { $blob: string } | { $real: string };

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeCell(value: CellValue): WireCell {
  if (typeof value === "bigint") return { $bigint: value.toString() };
  if (value instanceof Uint8Array) return { $blob: bytesToBase64(value) };
  if (typeof value === "number" && !Number.isFinite(value)) return { $real: String(value) };
  return value;
}

export function decodeCell(wire: WireCell): CellValue {
  if (wire === null || typeof wire !== "object") return wire;
  if ("$bigint" in wire) return BigInt(wire.$bigint);
  if ("$blob" in wire) return base64ToBytes(wire.$blob);
  return Number(wire.$real);
}

export const encodeRow = (row: Row): WireCell[] => row.map(encodeCell);
export const decodeRows = (rows: WireCell[][]): Row[] => rows.map((row) => row.map(decodeCell));
