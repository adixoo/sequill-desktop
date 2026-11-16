import { expect, test } from "bun:test";
import { SAMPLE_DB_SQL } from "./sample";
import { memorySession } from "./test-utils";

test("sample database seeds every object type", async () => {
  const s = await memorySession(SAMPLE_DB_SQL);
  const schema = s.schema();
  expect(schema.tables.map((t) => t.name)).toEqual([
    "customers",
    "order_items",
    "orders",
    "products",
    "sqlite_sequence",
  ]);
  expect(schema.views.map((v) => v.name)).toEqual(["order_totals"]);
  expect(schema.indexes.length).toBeGreaterThanOrEqual(2);
  expect(schema.triggers).toHaveLength(1);
  expect(s.count("SELECT count(*) FROM customers", [])).toBe(60);
  expect(s.count("SELECT count(*) FROM products", [])).toBe(40);
  expect(s.count("SELECT count(*) FROM orders", [])).toBe(150);
  expect(s.count("SELECT count(*) FROM order_items", [])).toBeGreaterThan(150);
  expect(s.count("SELECT count(*) FROM order_totals", [])).toBe(150);
  expect(s.query("PRAGMA foreign_key_check").rows).toEqual([]);
});
