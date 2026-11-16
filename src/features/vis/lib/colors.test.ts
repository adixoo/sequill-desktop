import { describe, expect, test } from "bun:test";
import {
  carryColors,
  colorFill,
  colorInk,
  colorLabel,
  colorWash,
  isTableColor,
  sanitizeColors,
  setColor,
} from "./colors";

describe("table colors", () => {
  test("accepts presets and six-digit hex only", () => {
    expect(isTableColor("mint")).toBe(true);
    expect(isTableColor("#A1b2C3")).toBe(true);
    expect(isTableColor("#abc")).toBe(false);
    expect(isTableColor("red")).toBe(false);
    expect(isTableColor("#123456; background:url(x)")).toBe(false);
    expect(isTableColor(42)).toBe(false);
  });

  test("sanitizes stored values before they reach styles", () => {
    expect(sanitizeColors({ "t:a": "sky", "t:b": "#ff0000", "t:c": "red;}", "t:d": 3 })).toEqual({
      "t:a": "sky",
      "t:b": "#ff0000",
    });
    expect(sanitizeColors(null)).toEqual({});
    expect(sanitizeColors(["mint"])).toEqual({});
  });

  test("resolves presets to tokens and keeps custom hex", () => {
    expect(colorFill("peach")).toBe("var(--peach)");
    expect(colorInk("peach")).toBe("var(--peach-ink)");
    expect(colorFill("#112233")).toBe("#112233");
    expect(colorInk("#112233")).toBe("#112233");
    expect(colorWash("lilac")).toBe("color-mix(in srgb, var(--lilac) 22%, var(--raised))");
    expect(colorLabel("butter")).toBe("Butter");
    expect(colorLabel("#a1b2c3")).toBe("#A1B2C3");
  });

  test("set, clear and carry colors to applied tables", () => {
    let colors = setColor({}, "d:x1", "rose");
    colors = setColor(colors, "t:orders", "#00ff00");
    expect(setColor(colors, "t:orders", null)).toEqual({ "d:x1": "rose" });
    expect(
      carryColors(colors, [
        { from: "d:x1", to: "t:reviews" },
        { from: "d:missing", to: "t:y" },
      ]),
    ).toEqual({
      "t:orders": "#00ff00",
      "t:reviews": "rose",
    });
  });
});
