/** Types shared by the SQLite worker and the UI. Everything here must be structured-clone safe. */

export type CellValue = string | number | bigint | Uint8Array | null;
export type Row = CellValue[];

export interface SqlStatement {
  sql: string;
  params: CellValue[];
}

export interface QueryResult {
  columns: string[];
  rows: Row[];
  /** Rows changed by the statement (0 for reads). */
  changes: number;
  durationMs: number;
  /** True when rows were cut at the requested limit. */
  truncated: boolean;
}

export interface StatementResult extends QueryResult {
  sql: string;
  /** Set when the statement failed; later statements were not run. */
  error?: string;
}

export interface DbInfo {
  id: string;
  name: string;
  sizeBytes: number;
  createdAt: number;
  updatedAt: number;
}

export interface ColumnInfo {
  cid: number;
  name: string;
  /** Declared type as written in the schema, upper-cased; empty when none. */
  type: string;
  notNull: boolean;
  /** Default value expression as written in the schema, or null. */
  defaultValue: string | null;
  /** 1-based position in the primary key, 0 when not part of it. */
  pk: number;
  /** 0 normal, 1 hidden (virtual table), 2 generated virtual, 3 generated stored. */
  hidden: number;
}

export interface ForeignKey {
  id: number;
  seq: number;
  table: string;
  from: string;
  /** Null when the FK references the parent's primary key implicitly. */
  to: string | null;
  onUpdate: string;
  onDelete: string;
}

export interface IndexInfo {
  name: string;
  unique: boolean;
  /** "c" created by CREATE INDEX, "u" UNIQUE constraint, "pk" PRIMARY KEY. */
  origin: string;
  partial: boolean;
  columns: string[];
  sql: string | null;
}

export type RelationKind = "table" | "view" | "virtual";

export interface RelationInfo {
  name: string;
  kind: RelationKind;
  sql: string | null;
  columns: ColumnInfo[];
  foreignKeys: ForeignKey[];
  indexes: IndexInfo[];
  withoutRowid: boolean;
  strict: boolean;
  /** Name usable to address the rowid (rowid/_rowid_/oid), null when none is available. */
  rowidName: string | null;
  /** True when rows can be edited (ordinary tables with a rowid or primary key). */
  editable: boolean;
}

export interface SchemaObject {
  name: string;
  table: string;
  sql: string | null;
}

export interface Schema {
  tables: RelationInfo[];
  views: RelationInfo[];
  indexes: SchemaObject[];
  triggers: SchemaObject[];
}

/** Identifies one row: by rowid, or by its primary-key values for WITHOUT ROWID tables. */
export type RowKey =
  | { kind: "rowid"; name: string; value: CellValue }
  | { kind: "pk"; values: { column: string; value: CellValue }[] };

export type BootStage = "engine" | "storage" | "ready";

export interface BootProgress {
  stage: BootStage;
  message: string;
}

/**
 * Whether this window holds the database files. Only one window can (the installed app and
 * a browser tab of the site count as two): "released" while this window is in the background,
 * "taken" once another window has claimed them.
 */
export type StorageState = "active" | "released" | "taken";
