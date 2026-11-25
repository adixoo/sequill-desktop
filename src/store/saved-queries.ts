/**
 * Saved SQL queries, shared by every database. They live in the catalog next to the
 * databases, so an assistant can read and edit them over MCP too.
 */
import { toast } from "@/components/atoms/toast";
import { create } from "zustand";
import { STORAGE_KEYS } from "@/constants";
import { normalizeSavedQueries } from "@/utils/data/saved-queries";
import type { SavedQuery } from "@/types/utils/data/saved-queries";
import { isDesktop } from "@/lib/platform";
import { desktopSavedQueries } from "@/lib/sqlite/desktop";
import { errorMessage } from "@/lib/sqlite/errors";
import { readJson, removeKey } from "@/lib/storage";
import { newId } from "@/utils";

interface SavedQueriesState {
  queries: SavedQuery[];
  /** Saves a new query and returns it. */
  add(name: string, sql: string): SavedQuery;
  /** Replaces a saved query's SQL (Save on a tab that's already saved). */
  update(id: string, sql: string): void;
  rename(id: string, name: string): void;
  /** Removes a saved query and returns it, so the caller can offer an undo. */
  remove(id: string): SavedQuery | undefined;
  /** Puts a removed query back. */
  restore(query: SavedQuery): void;
  /** Reads the list again (after an assistant changed it). */
  reload(): Promise<void>;
}

/** Queries this window kept in its own storage before saved queries moved to the catalog. */
function loadLocal(): SavedQuery[] {
  return normalizeSavedQueries(readJson<unknown>(STORAGE_KEYS.savedQueries, []), newId);
}

const newestFirst = (queries: SavedQuery[]) =>
  [...queries].sort((a, b) => b.updatedAt - a.updatedAt);

/** Stores one change in the catalog; a failure is shown rather than lost. */
function persist(change: Promise<unknown>): void {
  change.catch((error) => toast.error(`The saved query wasn't stored: ${errorMessage(error)}`));
}

export const useSavedQueries = create<SavedQueriesState>()((set, get) => {
  const commit = (queries: SavedQuery[]) => set({ queries: newestFirst(queries) });
  const upsert = (query: SavedQuery) => {
    commit([query, ...get().queries.filter((q) => q.id !== query.id)]);
    persist(desktopSavedQueries.upsert(query));
  };
  const edit = (id: string, patch: Partial<SavedQuery>) => {
    const query = get().queries.find((q) => q.id === id);
    if (query) upsert({ ...query, ...patch });
  };

  return {
    queries: [],

    add(name, sql) {
      const query: SavedQuery = { id: newId(), name: name.trim(), sql, updatedAt: Date.now() };
      upsert(query);
      return query;
    },

    update(id, sql) {
      edit(id, { sql, updatedAt: Date.now() });
    },

    rename(id, name) {
      edit(id, { name: name.trim() });
    },

    remove(id) {
      const query = get().queries.find((q) => q.id === id);
      commit(get().queries.filter((q) => q.id !== id));
      persist(desktopSavedQueries.remove(id));
      return query;
    },

    restore(query) {
      upsert(query);
    },

    async reload() {
      try {
        set({ queries: newestFirst(await desktopSavedQueries.list()) });
      } catch (error) {
        toast.error(`Saved queries couldn't be loaded: ${errorMessage(error)}`);
      }
    },
  };
});

/**
 * Loads the shared list, first moving over any queries this window kept in its
 * own storage before saved queries moved to the catalog.
 */
async function loadDesktop(): Promise<void> {
  const local = loadLocal();
  if (local.length > 0) {
    try {
      const shared = await desktopSavedQueries.list();
      const known = new Set(shared.map((q) => q.id));
      await Promise.all(local.filter((q) => !known.has(q.id)).map(desktopSavedQueries.upsert));
      removeKey(STORAGE_KEYS.savedQueries);
    } catch (error) {
      toast.error(`Saved queries couldn't be moved: ${errorMessage(error)}`);
    }
  }
  await useSavedQueries.getState().reload();
}

// Not in tests or the browser dev server, which have no catalog to load.
if (isDesktop()) void loadDesktop();
