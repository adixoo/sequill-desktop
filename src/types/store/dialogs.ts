import type { DbInfo, SqlStatement } from "@/types/lib/sqlite/types";

export type DialogSpec =
  | { kind: "createTable" }
  | { kind: "addColumn"; table: string }
  | { kind: "createIndex"; table: string }
  | { kind: "renameTable"; table: string }
  | { kind: "renameColumn"; table: string; column: string }
  | { kind: "renameDatabase"; dbId: string; name: string }
  | { kind: "newDatabase" }
  | { kind: "mcp" }
  | { kind: "guide" }
  | { kind: "mcpActivity" }
  | { kind: "deleteDatabase"; db: DbInfo }
  | { kind: "import"; file?: File; table?: string }
  | { kind: "ddl"; title: string; sql: string }
  | { kind: "saveQuery"; tabId: string; suggested: string }
  | { kind: "renameSavedQuery"; id: string; name: string }
  | {
      kind: "confirm";
      title: string;
      description: string;
      /** Shown to the user before running; executed in one transaction. */
      statements: SqlStatement[];
      confirmLabel: string;
      success: string;
      schema?: boolean;
      destructive?: boolean;
    };
