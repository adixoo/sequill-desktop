/**
 * Table colors on the schema diagram: one of the design system's pastels, or a
 * custom hex. Values are validated before they reach any style attribute.
 */
import type { Accent } from "@/types/components/molecules/pastel/accent";
import type { TableColor } from "@/types/features/vis/lib/colors";

export const PRESET_COLORS: { value: Accent; label: string }[] = [
  { value: "peach", label: "Peach" },
  { value: "butter", label: "Butter" },
  { value: "mint", label: "Mint" },
  { value: "sky", label: "Sky" },
  { value: "lilac", label: "Lilac" },
  { value: "rose", label: "Rose" },
];

const PRESETS = new Set<string>(PRESET_COLORS.map((c) => c.value));
const HEX_RE = /^#[0-9a-f]{6}$/i;

export function isTableColor(value: unknown): value is TableColor {
  return typeof value === "string" && (PRESETS.has(value) || HEX_RE.test(value));
}

/** Keeps only valid entries (storage is untrusted: these end up in inline styles). */
export function sanitizeColors(value: unknown): Record<string, TableColor> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, TableColor] => isTableColor(entry[1])),
  );
}

/** Fill color: the pastel itself, or the custom hex. */
export function colorFill(color: TableColor): string {
  return PRESETS.has(color) ? `var(--${color})` : color;
}

/** Stroke and dot color: presets use their "-ink" shade so they stay visible in light mode. */
export function colorInk(color: TableColor): string {
  return PRESETS.has(color) ? `var(--${color}-ink)` : color;
}

/** Translucent tint for a card header, mixed over the raised surface. */
export function colorWash(color: TableColor): string {
  return `color-mix(in srgb, ${colorFill(color)} 22%, var(--raised))`;
}

export function colorLabel(color: TableColor): string {
  return PRESET_COLORS.find((c) => c.value === color)?.label ?? color.toUpperCase();
}

/** Moves colors from draft node ids to the ids the tables get once they exist. */
export function carryColors(
  colors: Record<string, TableColor>,
  renames: { from: string; to: string }[],
): Record<string, TableColor> {
  const next = { ...colors };
  for (const { from, to } of renames) {
    if (!(from in next)) continue;
    next[to] = next[from];
    delete next[from];
  }
  return next;
}

/**
 * Applies colors given by table name (an assistant's, over MCP) to the colors by node id.
 * Unknown names and invalid colors are skipped; null clears a color.
 */
export function applyNamedColors(
  colors: Record<string, TableColor>,
  named: Record<string, unknown>,
  idByName: Record<string, string>,
): Record<string, TableColor> {
  let next = colors;
  for (const [name, color] of Object.entries(named)) {
    const id = idByName[name];
    if (id && (color === null || isTableColor(color))) next = setColor(next, id, color);
  }
  return next;
}

export function setColor(
  colors: Record<string, TableColor>,
  id: string,
  color: TableColor | null,
): Record<string, TableColor> {
  const next = { ...colors };
  if (color === null) delete next[id];
  else next[id] = color;
  return next;
}
