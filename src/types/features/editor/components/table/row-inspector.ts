import type { Row } from "@/types/lib/sqlite/types";

/** `id` changes for every opening, so the form starts fresh each time. */
export type InspectorTarget =
  | { kind: "edit"; id: number; row: Row; index: number }
  | { kind: "new"; id: number; initial?: Row };
