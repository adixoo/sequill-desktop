/** Editor UI state: active database, open tabs and their view settings. */
import { create } from "zustand";
import { DEFAULT_PAGE_SIZE, STORAGE_KEYS } from "@/shared/lib/constants";
import type { Filter, FilterMatch, SortSpec } from "@/shared/lib/sqlite/sql";
import { readJson, writeJson } from "@/shared/lib/storage";
import { newId } from "@/shared/lib/utils";

/** Column layout remembered per table across sessions. */
export interface ColumnLayout {
  hidden: string[];
  order: string[];
  widths: Record<string, number>;
  pinned: string[];
}

export interface TableViewState extends ColumnLayout {
  filters: Filter[];
  match: FilterMatch;
  search: string;
  sort: SortSpec[];
  page: number;
  pageSize: number;
  mode: "data" | "structure";
}

export type Tab =
  | { id: string; kind: "table"; table: string; view: TableViewState }
  | {
      id: string;
      kind: "query";
      title: string;
      sql: string;
      /** The saved query this tab edits; Save updates it in place. */
      savedId?: string;
    };

/** The saved query a tab is linked to, by id, with the name shown as its title. */
export interface SavedQueryRef {
  id: string;
  name: string;
}

export type Density = "compact" | "comfortable";

interface WorkspaceState {
  dbId: string | null;
  tabs: Tab[];
  activeTabId: string | null;
  density: Density;
  queryCounter: number;
  setDb(dbId: string | null): void;
  openTable(table: string, patch?: Partial<TableViewState>): void;
  /** Opens a query tab. A saved query that's already open is brought forward instead. */
  openQuery(sql?: string, saved?: SavedQueryRef): void;
  /** Links a tab to the saved query it was just saved as. */
  linkQuery(tabId: string, saved: SavedQueryRef): void;
  /** Follows a saved query's rename (`name`) or deletion (`null`) in open tabs. */
  syncSavedQuery(id: string, name: string | null): void;
  closeTab(id: string): void;
  closeOtherTabs(id: string): void;
  setActiveTab(id: string): void;
  updateView(tabId: string, patch: Partial<TableViewState>): void;
  updateQuery(tabId: string, sql: string): void;
  /** Keeps tabs in sync after schema changes (renames, drops). */
  syncTables(existing: string[], renamed?: { from: string; to: string }): void;
  setDensity(density: Density): void;
}

const layoutKey = (dbId: string, table: string) => `${STORAGE_KEYS.tableView}${dbId}:${table}`;

const EMPTY_LAYOUT: ColumnLayout = { hidden: [], order: [], widths: {}, pinned: [] };

function defaultView(dbId: string | null, table: string): TableViewState {
  const layout = dbId ? readJson<ColumnLayout>(layoutKey(dbId, table), EMPTY_LAYOUT) : EMPTY_LAYOUT;
  return {
    ...EMPTY_LAYOUT,
    ...layout,
    filters: [],
    match: "and",
    search: "",
    sort: [],
    page: 0,
    pageSize: DEFAULT_PAGE_SIZE,
    mode: "data",
  };
}

export const useWorkspace = create<WorkspaceState>()((set, get) => ({
  dbId: null,
  tabs: [],
  activeTabId: null,
  density:
    typeof window === "undefined" ? "compact" : readJson<Density>(STORAGE_KEYS.density, "compact"),
  queryCounter: 0,

  setDb(dbId) {
    if (get().dbId === dbId) return;
    set({ dbId, tabs: [], activeTabId: null, queryCounter: 0 });
    if (dbId) writeJson(STORAGE_KEYS.lastDatabase, dbId);
  },

  openTable(table, patch) {
    const { tabs, dbId } = get();
    const existing = tabs.find((t) => t.kind === "table" && t.table === table);
    if (existing && existing.kind === "table") {
      set({
        activeTabId: existing.id,
        tabs: patch
          ? tabs.map((t) =>
              t.id === existing.id && t.kind === "table"
                ? { ...t, view: { ...t.view, ...patch } }
                : t,
            )
          : tabs,
      });
      return;
    }
    const tab: Tab = {
      id: newId(),
      kind: "table",
      table,
      view: { ...defaultView(dbId, table), ...patch },
    };
    set({ tabs: [...tabs, tab], activeTabId: tab.id });
  },

  openQuery(sql = "", saved) {
    const { tabs, queryCounter } = get();
    const open = saved && tabs.find((t) => t.kind === "query" && t.savedId === saved.id);
    if (open) {
      set({ activeTabId: open.id });
      return;
    }
    // Only unnamed tabs use up a "Query n" number.
    const n = saved ? queryCounter : queryCounter + 1;
    const tab: Tab = saved
      ? { id: newId(), kind: "query", title: saved.name, sql, savedId: saved.id }
      : { id: newId(), kind: "query", title: `Query ${n}`, sql };
    set({ tabs: [...tabs, tab], activeTabId: tab.id, queryCounter: n });
  },

  linkQuery(tabId, saved) {
    set({
      tabs: get().tabs.map((t) =>
        t.id === tabId && t.kind === "query" ? { ...t, title: saved.name, savedId: saved.id } : t,
      ),
    });
  },

  syncSavedQuery(id, name) {
    set({
      tabs: get().tabs.map((t) => {
        if (t.kind !== "query" || t.savedId !== id) return t;
        // A deleted query's tab keeps its text and title but is no longer saved anywhere.
        return name === null ? { ...t, savedId: undefined } : { ...t, title: name };
      }),
    });
  },

  closeTab(id) {
    const { tabs, activeTabId } = get();
    const index = tabs.findIndex((t) => t.id === id);
    const next = tabs.filter((t) => t.id !== id);
    const nextActive =
      activeTabId === id ? (next[Math.min(index, next.length - 1)]?.id ?? null) : activeTabId;
    set({ tabs: next, activeTabId: nextActive });
  },

  closeOtherTabs(id) {
    set({ tabs: get().tabs.filter((t) => t.id === id), activeTabId: id });
  },

  setActiveTab(id) {
    set({ activeTabId: id });
  },

  updateView(tabId, patch) {
    const { dbId } = get();
    set({
      tabs: get().tabs.map((t) => {
        if (t.id !== tabId || t.kind !== "table") return t;
        const view = { ...t.view, ...patch };
        if (
          dbId &&
          ("hidden" in patch || "order" in patch || "widths" in patch || "pinned" in patch)
        ) {
          const { hidden, order, widths, pinned } = view;
          writeJson(layoutKey(dbId, t.table), { hidden, order, widths, pinned });
        }
        return { ...t, view };
      }),
    });
  },

  updateQuery(tabId, sql) {
    set({
      tabs: get().tabs.map((t) => (t.id === tabId && t.kind === "query" ? { ...t, sql } : t)),
    });
  },

  syncTables(existing, renamed) {
    const names = new Set(existing);
    const tabs = get()
      .tabs.map((t) =>
        renamed && t.kind === "table" && t.table === renamed.from ? { ...t, table: renamed.to } : t,
      )
      .filter((t) => t.kind !== "table" || names.has(t.table));
    const activeTabId = tabs.some((t) => t.id === get().activeTabId)
      ? get().activeTabId
      : (tabs.at(-1)?.id ?? null);
    set({ tabs, activeTabId });
  },

  setDensity(density) {
    writeJson(STORAGE_KEYS.density, density);
    set({ density });
  },
}));
