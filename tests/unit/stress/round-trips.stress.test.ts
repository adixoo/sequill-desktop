/**
 * Stress: data that leaves the app and comes back (clipboard TSV, CSV export, the desktop
 * wire format, import type inference) at scale, with seeded random nasty text.
 */
import Papa from "papaparse";
import { describe, expect, test } from "vitest";
import { decodeCell, encodeCell } from "@/lib/sqlite/cell-codec";
import type { CellValue } from "@/types/lib/sqlite/types";
import { toCsv } from "@/utils/data/export";
import { valueToText } from "@/utils/data/format";
import { parseTsv, toTsv } from "@/utils/data/grid";
import { coerceCell, inferTypes } from "@/utils/data/import";
import { random, SEED } from "../../helpers/random";

function randomCell(r: ReturnType<typeof random>): CellValue {
  switch (r.int(0, 5)) {
    case 0:
      return null;
    case 1:
      return r.int(-1e9, 1e9);
    case 2:
      return (r.next() - 0.5) * 1e6;
    case 3:
      return BigInt(Number.MAX_SAFE_INTEGER) + BigInt(r.int(1, 1e9));
    case 4:
      return r.bytes(24);
    default:
      return r.text(40);
  }
}

describe(`round trips (seed ${SEED})`, () => {
  test("5,000 rows of hostile text survive the clipboard (TSV) unchanged", () => {
    const r = random();
    const rows = Array.from({ length: 5_000 }, () =>
      Array.from({ length: 8 }, () => randomCell(r)),
    );
    const parsed = parseTsv(toTsv(rows));
    expect(parsed).toHaveLength(rows.length);
    expect(parsed).toEqual(rows.map((row) => row.map(valueToText)));
  });

  test("20,000 rows exported as CSV read back the same with a standard parser", () => {
    const r = random(SEED + 1);
    const columns = Array.from({ length: 6 }, (_, i) => `col ${i} ${r.text(6)}`);
    const rows = Array.from({ length: 20_000 }, () => columns.map(() => r.text(60)));
    const parsed = Papa.parse<string[]>(toCsv(columns, rows), { skipEmptyLines: false });
    expect(parsed.errors).toEqual([]);
    // The CSV ends with a line break, which the parser reads as one empty last row.
    expect(parsed.data.slice(0, -1)).toEqual([columns, ...rows]);
  });

  test("50,000 values cross the desktop wire format (JSON) unchanged", () => {
    const r = random(SEED + 2);
    const values = Array.from({ length: 50_000 }, () => randomCell(r));
    values.push(Infinity, -Infinity, BigInt("-9223372036854775808"), new Uint8Array(0), "");
    const wire = JSON.parse(JSON.stringify(values.map(encodeCell)));
    expect(wire.map(decodeCell)).toEqual(values);
  });

  test("type inference over 100,000 rows: one odd cell decides, leading zeros stay text", () => {
    const r = random(SEED + 3);
    const ints = Array.from({ length: 100_000 }, () => [String(r.int(-1e6, 1e6)), ""]);
    expect(inferTypes(ints, 2)).toEqual(["INTEGER", "TEXT"]);
    const withReal = [...ints, ["2.5", ""]];
    expect(inferTypes(withReal, 2)[0]).toBe("REAL");
    const withZip = [...ints, ["00501", ""]];
    expect(inferTypes(withZip, 2)[0]).toBe("TEXT");
    const huge = "123456789012345678901234567890";
    expect(coerceCell(huge, "INTEGER", true)).toBe(BigInt(huge));
  });
});
