/**
 * Stress: the editor's SQL on a real SQLite (WASM, in memory) with tens of thousands of rows,
 * hostile identifiers and seeded random filters, checked against plain-JS answers and against
 * SQL's own invariants (counts match rows, pages add up, complementary filters partition).
 */
import { beforeAll, describe, expect, test } from "vitest";
import {
  buildCount,
  buildInsertMany,
  buildSelect,
  quoteIdent,
  type Filter,
  type FilterOp,
  type TableQuery,
} from "@/lib/sqlite/sql";
import type { SqliteSession } from "@/lib/sqlite/session";
import type { CellValue, Row } from "@/lib/sqlite/types";
import { random, SEED } from "../../helpers/random";
import { memorySession } from "../../helpers/sqlite";

const TABLE = `orders "2026" ; DROP TABLE x; --`;
const COLUMNS = ["id", `n "quoted"`, "t [text]", "x 日本", "m;--"];
const [ID, N, T, X, M] = COLUMNS;
const ROWS = 20_000;
/** Text for LIKE filters: ASCII only (SQLite's LIKE folds only ASCII case), with % _ \ in it. */
const LIKE_ALPHABET = "abcABC%_\\ 01";

let s: SqliteSession;
let rows: Row[];

function likeText(r: ReturnType<typeof random>, max: number): string {
  return Array.from({ length: r.int(0, max) }, () => r.pick([...LIKE_ALPHABET])).join("");
}

beforeAll(async () => {
  const r = random();
  s = await memorySession(
    `CREATE TABLE ${quoteIdent(TABLE)} (${quoteIdent(ID)} INTEGER PRIMARY KEY, ${quoteIdent(N)} INTEGER, ${quoteIdent(T)} TEXT, ${quoteIdent(X)} REAL, ${quoteIdent(M)})`,
  );
  rows = Array.from({ length: ROWS }, (_, i) => [
    i + 1,
    r.chance(0.1) ? null : r.int(-500, 500),
    r.chance(0.1) ? null : likeText(r, 8),
    r.chance(0.1) ? null : Math.round((r.next() - 0.5) * 1e4) / 100,
    r.pick<CellValue>([null, r.int(0, 9), r.text(6), r.bytes(4)]),
  ]);
  expect(s.insertMany(buildInsertMany(TABLE, COLUMNS), rows)).toBe(ROWS);
});

const base = (filters: Filter[], match: "and" | "or" = "and", search = ""): TableQuery => ({
  table: TABLE,
  columns: COLUMNS,
  rowidName: null,
  filters,
  match,
  search,
  sort: [],
  limit: 1e9,
  offset: 0,
});
const count = (q: TableQuery) => {
  const c = buildCount(q);
  return s.count(c.sql, c.params);
};
const select = (q: TableQuery) => {
  const c = buildSelect(q);
  return s.query(c.sql, c.params).rows;
};
let ids = 0;
const f = (column: string, op: FilterOp, value?: string, value2?: string): Filter => ({
  id: String(++ids),
  column,
  op,
  value,
  value2,
});

/** What each integer comparison should keep, in plain JS (NULL never matches). */
const INT_OPS: [FilterOp, (n: number, a: number, b: number) => boolean][] = [
  ["eq", (n, a) => n === a],
  ["gt", (n, a) => n > a],
  ["gte", (n, a) => n >= a],
  ["lt", (n, a) => n < a],
  ["lte", (n, a) => n <= a],
  ["between", (n, a, b) => n >= a && n <= b],
];

