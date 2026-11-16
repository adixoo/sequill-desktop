import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LOGO_COLORS, LOGO_SMALL_MAX, logoShapes, logoSvg } from "./logo";

const tokens = readFileSync(join(import.meta.dir, "..", "..", "styles", "globals.css"), "utf8");
const token = (name: string) => tokens.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1];

describe("logo", () => {
  test("uses the Pastel Noir token colours", () => {
    expect({ ...LOGO_COLORS } as Record<string, string>).toEqual({
      ground: token("gray-950")!,
      peach: token("peach")!,
      butter: token("butter")!,
      mint: token("mint")!,
      sky: token("sky")!,
      rose: token("rose")!,
      ink: token("gray-100")!,
    });
  });

  test("draws a simpler mark at small sizes", () => {
    expect(logoShapes(16)).toHaveLength(2);
    expect(logoShapes(LOGO_SMALL_MAX)).toHaveLength(2);
    expect(logoShapes(LOGO_SMALL_MAX + 1).length).toBeGreaterThan(2);
  });

  test("writes a standalone SVG, with or without its ground tile", () => {
    const svg = logoSvg();
    expect(svg).toStartWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">');
    expect(svg).toContain(`<rect width="512" height="512" rx="112" fill="${LOGO_COLORS.ground}"/>`);
    expect(logoSvg({ ground: false })).not.toContain("<rect");
  });
});
