import type {
  CellValue,
  Schema,
  DesignPreview,
  DbInfo,
  StatementResult,
  QueryResult,
  SqlStatement,
} from "@/types/lib/sqlite/types";

/** The SQLite API as pages use it. Mirrors the Tauri commands in `src-tauri/src/commands.rs`. */
export interface SqliteApi {
  listDatabases(): Promise<DbInfo[]>;
  createDatabase(name: string, seedSql?: string): Promise<DbInfo>;
  exportDatabase(id: string): Promise<Uint8Array>;
  renameDatabase(id: string, name: string): Promise<DbInfo>;
  deleteDatabase(id: string): Promise<void>;
  open(id: string): Promise<{ info: DbInfo; schema: Schema }>;
  schema(id: string): Promise<Schema>;
  count(id: string, sql: string, params: CellValue[]): Promise<number>;
  query(id: string, sql: string, params?: CellValue[], limit?: number): Promise<QueryResult>;
  execScript(id: string, sql: string, rowLimit: number): Promise<StatementResult[]>;
  explainScript(id: string, sql: string): Promise<StatementResult[]>;
  transaction(id: string, statements: SqlStatement[]): Promise<number>;
  /**
   * Checks a schema design on a copy of the database's structure (no rows); the database
   * itself is untouched. A null id checks a design for a new, empty database.
   */
  previewDesign(id: string | null, statements: string[]): Promise<DesignPreview>;
  /**
   * Saves a schema design in one transaction. With `base` (from `previewDesign`), refuses
   * if the database's structure changed since the design was checked.
   */
  applyDesign(id: string, statements: string[], base?: number | null): Promise<void>;
  insertMany(id: string, sql: string, rows: CellValue[][]): Promise<number>;
  dump(id: string): Promise<string>;
}
