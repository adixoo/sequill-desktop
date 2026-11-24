/**
 * The Sequill brand: the mark (a pen nib whose top is stacked database disks,
 * sequel and quill) and the block wordmark, in Pastel Noir colours on the
 * near-black ground. One source for the footer, the Open Graph image and the
 * icon files scripts/generate-icons.ts writes. Images render
 * outside the page, so colours are the token values, not CSS variables;
 * logo.test.ts checks they match the tokens in src/styles/globals.css.
 */

import type { LogoShape } from "@/types/utils/logo";

export const LOGO_SIZE = 512;

export const LOGO_COLORS = {
  ground: "#0a0a0b", // the mark keeps its own near-black ground
  peach: "#ffb3a1", // --peach
  butter: "#f5e1a4", // --butter
  mint: "#a6e3c4", // --mint
  sky: "#a9c9ff", // --sky
  rose: "#f6a8c6", // --rose
  ink: "#ededf0", // light stroke on the dark ground
} as const;

/** Corner radius of the ground tile. */
export const LOGO_RADIUS = 112;

/** Filled shapes, back to front: two disks, the nib, then its breather hole and slit. */
const FULL: LogoShape[] = [
  // Top disk: a flat top with rounded shoulders and a curved front edge.
  {
    d: "M150 64H362Q400 64 400 102V124Q256 172 112 124V102Q112 64 150 64Z",
    fill: LOGO_COLORS.peach,
  },
  // Second disk, one gap below, following the same curve.
  { d: "M112 150Q256 198 400 150V192Q256 240 112 192Z", fill: LOGO_COLORS.butter },
  // The nib, tapering to its point.
  { d: "M112 218Q256 266 400 218V256L256 456L112 256Z", fill: LOGO_COLORS.mint },
  { d: "M256 286a26 26 0 1 0 0 52a26 26 0 1 0 0-52Z", fill: LOGO_COLORS.ground },
  { d: "M248 330H264V412L256 426L248 412Z", fill: LOGO_COLORS.ground },
];

/** For 32px and under: one disk and the nib, with a wider gap, so the shape survives. */
const SMALL: LogoShape[] = [
  { d: "M150 56H362Q404 56 404 98V150Q256 204 108 150V98Q108 56 150 56Z", fill: LOGO_COLORS.peach },
  { d: "M108 212Q256 266 404 212V258L256 464L108 258Z", fill: LOGO_COLORS.mint },
];

/** Below this rendered size, use the simpler drawing. */
export const LOGO_SMALL_MAX = 32;

export function logoShapes(size = LOGO_SIZE): LogoShape[] {
  return size <= LOGO_SMALL_MAX ? SMALL : FULL;
}

/** The mark as a standalone SVG document drawn for `size` pixels; `ground: false` leaves out the tile. */
export function logoSvg({
  size = LOGO_SIZE,
  ground = true,
}: { size?: number; ground?: boolean } = {}): string {
  const tile = ground
    ? `<rect width="${LOGO_SIZE}" height="${LOGO_SIZE}" rx="${LOGO_RADIUS}" fill="${LOGO_COLORS.ground}"/>`
    : "";
  const shapes = logoShapes(size)
    .map((s) => `<path d="${s.d}" fill="${s.fill}"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOGO_SIZE} ${LOGO_SIZE}">${tile}${shapes}</svg>`;
}
