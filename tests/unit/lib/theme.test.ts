import { describe, expect, test } from "vitest";
import { parseTheme } from "@/lib/theme";

describe("parseTheme", () => {
  test("keeps known themes", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
  });

  test("falls back to dark for anything else", () => {
    expect(parseTheme(null)).toBe("dark");
    expect(parseTheme(undefined)).toBe("dark");
    expect(parseTheme("system")).toBe("dark");
    expect(parseTheme("")).toBe("dark");
  });
});
