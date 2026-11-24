import { describe, expect, test } from "vitest";
import { DATA_TYPES, matchDataType } from "@/constants/data-types";

const pg = DATA_TYPES.postgresql;

describe("matchDataType", () => {
  test("finds a type by name or alias, in any case and spacing", () => {
    expect(matchDataType(pg, "timestamptz")).toMatchObject({
      type: { name: "timestamptz" },
      exact: true,
    });
    expect(matchDataType(pg, "TIMESTAMP  WITH TIME ZONE")).toMatchObject({
      type: { name: "timestamptz", kind: "date" },
      exact: true,
    });
    expect(matchDataType(pg, "int4")?.type.name).toBe("integer");
  });

  test("matches another length or precision loosely", () => {
    expect(matchDataType(pg, "varchar(100)")).toMatchObject({
      type: { name: "varchar(255)", kind: "text" },
      exact: false,
    });
    expect(matchDataType(pg, "numeric(12, 4)")?.exact).toBe(false);
  });

  test("returns nothing for unknown or empty types", () => {
    expect(matchDataType(pg, "point")).toBeUndefined();
    expect(matchDataType(pg, "")).toBeUndefined();
  });

  test("every catalog spelling finds its own entry", () => {
    for (const [dialect, types] of Object.entries(DATA_TYPES)) {
      for (const type of types) {
        for (const spelling of [type.name, ...(type.aliases ?? [])]) {
          expect([dialect, spelling, matchDataType(types, spelling)?.type.name]).toEqual([
            dialect,
            spelling,
            type.name,
          ]);
        }
      }
    }
  });
});
