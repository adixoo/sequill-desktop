/**
 * Unsaved schema designs, one per database id (or "blank"), until the user saves them into
 * a database or discards them. In browsers they live in this browser's storage. In the
 * desktop app they live in the catalog, so assistants over MCP can read and edit them too;
 * this module keeps a copy in memory (loaded at start, reloaded when an assistant changes
 * the catalog) so reading stays synchronous.
 */
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { STORAGE_KEYS } from "@/constants";
import { isDesktop } from "@/lib/platform";
import { desktopDesigns, watchDesktopChanges } from "@/lib/sqlite/desktop";
import { errorMessage } from "@/lib/sqlite/errors";
import { readJson, removeKey, writeJson } from "@/lib/storage";
import { EMPTY_DRAFT, isDraftEmpty, normalizeDraft, type Draft } from "./model";

export const BLANK_DESIGN = "blank";

const desktop = typeof window !== "undefined" && isDesktop();

/** A draft from storage, or EMPTY_DRAFT for old, hand-edited or assistant-broken values. */
function parseDraft(raw: unknown): Draft {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as Partial<Draft>).tables)) {
    return EMPTY_DRAFT;
  }
  const draft = normalizeDraft(raw as Partial<Draft>);
  const records = [draft.addedColumns, draft.renamedTables, draft.columnChanges, draft.objects];
  return records.every((r) => r && typeof r === "object" && !Array.isArray(r)) &&
    Array.isArray(draft.droppedTables)
    ? draft
    : EMPTY_DRAFT;
}

// ---- Desktop: the catalog, with a copy in memory ----------------------------------------

/** Each design as last loaded or written here, with the catalog version it is based on. */
const designs = new Map<string, { draft: Draft; version: number }>();
/** The draft last stored in the catalog for each key, so unchanged drafts aren't saved again. */
const stored = new Map<string, Draft>();
const listeners = new Set<() => void>();
let loaded = false;
/** Saves run one at a time, each based on the version the previous one left. */
let saving: Promise<void> = Promise.resolve();

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Reads every design from the catalog. One an assistant saved since (a newer version)
 * replaces the copy here; drafts not saved yet stay.
 */
export async function reloadDrafts(): Promise<void> {
  if (!desktop) return;
  await saving;
  await load();
}

async function load(): Promise<void> {
  try {
    for (const { key, draft, version } of await desktopDesigns.list()) {
      if (version <= (designs.get(key)?.version ?? 0)) continue;
      const parsed = parseDraft(draft);
      designs.set(key, { draft: parsed, version });
      stored.set(key, parsed);
    }
  } catch (error) {
    toast.error(`Schema designs couldn't be loaded: ${errorMessage(error)}`);
  }
  loaded = true;
  notify();
}

async function save(key: string): Promise<void> {
  const design = designs.get(key);
  if (!design || stored.get(key) === design.draft) return;
  try {
    const version = await desktopDesigns.save(key, design.draft, design.version);
    if (version === null) {
      toast.warning(
        "An assistant changed this design at the same time, so your last edit was undone. Its version is shown.",
      );
      designs.delete(key);
      await load();
      return;
    }
    stored.set(key, design.draft);
    // Edits made while saving keep their draft; they are based on this new version.
    designs.set(key, { draft: designs.get(key)!.draft, version });
  } catch (error) {
    toast.error(`The design wasn't stored: ${errorMessage(error)}`);
  }
}

/** Moves drafts this window kept in its own storage (before designs moved to the catalog). */
function moveLocalDrafts(): void {
  let keys: string[] = [];
  try {
    keys = Object.keys(window.localStorage).filter((k) => k.startsWith(STORAGE_KEYS.visDraft));
  } catch {
    return;
  }
  for (const storageKey of keys) {
    const key = storageKey.slice(STORAGE_KEYS.visDraft.length);
    const draft = parseDraft(readJson<unknown>(storageKey, null));
    if (!isDraftEmpty(draft) && !designs.has(key)) {
      designs.set(key, { draft, version: 0 });
      saving = saving.then(() => save(key));
    }
    removeKey(storageKey);
  }
  notify();
}

if (desktop) {
  void reloadDrafts().then(moveLocalDrafts);
  // The catalog changed in another process (an assistant over MCP): its designs may have too.
  watchDesktopChanges(({ catalog }) => {
    if (catalog) void reloadDrafts();
  });
}

// ---- Both builds -------------------------------------------------------------------------

export function readDraft(key: string): Draft {
  if (desktop) return designs.get(key)?.draft ?? EMPTY_DRAFT;
  return parseDraft(readJson<unknown>(STORAGE_KEYS.visDraft + key, null));
}

export function writeDraft(key: string, draft: Draft): void {
  if (!desktop) {
    if (isDraftEmpty(draft)) removeKey(STORAGE_KEYS.visDraft + key);
    else writeJson(STORAGE_KEYS.visDraft + key, draft);
    return;
  }
  if (readDraft(key) === draft) return;
  designs.set(key, { draft, version: designs.get(key)?.version ?? 0 });
  notify();
  saving = saving.then(() => save(key));
}

export function hasUnsavedDesign(key: string): boolean {
  return !isDraftEmpty(readDraft(key));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether the designs can be read yet (desktop loads them from the catalog first). */
export function useDraftsLoaded(): boolean {
  return useSyncExternalStore(subscribe, () => !desktop || loaded);
}

/**
 * The stored draft for `key`, updated when an assistant changes it. Browsers have no other
 * writer, so there it stays the same.
 */
export function useStoredDraft(key: string): Draft {
  return useSyncExternalStore(subscribe, () => (desktop ? readDraft(key) : EMPTY_DRAFT));
}
