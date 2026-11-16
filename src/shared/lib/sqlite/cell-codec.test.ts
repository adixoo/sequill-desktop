import { describe, expect, test } from "bun:test";
import { base64ToBytes, decodeCell, decodeRows, encodeCell, encodeRow } from "./cell-codec";
import type { CellValue } from "./types";

describe("cell codec", () => {
  test("plain values pass through unchanged", () => {
    for (const value of [null, 0, -7, 1.5, "", "it's"] as CellValue[]) {
      expect(encodeCell(value)).toBe(value as never);
      expect(decodeCell(encodeCell(value))).toBe(value);
    }
  });

  test("values JSON can't hold are tagged like the Rust side", () => {
    expect(encodeCell(9223372036854775807n)).toEqual({ $bigint: "9223372036854775807" });
    expect(encodeCell(new Uint8Array([0xca, 0xfe]))).toEqual({ $blob: "yv4=" });
    expect(encodeCell(Number.NEGATIVE_INFINITY)).toEqual({ $real: "-Infinity" });
  });

  test("tagged values round-trip", () => {
    expect(decodeCell({ $bigint: "-9223372036854775808" })).toBe(-9223372036854775808n);
    expect(decodeCell({ $blob: "yv4=" })).toEqual(new Uint8Array([0xca, 0xfe]));
    expect(decodeCell({ $real: "Infinity" })).toBe(Number.POSITIVE_INFINITY);
    expect(base64ToBytes("")).toEqual(new Uint8Array());
  });

  test("rows encode and decode cell by cell", () => {
    const row: CellValue[] = [1, "a", null, 2n ** 60n, new Uint8Array([1, 2, 3])];
    expect(decodeRows([encodeRow(row)])).toEqual([row]);
  });
});
