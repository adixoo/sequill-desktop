/** Builders for schema changes. Each returns SQL that the UI previews before running. */
import { quoteIdent, sqlLiteral } from "./sql";

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

export function emptyColumn(name = ""): ColumnDef {
  return {
    name,
    type: "TEXT",
    primaryKey: false,
    autoincrement: false,
    notNull: false,
    unique: false,
    defaultKind: "none",
    defaultValue: "",
    references: null,
  };
}

function defaultClause(col: ColumnDef): string {
  switch (col.defaultKind) {
    case "none":
      return "";
    case "null":
      return " DEFAULT NULL";
    case "text":
      return ` DEFAULT ${sqlLiteral(col.defaultValue)}`;
    case "number": {
      const n = Number(col.defaultValue);
      if (col.defaultValue.trim() === "" || !Number.isFinite(n)) {
        throw new Error(`Default for "${col.name}" is not a number`);
      }
      return ` DEFAULT ${col.defaultValue.trim()}`;
    }
    case "expression":
      if (!col.defaultValue.trim())
        throw new Error(`Default expression for "${col.name}" is empty`);
      return ` DEFAULT (${col.defaultValue.trim()})`;
  }
}

/** Column definition as used in CREATE TABLE and ALTER TABLE ADD COLUMN. */
export function columnSql(col: ColumnDef, inlinePrimaryKey: boolean): string {
  if (!col.name.trim()) throw new Error("Every column needs a name");
  let sql = quoteIdent(col.name.trim());
  if (col.type.trim()) sql += ` ${col.type.trim().toUpperCase()}`;
  if (inlinePrimaryKey && col.primaryKey) {
    sql += " PRIMARY KEY";
    if (col.autoincrement) sql += " AUTOINCREMENT";
  }
  if (col.notNull) sql += " NOT NULL";
  if (col.unique && !col.primaryKey) sql += " UNIQUE";
  sql += defaultClause(col);
  if (col.references?.table) {
    sql += ` REFERENCES ${quoteIdent(col.references.table)}`;
    if (col.references.column) sql += `(${quoteIdent(col.references.column)})`;
    if (col.references.onDelete && col.references.onDelete !== "NO ACTION") {
      sql += ` ON DELETE ${col.references.onDelete}`;
    }
  }
  return sql;
}

export function buildCreateTable(def: TableDef): string {
  const name = def.name.trim();
  if (!name) throw new Error("The table needs a name");
  if (def.columns.length === 0) throw new Error("Add at least one column");
  const names = def.columns.map((c) => c.name.trim().toLowerCase());
  const duplicate = names.find((n, i) => names.indexOf(n) !== i);
  if (duplicate) throw new Error(`Column "${duplicate}" appears twice`);

  const pkColumns = def.columns.filter((c) => c.primaryKey);
  if (def.withoutRowid && pkColumns.length === 0) {
    throw new Error("WITHOUT ROWID tables need a primary key");
  }
  const autoincrement = pkColumns.find((c) => c.autoincrement);
  if (autoincrement) {
    if (pkColumns.length > 1) throw new Error("AUTOINCREMENT needs a single-column primary key");
    if (autoincrement.type.trim().toUpperCase() !== "INTEGER") {
      throw new Error("AUTOINCREMENT only works on an INTEGER primary key");
    }
    if (def.withoutRowid) throw new Error("AUTOINCREMENT is not allowed on WITHOUT ROWID tables");
  }
  const inlinePk = pkColumns.length === 1;
  const lines = def.columns.map((c) => `  ${columnSql(c, inlinePk)}`);
  if (pkColumns.length > 1) {
    lines.push(`  PRIMARY KEY (${pkColumns.map((c) => quoteIdent(c.name.trim())).join(", ")})`);
  }
  const options = [def.withoutRowid && "WITHOUT ROWID", def.strict && "STRICT"].filter(Boolean);
  return (
    `CREATE TABLE ${def.ifNotExists ? "IF NOT EXISTS " : ""}${quoteIdent(name)} (\n${lines.join(",\n")}\n)` +
    (options.length > 0 ? ` ${options.join(", ")}` : "") +
    ";"
  );
}

export function buildRenameTable(from: string, to: string): string {
  if (!to.trim()) throw new Error("The new name is empty");
  return `ALTER TABLE ${quoteIdent(from)} RENAME TO ${quoteIdent(to.trim())};`;
}

export function buildDrop(kind: "table" | "view" | "index" | "trigger", name: string): string {
  return `DROP ${kind.toUpperCase()} ${quoteIdent(name)};`;
}

export function buildAddColumn(table: string, col: ColumnDef): string {
  if (col.primaryKey)
    throw new Error("SQLite cannot add a PRIMARY KEY column to an existing table");
  if (col.unique) throw new Error("SQLite cannot add a UNIQUE column; add a unique index instead");
  if (col.notNull && col.defaultKind === "none") {
    throw new Error("A NOT NULL column needs a default value");
  }
  return `ALTER TABLE ${quoteIdent(table)} ADD COLUMN ${columnSql(col, false)};`;
}

export function buildRenameColumn(table: string, from: string, to: string): string {
  if (!to.trim()) throw new Error("The new name is empty");
  return `ALTER TABLE ${quoteIdent(table)} RENAME COLUMN ${quoteIdent(from)} TO ${quoteIdent(to.trim())};`;
}

export function buildDropColumn(table: string, column: string): string {
  return `ALTER TABLE ${quoteIdent(table)} DROP COLUMN ${quoteIdent(column)};`;
}

export interface IndexDef {
  name: string;
  table: string;
  columns: { name: string; desc: boolean }[];
  unique: boolean;
  where?: string;
}

export function buildCreateIndex(def: IndexDef): string {
  if (!def.name.trim()) throw new Error("The index needs a name");
  if (def.columns.length === 0) throw new Error("Pick at least one column");
  const cols = def.columns.map((c) => `${quoteIdent(c.name)}${c.desc ? " DESC" : ""}`).join(", ");
  const where = def.where?.trim() ? ` WHERE ${def.where.trim()}` : "";
  return `CREATE ${def.unique ? "UNIQUE " : ""}INDEX ${quoteIdent(def.name.trim())} ON ${quoteIdent(def.table)} (${cols})${where};`;
}
