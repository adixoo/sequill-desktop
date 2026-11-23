import { describe, expect, test } from "vitest";
import { ROWID_ALIAS } from "@/constants";
import {
  buildCount,
  buildDelete,
  buildDeleteWhere,
  buildInsert,
  buildSelect,
  buildUpdate,
  buildWhere,
  coerceFilterValue,
  quoteIdent,
  sqlLiteral,
  type TableQuery,
} from "@/lib/sqlite/sql";
import { memorySession } from "../../helpers/sqlite";

const base: TableQuery = {
  table: "people",
  columns: ["id", "name", "age"],
  rowidName: "rowid",
  filters: [],
  match: "and",
  search: "",
  sort: [],
  limit: 10,
  offset: 0,
};

describe("quoteIdent / sqlLiteral", () => {
  test("doubles embedded quotes", () => {
    expect(quoteIdent('we"ird name')).toBe('"we""ird name"');
    expect(sqlLiteral("it's")).toBe("'it''s'");
  });

  test("renders every value type", () => {
    expect(sqlLiteral(null)).toBe("NULL");
    expect(sqlLiteral(12.5)).toBe("12.5");
    expect(sqlLiteral(9007199254740993n)).toBe("9007199254740993");
    expect(sqlLiteral(new Uint8Array([0, 255]))).toBe("X'00ff'");
    expect(sqlLiteral(Number.NaN)).toBe("NULL");
  });
});

describe("coerceFilterValue", () => {
  test("numbers become numbers, text stays text", () => {
    expect(coerceFilterValue("42")).toBe(42);
    expect(coerceFilterValue("-1.5e3")).toBe(-1500);
    expect(coerceFilterValue("12abc")).toBe("12abc");
    expect(coerceFilterValue("")).toBe("");
    expect(coerceFilterValue("9007199254740993")).toBe(9007199254740993n);
  });
});

describe("buildWhere", () => {
  test("is empty without filters or search", () => {
    expect(buildWhere(base)).toEqual({ sql: "", params: [] });
  });

  test("binds every value as a parameter", () => {
    const where = buildWhere({
      ...base,
      filters: [
        { id: "1", column: "name", op: "contains", value: "50%_off" },
        { id: "2", column: "age", op: "between", value: "18", value2: "30" },
        { id: "3", column: "id", op: "in", value: "1, 2,,3" },
      ],
    });
    expect(where.sql).toBe(
      ` WHERE ("name" LIKE ? ESCAPE '\\' AND "age" BETWEEN ? AND ? AND "id" IN (?, ?, ?))`,
    );
    expect(where.params).toEqual(["%50\\%\\_off%", 18, 30, 1, 2, 3]);
  });

  test("combines with OR and adds search across columns", () => {
    const where = buildWhere({
      ...base,
      match: "or",
      filters: [
        { id: "1", column: "age", op: "null" },
        { id: "2", column: "age", op: "gt", value: "60" },
      ],
      search: "ann",
    });
    expect(where.sql).toContain(`("age" IS NULL OR "age" > ?)`);
    expect(where.sql).toContain(`CAST("name" AS TEXT) LIKE ?`);
    expect(where.params).toEqual([60, "%ann%", "%ann%", "%ann%"]);
  });

  test("rejects unknown columns (identifier injection)", () => {
    expect(() =>
      buildWhere({
        ...base,
        filters: [{ id: "1", column: 'name"; DROP TABLE x; --', op: "null" }],
      }),
    ).toThrow("Unknown column");
  });
});

describe("statements against a real database", () => {
  const schema = `
    CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT, age INTEGER);
    INSERT INTO people (name, age) VALUES ('Ann', 31), ('Bob', NULL), ('Cleo', 72), ('dan', 18);
    CREATE TABLE tags (a TEXT, b TEXT, note TEXT, PRIMARY KEY (a, b)) WITHOUT ROWID;
    INSERT INTO tags VALUES ('x', '1', 'one'), ('x', '2', 'two');`;

  test("select, sort, page and count", async () => {
    const s = await memorySession(schema);
    const select = buildSelect({ ...base, sort: [{ column: "age", desc: true }], limit: 2 });
    const result = s.query(select.sql, select.params);
    expect(result.columns[0]).toBe(ROWID_ALIAS);
    expect(result.rows.map((r) => r[2])).toEqual(["Cleo", "Ann"]);

    const count = buildCount({ ...base, filters: [{ id: "1", column: "age", op: "not_null" }] });
    expect(s.count(count.sql, count.params)).toBe(3);
  });

  test("neq keeps NULLs, search is case-insensitive", async () => {
    const s = await memorySession(schema);
    const neq = buildCount({
      ...base,
      filters: [{ id: "1", column: "age", op: "neq", value: "31" }],
    });
    expect(s.count(neq.sql, neq.params)).toBe(3);
    const search = buildCount({ ...base, search: "DAN" });
    expect(s.count(search.sql, search.params)).toBe(1);
  });

  test("update and delete by rowid and by primary key", async () => {
    const s = await memorySession(schema);
    const update = buildUpdate("people", [{ column: "age", value: 40 }], {
      kind: "rowid",
      name: "rowid",
      value: 1,
    });
    s.transaction([update]);
    expect(s.query("SELECT age FROM people WHERE id = 1").rows[0][0]).toBe(40);

    const pkKey = {
      kind: "pk" as const,
      values: [
        { column: "a", value: "x" },
        { column: "b", value: "2" },
      ],
    };
    s.transaction([buildUpdate("tags", [{ column: "note", value: "TWO" }], pkKey)]);
    expect(s.query("SELECT note FROM tags WHERE b = '2'").rows[0][0]).toBe("TWO");

    const changes = s.transaction(
      buildDelete("people", [
        { kind: "rowid", name: "rowid", value: 1 },
        { kind: "rowid", name: "rowid", value: 2 },
      ]).concat(buildDelete("tags", [pkKey])),
    );
    expect(changes).toBe(3);
  });

  test("delete everything matching the filters", async () => {
    const s = await memorySession(schema);
    const del = buildDeleteWhere({
      ...base,
      filters: [{ id: "1", column: "age", op: "gte", value: "30" }],
    });
    expect(s.transaction([del])).toBe(2);
    expect(s.count("SELECT count(*) FROM people", [])).toBe(2);
  });

  test("insert with values and with defaults", async () => {
    const s = await memorySession(schema);
    s.transaction([
      buildInsert("people", [{ column: "name", value: "Eve" }]),
      buildInsert("people", []),
    ]);
    expect(s.count("SELECT count(*) FROM people", [])).toBe(6);
  });
});
