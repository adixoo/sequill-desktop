/** Saved SQL queries: the stored shape and the pure helpers around it. */

export interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  /** Epoch ms of the last save; the list is newest first. */
  updatedAt: number;
}

/** Longest name suggested from a query's first line. */
const SUGGESTED_NAME_LENGTH = 48;

/**
 * Reads whatever localStorage held into valid saved queries. Older versions stored
 * `{ name, sql }` without ids or times; those get an id and keep their order.
 */
export function normalizeSavedQueries(raw: unknown, makeId: () => string): SavedQuery[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedQuery[] = [];
  raw.forEach((item, i) => {
    if (!item || typeof item !== "object") return;
    const { id, name, sql, updatedAt } = item as Partial<SavedQuery>;
    if (typeof sql !== "string" || !sql.trim()) return;
    out.push({
      id: typeof id === "string" && id ? id : makeId(),
      name: typeof name === "string" && name.trim() ? name.trim() : suggestQueryName(sql),
      sql,
      // Undated entries sort after dated ones, in their stored order.
      updatedAt: typeof updatedAt === "number" ? updatedAt : -i,
    });
  });
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** A name for a new saved query: its leading `--` comment, else its first line. */
export function suggestQueryName(sql: string, fallback = "Untitled query"): string {
  const first = sql.trim().split("\n")[0] ?? "";
  const name = first
    .replace(/^--\s*/, "")
    .trim()
    .slice(0, SUGGESTED_NAME_LENGTH);
  return name || fallback;
}
