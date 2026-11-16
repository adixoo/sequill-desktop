import { describe, expect, test } from "bun:test";
import { MAX_COLUMN_WIDTH } from "@/shared/lib/constants";
import { layoutColumns, parseTsv, reorder, toTsv } from "./grid";

const cols = [
  { name: "id", type: "INTEGER" },
  { name: "name", type: "TEXT" },
  { name: "price", type: "REAL" },
  { name: "notes", type: "" },
];

describe("layoutColumns", () => {
  test("defaults keep schema order", () => {
    const out = layoutColumns(cols, { hidden: [], order: [], widths: {}, pinned: [] });
    expect(out.map((c) => c.name)).toEqual(["id", "name", "price", "notes"]);
    expect(out[0].width).toBe(128);
  });

  test("applies order, hiding, pinning and clamped widths", () => {
    const out = layoutColumns(cols, {
      hidden: ["notes"],
      order: ["price", "gone", "name"],
      widths: { name: 99999 },
      pinned: ["name"],
    });
    expect(out.map((c) => [c.name, c.index, c.pinned])).toEqual([
      ["name", 1, true],
      ["price", 2, false],
      ["id", 0, false],
    ]);
    expect(out[0].width).toBe(MAX_COLUMN_WIDTH);
    expect(out[1].left).toBe(MAX_COLUMN_WIDTH);
  });
});

test("reorder moves a column before its drop target", () => {
  expect(reorder(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
  expect(reorder(["a", "b"], "a", "zz")).toEqual(["b", "a"]);
});

describe("TSV", () => {
  test("round-trips tabs, newlines and quotes", () => {
    const rows = [
      ["a\tb", 'say "x"', null],
      [1, "line\nbreak", 2.5],
    ];
    expect(parseTsv(toTsv(rows))).toEqual([
      ["a\tb", 'say "x"', ""],
      ["1", "line\nbreak", "2.5"],
    ]);
  });

  test("handles spreadsheet line endings and a trailing newline", () => {
    expect(parseTsv("1\t2\r\n3\t4\r\n")).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });
});
