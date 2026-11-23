/**
 * Databases whose schemas the designer reads and writes (desktop app). Values are the
 * names `sequill_core::dialects` takes.
 */

/** SQL scripts the designer can import a schema from. */
export const IMPORT_DIALECTS = [
  { value: "postgresql", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL / MariaDB" },
  { value: "mssql", label: "SQL Server" },
  { value: "oracle", label: "Oracle" },
  { value: "sqlite", label: "SQLite" },
  { value: "generic", label: "Other (standard SQL)" },
] as const;

/** Databases the designer can export a schema for. */
export const EXPORT_TARGETS = [
  { value: "postgresql", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL / MariaDB" },
  { value: "mssql", label: "SQL Server" },
  { value: "sqlite", label: "SQLite" },
] as const;

/** Files the schema import accepts: SQL scripts and SQLite databases. */
export const SCHEMA_FILE_ACCEPT = ".sql,.ddl,.txt";
