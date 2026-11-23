import { describe, expect, test } from "vitest";
import { errorMessage } from "@/lib/sqlite/errors";

describe("errorMessage", () => {
  test("drops SQLite's result-code prefix", () => {
    expect(errorMessage(new Error("SQLITE_CONSTRAINT_UNIQUE: sqlite3 result code 2067: x"))).toBe(
      "x",
    );
  });

  test("names the table, not the temporary copy a design rebuilds into", () => {
    expect(errorMessage(new Error("UNIQUE constraint failed: __sbe_rebuild_customers.city"))).toBe(
      "UNIQUE constraint failed: customers.city",
    );
  });
});
