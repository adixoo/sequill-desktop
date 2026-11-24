/** Automatic left-to-right layout for the schema diagram (dagre). */
import type { Side, Point } from "@/types/features/vis/lib/layout";
import dagre from "@dagrejs/dagre";

/** A card's narrowest width; cards grow to fit long names and types, up to TABLE_MAX_WIDTH. */
export const TABLE_WIDTH = 248;
export const TABLE_MAX_WIDTH = 480;
export const TABLE_HEADER_HEIGHT = 40;
export const TABLE_ROW_HEIGHT = 28;

export function tableHeight(columnCount: number): number {
  return TABLE_HEADER_HEIGHT + Math.max(1, columnCount) * TABLE_ROW_HEIGHT + 8;
}

// Average glyph widths (px) at the card's font sizes: names in DM Sans 13px, types in JetBrains Mono 11px (compact --text-small).
const NAME_CHAR = 7.3;
const TITLE_CHAR = 7.7;
const TYPE_CHAR = 6.6;
/** Row padding, key icon, the gaps around the name and room to breathe before the type. */
const ROW_CHROME = 62;
/** Header padding, table icon, gaps and the column count. */
const HEADER_CHROME = 80;
const KIND_BADGE = 56;

/**
 * Width of a table's card: wide enough for its longest row and its name.
 * shortcut: estimates text from character counts, not font metrics; measure with canvas if cards misfit.
 */
export function tableWidth(table: {
  name: string;
  kind: string;
  columns: { name: string; type: string }[];
}): number {
  const row = Math.max(
    0,
    ...table.columns.map((c) => c.name.length * NAME_CHAR + (c.type || "any").length * TYPE_CHAR),
  );
  const badge = table.kind === "view" || table.kind === "virtual" ? KIND_BADGE : 0;
  const header = table.name.length * TITLE_CHAR + HEADER_CHROME + badge;
  const width = Math.max(row + ROW_CHROME, header);
  return Math.round(Math.min(TABLE_MAX_WIDTH, Math.max(TABLE_WIDTH, width)));
}

/** Positions (top-left corners) for every table; parents end up to the right of their children. */
export function autoLayout(
  tables: { id: string; columns: number; width: number }[],
  edges: { source: string; target: string }[],
): Record<string, Point> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 120, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const t of tables) g.setNode(t.id, { width: t.width, height: tableHeight(t.columns) });
  for (const e of edges) if (e.source !== e.target) g.setEdge(e.source, e.target);
  dagre.layout(g);

  const positions: Record<string, Point> = {};
  for (const t of tables) {
    const n = g.node(t.id);
    positions[t.id] = { x: Math.round(n.x - n.width / 2), y: Math.round(n.y - n.height / 2) };
  }
  return positions;
}

/** Handle id for a column (or the table header) on one side of a card. */
export const handleId = (side: Side, column: string) => `${side}:${column}`;

/** Column name from a handle id ("R:customer_id" → "customer_id"). */
export const handleColumn = (id: string) => id.slice(2);

/**
 * Which sides a relationship line should leave and enter, from where the two
 * cards are. Side by side: the facing sides. Stacked (cards overlap
 * horizontally) or a self-reference: both on the right, so the line brackets
 * around instead of cutting through a card. `widths` are the two cards' widths.
 */
export function edgeSides(
  source: Point,
  target: Point,
  sameTable = false,
  widths = { source: TABLE_WIDTH, target: TABLE_WIDTH },
): { source: Side; target: Side } {
  const dx = target.x - source.x;
  // Stacked when the card on the left reaches most of the way to the other one.
  const leftWidth = dx > 0 ? widths.source : widths.target;
  if (sameTable || Math.abs(dx) < leftWidth * 0.75) return { source: "R", target: "R" };
  return dx > 0 ? { source: "R", target: "L" } : { source: "L", target: "R" };
}

/** Places a new table to the right of everything already on the canvas. */
export function nextFreePosition(
  positions: Record<string, Point>,
  widths: Record<string, number> = {},
): Point {
  const entries = Object.entries(positions);
  if (entries.length === 0) return { x: 24, y: 24 };
  return {
    x: Math.max(...entries.map(([id, p]) => p.x + (widths[id] ?? TABLE_WIDTH))) + 80,
    y: Math.min(...entries.map(([, p]) => p.y)),
  };
}