describe(`SQLite under load (seed ${SEED})`, () => {
  test("300 random integer filters match a plain-JS count", () => {
    const r = random(SEED + 10);
    for (let i = 0; i < 300; i++) {
      const [op, keep] = r.pick(INT_OPS);
      const a = r.int(-600, 600);
      const b = a + r.int(0, 300);
      const expected = rows.filter((row) => row[1] !== null && keep(row[1] as number, a, b)).length;
      expect(count(base([f(N, op, String(a), String(b))])), `${op} ${a} ${b}`).toBe(expected);
    }
    const set = [3, -7, 250, 9999];
    const inExpected = rows.filter((row) => set.includes(row[1] as number)).length;
    expect(count(base([f(N, "in", set.join(", "))]))).toBe(inExpected);
  });

  test("300 random LIKE filters treat % _ \\ as plain text and match a plain-JS count", () => {
    const r = random(SEED + 11);
    const tests: [FilterOp, (t: string, v: string) => boolean][] = [
      ["contains", (t, v) => t.includes(v)],
      ["starts", (t, v) => t.startsWith(v)],
      ["ends", (t, v) => t.endsWith(v)],
    ];
    for (let i = 0; i < 300; i++) {
      const [op, keep] = r.pick(tests);
      const value = likeText(r, 3);
      const expected = rows.filter(
        (row) => row[2] !== null && keep((row[2] as string).toLowerCase(), value.toLowerCase()),
      ).length;
      expect(count(base([f(T, op, value)])), `${op} ${JSON.stringify(value)}`).toBe(expected);
    }
  });

  test("complementary filters split the table exactly; AND narrows and OR widens", () => {
    const r = random(SEED + 12);
    expect(count(base([f(N, "null")])) + count(base([f(N, "not_null")]))).toBe(ROWS);
    for (let i = 0; i < 100; i++) {
      const v = String(r.int(-500, 500));
      // neq keeps NULLs, so eq and neq cover every row once.
      expect(count(base([f(N, "eq", v)])) + count(base([f(N, "neq", v)]))).toBe(ROWS);
      const one = f(N, "gt", String(r.int(-500, 500)));
      const two = f(T, "contains", likeText(r, 2));
      const a = count(base([one]));
      const b = count(base([two]));
      expect(count(base([one, two], "and"))).toBeLessThanOrEqual(Math.min(a, b));
      expect(count(base([one, two], "or"))).toBeGreaterThanOrEqual(Math.max(a, b));
      expect(count(base([one, two], "or"))).toBe(a + b - count(base([one, two], "and")));
    }
  });

  test("paging through 20,000 sorted rows in pages of 997 returns every row exactly once", () => {
    for (const column of [N, T, X, M]) {
      for (const desc of [false, true]) {
        const q: TableQuery = {
          ...base([]),
          sort: [
            { column, desc },
            { column: ID, desc: false },
          ],
        };
        const all = select(q);
        expect(all).toHaveLength(ROWS);
        const paged: Row[] = [];
        for (let offset = 0; offset < ROWS; offset += 997) {
          paged.push(...select({ ...q, limit: 997, offset }));
        }
        expect(paged.map((row) => row[0])).toEqual(all.map((row) => row[0]));
      }
    }
  });

  test("search across every column agrees with its count and never errors on hostile text", () => {
    const r = random(SEED + 13);
    for (let i = 0; i < 100; i++) {
      const q = base([], "and", r.text(4));
      expect(select(q)).toHaveLength(count(q));
    }
  });

  test("a dump of 3 × 20,000 mixed rows rebuilds the same database", async () => {
    const r = random(SEED + 14);
    const db = await memorySession();
    const names = [`a "b"`, "日本 table", "x;y"];
    const data = new Map<string, Row[]>();
    for (const name of names) {
      db.query(
        `CREATE TABLE ${quoteIdent(name)} (k INTEGER PRIMARY KEY, ${quoteIdent("v ' v")}, w)`,
      );
      const table: Row[] = Array.from({ length: 20_000 }, (_, i) => [
        i + 1,
        r.pick<CellValue>([null, r.int(-1e9, 1e9), r.next() * 1e6, r.text(30), r.bytes(16)]),
        r.pick<CellValue>([BigInt("9007199254740993") + BigInt(i), r.text(5), null]),
      ]);
      db.insertMany(buildInsertMany(name, ["k", "v ' v", "w"]), table);
      data.set(name, table);
    }
    const copy = await memorySession(db.dump());
    for (const name of names) {
      const back = copy.query(`SELECT * FROM ${quoteIdent(name)} ORDER BY k`).rows;
      expect(back).toEqual(data.get(name));
    }
  });

  test("inserting 100,000 rows is all or nothing", async () => {
    const db = await memorySession("CREATE TABLE big (id INTEGER PRIMARY KEY, v TEXT NOT NULL)");
    const good = Array.from({ length: 100_000 }, (_, i) => [i + 1, `row ${i}`]);
    expect(db.insertMany("INSERT INTO big VALUES (?, ?)", good)).toBe(100_000);
    expect(db.count("SELECT count(*) FROM big", [])).toBe(100_000);

    const bad = Array.from({ length: 100_000 }, (_, i) => [200_000 + i, i === 99_999 ? null : "x"]);
    expect(() => db.insertMany("INSERT INTO big VALUES (?, ?)", bad)).toThrow();
    expect(db.count("SELECT count(*) FROM big", [])).toBe(100_000);
  });
});
