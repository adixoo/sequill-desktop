import { describe, expect, test } from "vitest";
import { duplicateValues } from "@/features/vis/lib/model";

describe("duplicateValues", () => {
  test("lists each repeated value once and ignores empty ones", () => {
    expect([...duplicateValues(["a", "b", "a", "a", "", ""])]).toEqual(["a"]);
    expect(duplicateValues(["a", "b"]).size).toBe(0);
    expect(duplicateValues([]).size).toBe(0);
  });
});
