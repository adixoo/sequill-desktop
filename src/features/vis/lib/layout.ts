/** Automatic left-to-right layout for the schema diagram (dagre). */
import dagre from "@dagrejs/dagre";

export const TABLE_WIDTH = 248;
export const TABLE_HEADER_HEIGHT = 40;
export const TABLE_ROW_HEIGHT = 28;

export interface Point {
  x: number;
  y: number;
}

export function tableHeight(columnCount: number): number {
  return TABLE_HEADER_HEIGHT + Math.max(1, columnCount) * TABLE_ROW_HEIGHT + 8;
}

/** Positions (top-left corners) for every table; parents end up to the right of their children. */
export function autoLayout(
  tables: { id: string; columns: number }[],
  edges: { source: string; target: string }[],
): Record<string, Point> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 120, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const t of tables) g.setNode(t.id, { width: TABLE_WIDTH, height: tableHeight(t.columns) });
  for (const e of edges) if (e.source !== e.target) g.setEdge(e.source, e.target);
  dagre.layout(g);

  const positions: Record<string, Point> = {};
  for (const t of tables) {
    const n = g.node(t.id);
    positions[t.id] = { x: Math.round(n.x - n.width / 2), y: Math.round(n.y - n.height / 2) };
  }
  return positions;
}

export type Side = "L" | "R";

/** Handle id for a column (or the table header) on one side of a card. */
export const handleId = (side: Side, column: string) => `${side}:${column}`;

/** Column name from a handle id ("R:customer_id" → "customer_id"). */
export const handleColumn = (id: string) => id.slice(2);

/**
 * Which sides a relationship line should leave and enter, from where the two
 * cards are. Side by side: the facing sides. Stacked (cards overlap
 * horizontally) or a self-reference: both on the right, so the line brackets
 * around instead of cutting through a card.
 */
export function edgeSides(
  source: Point,
  target: Point,
  sameTable = false,
): { source: Side; target: Side } {
  const dx = target.x - source.x;
  if (sameTable || Math.abs(dx) < TABLE_WIDTH * 0.75) return { source: "R", target: "R" };
  return dx > 0 ? { source: "R", target: "L" } : { source: "L", target: "R" };
}

/** Places a new table to the right of everything already on the canvas. */
export function nextFreePosition(positions: Record<string, Point>): Point {
  const xs = Object.values(positions);
  if (xs.length === 0) return { x: 24, y: 24 };
  return {
    x: Math.max(...xs.map((p) => p.x)) + TABLE_WIDTH + 80,
    y: Math.min(...xs.map((p) => p.y)),
  };
}
