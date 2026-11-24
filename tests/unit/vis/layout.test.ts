import { describe, expect, test } from "vitest";
import {
  edgeSides,
  nextFreePosition,
  TABLE_MAX_WIDTH,
  TABLE_WIDTH,
  tableWidth,
} from "@/features/vis/lib/layout";

const col = (name: string, type: string, notNull = false) => ({ name, type, pk: false, notNull });
const table = (columns: ReturnType<typeof col>[], name = "t", kind = "table") => ({
  name,
  kind,
  columns,
});

describe("table card width", () => {
  test("short tables keep the narrowest width", () => {
    expect(tableWidth(table([]))).toBe(TABLE_WIDTH);
    expect(tableWidth(table([col("id", "uuid")]))).toBe(TABLE_WIDTH);
  });

  test("grows for a long name and type", () => {
    const short = tableWidth(table([col("total_count", "integer")]));
    const long = tableWidth(table([col("created_at", "timestamp with time zone", true)]));
    expect(long).toBeGreaterThan(short);
    expect(long).toBeGreaterThan(TABLE_WIDTH);
  });

  test("grows for a long table name", () => {
    expect(tableWidth(table([], "a".repeat(30)))).toBeGreaterThan(TABLE_WIDTH);
  });

  test("never passes the widest size", () => {
    expect(tableWidth(table([col("x".repeat(200), "varchar(255)")]))).toBe(TABLE_MAX_WIDTH);
  });
});

describe("width-aware placement", () => {
  test("a new table goes right of the widest card's edge", () => {
    expect(nextFreePosition({ a: { x: 0, y: 10 } }, { a: 400 })).toEqual({ x: 480, y: 10 });
    expect(nextFreePosition({ a: { x: 0, y: 10 } })).toEqual({ x: TABLE_WIDTH + 80, y: 10 });
  });

  test("a wide card on the left counts as stacked until the other clears it", () => {
    const widths = { source: 400, target: TABLE_WIDTH };
    expect(edgeSides({ x: 0, y: 0 }, { x: 260, y: 0 }, false, widths)).toEqual({
      source: "R",
      target: "R",
    });
    expect(edgeSides({ x: 0, y: 0 }, { x: 400, y: 0 }, false, widths)).toEqual({
      source: "R",
      target: "L",
    });
  });
});
