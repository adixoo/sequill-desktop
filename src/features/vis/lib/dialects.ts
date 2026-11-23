/**
 * Databases whose schemas the designer imports and exports (desktop app): how to get a
 * schema out of each, its data types, and the objects it has beside tables. Values are
 * the names `sequill_core::dialects` takes.
 */

export interface Dialect {
  value: string;
  label: string;
  /** How to get the schema out of this database, in one sentence. */
  howTo: string;
  /** A command that prints it, when there is one. */
  command?: string;
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
    howTo: "Dump the schema without data and paste it, or pick the .sql file.",
    command: "pg_dump --schema-only --no-owner your_database",
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

/** Common data types of each database, offered in the column editor (any type can be typed). */
export const DIALECT_TYPES: Record<string, readonly string[]> = {
  postgresql: [
    "integer",
    "bigint",
    "smallint",
    "serial",
    "bigserial",
    "numeric(10,2)",
    "real",
    "double precision",
    "boolean",
    "text",
    "varchar(255)",
    "char(1)",
    "uuid",
    "date",
    "time",
    "timestamp",
    "timestamptz",
    "interval",
    "json",
    "jsonb",
    "bytea",
    "inet",
    "integer[]",
    "text[]",
  ],
  mysql: [
    "INT",
    "BIGINT",
    "SMALLINT",
    "TINYINT(1)",
    "DECIMAL(10,2)",
    "FLOAT",
    "DOUBLE",
    "BOOLEAN",
    "VARCHAR(255)",
    "CHAR(1)",
    "TEXT",
    "LONGTEXT",
    "DATE",
    "DATETIME",
    "TIMESTAMP",
    "TIME",
    "JSON",
    "BLOB",
    "ENUM('a','b')",
    "SET('a','b')",
  ],
  mssql: [
    "INT",
    "BIGINT",
    "SMALLINT",
    "TINYINT",
    "BIT",
    "DECIMAL(10,2)",
    "MONEY",
    "FLOAT",
    "NVARCHAR(255)",
    "NVARCHAR(MAX)",
    "VARCHAR(255)",
    "CHAR(1)",
    "DATE",
    "DATETIME2",
    "DATETIMEOFFSET",
    "TIME",
    "UNIQUEIDENTIFIER",
    "VARBINARY(MAX)",
    "XML",
  ],
  duckdb: [
    "INTEGER",
    "BIGINT",
    "HUGEINT",
    "SMALLINT",
    "DOUBLE",
    "DECIMAL(10,2)",
    "BOOLEAN",
    "VARCHAR",
    "DATE",
    "TIME",
    "TIMESTAMP",
    "TIMESTAMPTZ",
    "INTERVAL",
    "UUID",
    "JSON",
    "BLOB",
    "VARCHAR[]",
    "STRUCT(a INTEGER)",
    "MAP(VARCHAR, INTEGER)",
  ],
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
