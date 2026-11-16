import { describe, expect, test } from "bun:test";
import { normalizeSavedQueries, suggestQueryName } from "./saved-queries";

const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};

describe("normalizeSavedQueries", () => {
  test("keeps current entries and sorts newest first", () => {
    const raw = [
      { id: "a", name: "Old", sql: "SELECT 1", updatedAt: 10 },
      { id: "b", name: "New", sql: "SELECT 2", updatedAt: 20 },
    ];
    expect(normalizeSavedQueries(raw, ids()).map((q) => q.id)).toEqual(["b", "a"]);
  });

  test("gives entries from the old { name, sql } format ids, in their stored order", () => {
    const out = normalizeSavedQueries(
      [
        { name: "First", sql: "SELECT 1" },
        { name: "Second", sql: "SELECT 2" },
      ],
      ids(),
    );
    expect(out.map((q) => [q.id, q.name])).toEqual([
      ["id1", "First"],
      ["id2", "Second"],
    ]);
  });

  test("names unnamed entries from their SQL", () => {
    const [q] = normalizeSavedQueries([{ sql: "-- Top customers\nSELECT 1", name: " " }], ids());
    expect(q.name).toBe("Top customers");
  });

  test("drops entries without SQL and anything that isn't a list", () => {
    expect(normalizeSavedQueries([null, 3, { name: "x" }, { sql: "   " }], ids())).toEqual([]);
    expect(normalizeSavedQueries({ sql: "SELECT 1" }, ids())).toEqual([]);
    expect(normalizeSavedQueries(null, ids())).toEqual([]);
  });
});

describe("suggestQueryName", () => {
  test("uses a leading comment, else the first line", () => {
    expect(suggestQueryName("-- Monthly revenue\nSELECT 1")).toBe("Monthly revenue");
    expect(suggestQueryName("  SELECT * FROM orders\nWHERE 1")).toBe("SELECT * FROM orders");
  });

  test("shortens long lines and falls back when empty", () => {
    expect(suggestQueryName(`SELECT ${"x".repeat(100)}`)).toHaveLength(48);
    expect(suggestQueryName("   ")).toBe("Untitled query");
    expect(suggestQueryName("--", "Query 3")).toBe("Query 3");
  });
});
