import { describe, expect, test } from "vitest";
import { defaultValueText } from "@/lib/sqlite/introspect";

// 2026-03-05 04:07:09 UTC; SQLite's 'now' is UTC.
const NOW = new Date(Date.UTC(2026, 2, 5, 4, 7, 9));
const text = (dflt: string | null) => defaultValueText(dflt, NOW);

describe("defaultValueText", () => {
  test("no default, or a NULL default, fills nothing", () => {
    expect(text(null)).toBeNull();
    expect(text("NULL")).toBeNull();
    expect(text("null")).toBeNull();
  });

  test("numbers and booleans", () => {
    expect(text("0")).toBe("0");
    expect(text("-12.5")).toBe("-12.5");
    expect(text("+3")).toBe("+3");
    expect(text("1e3")).toBe("1e3");
    expect(text("(42)")).toBe("42");
    expect(text("TRUE")).toBe("1");
    expect(text("false")).toBe("0");
  });

  test("quoted strings, with doubled quotes undone", () => {
    expect(text("'active'")).toBe("active");
    expect(text("'it''s'")).toBe("it's");
    expect(text("''")).toBe("");
    expect(text('"draft"')).toBe("draft");
  });

  test("the current date and time, as SQLite gives them", () => {
    expect(text("CURRENT_TIMESTAMP")).toBe("2026-03-05 04:07:09");
    expect(text("current_date")).toBe("2026-03-05");
    expect(text("CURRENT_TIME")).toBe("04:07:09");
    expect(text("date('now')")).toBe("2026-03-05");
    expect(text("(datetime( 'now' ))")).toBe("2026-03-05 04:07:09");
    expect(text("time('now')")).toBe("04:07:09");
  });

  test("other expressions are left for SQLite to fill", () => {
    expect(text("date('now', '+1 day')")).toBeNull();
    expect(text("random()")).toBeNull();
    expect(text("(1 + 2)")).toBeNull();
    expect(text("'a' || 'b'")).toBeNull();
    expect(text("X'00ff'")).toBeNull();
  });
});
