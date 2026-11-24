export type DefaultKind = "none" | "null" | "text" | "number" | "expression";

export interface ColumnDef {
  name: string;
  type: string;
  primaryKey: boolean;
  autoincrement: boolean;
  notNull: boolean;
  unique: boolean;
  defaultKind: DefaultKind;
  defaultValue: string;
  references?: { table: string; column: string; onDelete: string } | null;
}

export interface TableDef {
  name: string;
  columns: ColumnDef[];
  withoutRowid: boolean;
  strict: boolean;
  ifNotExists?: boolean;
}

export interface IndexDef {
  name: string;
  table: string;
  columns: { name: string; desc: boolean }[];
  unique: boolean;
  where?: string;
}
