/**
 * Unsaved schema designs live in this browser, one per database id (or
 * "blank"), until the user saves them into a database or discards them.
 */
import { STORAGE_KEYS } from "@/constants";
import { readJson, removeKey, writeJson } from "@/lib/storage";
import { EMPTY_DRAFT, isDraftEmpty, normalizeDraft, type Draft } from "./model";

export const BLANK_DESIGN = "blank";

export function readDraft(key: string): Draft {
  const raw = readJson<Partial<Draft> | null>(STORAGE_KEYS.visDraft + key, null);
  // Guard against old or hand-edited values so the designer never crashes on load.
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.tables)) return EMPTY_DRAFT;
  const draft = normalizeDraft(raw);
  const records = [draft.addedColumns, draft.renamedTables, draft.columnChanges];
  return records.every((r) => r && typeof r === "object" && !Array.isArray(r)) &&
    Array.isArray(draft.droppedTables)
    ? draft
    : EMPTY_DRAFT;
}

export function writeDraft(key: string, draft: Draft): void {
  if (isDraftEmpty(draft)) removeKey(STORAGE_KEYS.visDraft + key);
  else writeJson(STORAGE_KEYS.visDraft + key, draft);
}

export function hasUnsavedDesign(key: string): boolean {
  return !isDraftEmpty(readDraft(key));
}
