import type { SortSpec, FilterOp } from "@/types/lib/sqlite/sql";
import type { CodeLanguage } from "@/types/utils/highlight-code";

/** How an MCP client starts the server: the app itself with `mcp`. */
export interface McpCommand {
  command: string;
  args: string[];
}

/** The switches in the app, plus how to start the server. */
export interface McpStatus extends McpCommand {
  /** Whether assistants may use the databases; the server checks it on every call. */
  enabled: boolean;
  /** Whether they may also change things; checked on every call that changes something. */
  allowChanges: boolean;
  /** A development build: assistants should use the installed app instead. */
  devBuild: boolean;
  /** Days the record of what assistants did is kept; null keeps it forever. */
  historyDays: number | null;
}

/** One call an assistant made over MCP, as the server recorded it. */
export interface McpActivity {
  id: number;
  /** When it was called (ms since the Unix epoch). */
  at: number;
  tool: string;
  databaseId: string | null;
  databaseName: string | null;
  /** The SQL it ran or showed, if any. */
  sql: string | null;
  /** Its other arguments as JSON (table, filters, rows…), if any. */
  details: string | null;
  /** False when the call failed or was refused. */
  ok: boolean;
  /** Why it failed, if it did. */
  message: string | null;
}

/** One assistant the MCP guide explains how to connect. */
export interface McpClient {
  id: string;
  name: string;
  /**
   * "command": one line to paste into a terminal. "file": text to add to a settings file.
   */
  install: "command" | "file";
  /** What to do, in order. `code` and **bold** are rendered as such. */
  steps: string[];
  /** Title of the code window: the file to edit, or "terminal". */
  fileName: string;
  language: CodeLanguage;
  config(command: McpCommand): string;
}

/** A filter as an assistant sends it: values may be numbers, text or lists. */
export interface McpFilter {
  column: string;
  op: FilterOp;
  value?: unknown;
  value2?: unknown;
}

/** What an assistant asked the app to show (sent by `show_in_app` in the MCP server). */
export interface ShowRequest {
  databaseId: string;
  view: "editor" | "table" | "query" | "schema";
  table?: string;
  filters: McpFilter[];
  match: "all" | "any";
  search: string;
  sort: SortSpec[];
  sql?: string;
}
