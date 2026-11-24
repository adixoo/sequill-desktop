import type { ColumnDef } from "@/types/lib/sqlite/ddl";
import type { ExtraObject } from "@/types/lib/sqlite/types";

export interface DraftTable {
  id: string;
  name: string;
  columns: ColumnDef[];
  withoutRowid: boolean;
  strict: boolean;
}

/** A pending change to an existing column. `def.name` is the column's new name. */
export type ColumnChange = { kind: "drop" } | { kind: "change"; def: ColumnDef };

/**
 * What the user has designed but not saved yet. Existing tables and columns are
 * always keyed by their current names in the database.
 */
export interface Draft {
  tables: DraftTable[];
  /** New columns for existing tables. */
  addedColumns: Record<string, ColumnDef[]>;
  /** Existing table → new name. */
  renamedTables: Record<string, string>;
  droppedTables: string[];
  /** Existing table → existing column → change. */
  columnChanges: Record<string, Record<string, ColumnChange>>;
  /**
   * An imported schema's enums, functions, procedures, triggers, views, sequences and
   * types: `objectKey` as stored → its new definition, or null to delete it.
   */
  objects: Record<string, ExtraObject | null>;
}

export type DiagramTableKind = "table" | "view" | "virtual" | "draft";

export interface DiagramColumn {
  /** Name as it will be after saving. */
  name: string;
  type: string;
  pk: boolean;
  notNull: boolean;
  /** Referenced table and column, when this column is a foreign key. */
  fk: { table: string; column: string | null } | null;
  /** Not in the database yet. */
  draft: boolean;
  /** Pending change to an existing column. */
  change?: "edited" | "dropped";
  /**
   * Stable id within its table for editing: "o:<name>" for a column in the
   * database, "a:<index>" for a column added to an existing table, "n:<index>"
   * for a column of a new table.
   */
  key: string;
  /** The column's name in the database, when it exists there. */
  originalName?: string;
}

export interface DiagramTable {
  id: string;
  /** Name as it will be after saving. */
  name: string;
  kind: DiagramTableKind;
  columns: DiagramColumn[];
  /** Set for tables designed in the draft. */
  draftId?: string;
  /** The table's name in the database, for existing tables. */
  originalName?: string;
  change?: "renamed" | "dropped";
}

export interface DiagramEdge {
  id: string;
  source: string;
  sourceColumn: string;
  target: string;
  targetColumn: string;
  draft: boolean;
}

export interface Diagram {
  tables: DiagramTable[];
  edges: DiagramEdge[];
}

export type ColumnEditMode = "create" | "add";
