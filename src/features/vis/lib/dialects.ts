import postgresqlSchemaQuery from "./postgresql-schema.sql?raw";

/**
 * Databases whose schemas the designer imports and exports (desktop app): how to get a
 * schema out of each and the objects it has beside tables. Values are
 * the names `sequill_core::dialects` takes.
 */

export interface Dialect {
  value: string;
  label: string;
  /** How to get the schema out of this database with `command`, in one sentence. */
  howTo: string;
  /** A terminal command that prints it, when there is one. */
  command?: string;
  /** A query that prints it from any SQL editor (no terminal needed), when there is one. */
  query?: string;
  /** Kinds of objects (beside tables) this database has, in the order the outline lists them. */
  objectKinds: readonly ObjectKind[];
}

export type ObjectKind =
  "enum" | "type" | "sequence" | "function" | "procedure" | "view" | "trigger";

/** The databases a schema can be imported from. */
export const IMPORT_DIALECTS: readonly Dialect[] = [
  {
    value: "postgresql",
    label: "PostgreSQL",
    howTo: "Run this in a terminal, then drop the schema.sql it writes.",
    command: "pg_dump --schema-only --no-owner --no-privileges -f schema.sql your_database",
    query: postgresqlSchemaQuery,
    objectKinds: ["enum", "type", "sequence", "function", "procedure", "view", "trigger"],
  },
  {
    value: "mysql",
    label: "MySQL / MariaDB",
    howTo: "Dump the schema with its routines and triggers, without data.",
    command: "mysqldump --no-data --routines --triggers your_database",
    objectKinds: ["function", "procedure", "view", "trigger"],
  },
  {
    value: "mssql",
    label: "SQL Server",
    howTo:
      "In SQL Server Management Studio: right-click the database › Tasks › Generate Scripts › Schema only; or use the sqlpackage command.",
    command: "sqlpackage /Action:Script /SourceDatabaseName:your_database",
    objectKinds: ["type", "sequence", "function", "procedure", "view", "trigger"],
  },
  {
    value: "duckdb",
    label: "DuckDB",
    howTo: "Export the database; schema.sql in the folder it writes holds the schema.",
    command: "EXPORT DATABASE 'schema_export';",
    objectKinds: ["enum", "type", "sequence", "function", "view"],
  },
  {
    value: "sqlite",
    label: "SQLite",
    howTo: "Pick the database file, or paste the output of .schema.",
    command: "sqlite3 your.db .schema",
    objectKinds: [],
  },
];

/** Labels for object kinds in the outline, singular and plural. */
export const OBJECT_KINDS: Record<ObjectKind, { one: string; many: string }> = {
  enum: { one: "Enum", many: "Enums" },
  type: { one: "Type", many: "Types" },
  sequence: { one: "Sequence", many: "Sequences" },
  function: { one: "Function", many: "Functions" },
  procedure: { one: "Procedure", many: "Procedures" },
  view: { one: "View", many: "Views" },
  trigger: { one: "Trigger", many: "Triggers" },
};

/** The import dialect named `value`; undefined for SQLite designs. */
export const dialectOf = (value: string | null | undefined) =>
  IMPORT_DIALECTS.find((d) => d.value === value);

/** Databases the designer can export a schema for. */
export const EXPORT_TARGETS = [
  { value: "postgresql", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL / MariaDB" },
  { value: "mssql", label: "SQL Server" },
  { value: "duckdb", label: "DuckDB" },
  { value: "sqlite", label: "SQLite" },
] as const;

/** Files the schema import accepts: SQL scripts and SQLite databases. */
export const SCHEMA_FILE_ACCEPT = ".sql,.ddl,.txt";

/**
 * A name for a database made from an imported schema: the database the dump itself names
 * (mysqldump's header, the first line of the PostgreSQL query above, CREATE DATABASE, USE,
 * psql's \connect), else the file's name without its extension, else "<database> schema".
 */
export function suggestSchemaName(dialect: Dialect, sql: string, fileName?: string): string {
  const named =
    /^-- (?:Host: .*\b)?Database: (\S+)/m.exec(sql) ??
    /\bCREATE DATABASE (?:IF NOT EXISTS )?[`"[]?([\w$-]+)/i.exec(sql) ??
    /^\s*USE [`"[]?([\w$-]+)/im.exec(sql) ??
    /^\\c(?:onnect)? "?([\w$-]+)/m.exec(sql);
  return named?.[1] || fileName?.replace(/\.[^.]+$/, "") || `${dialect.label} schema`;
}
