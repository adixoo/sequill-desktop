/** Settings that connect an AI assistant to the desktop app's MCP server, and its requests. */
import type { Filter, FilterOp, SortSpec } from "@/shared/lib/sqlite/sql";
import type { TableViewState } from "@/shared/lib/store/workspace";

/** Server name in the client's config; matches the server's own name. */
export const MCP_SERVER_NAME = "sequill";

/** How an MCP client starts the server: the app itself with `mcp`. */
export interface McpCommand {
  command: string;
  args: string[];
}

/** The switch in the app, plus how to start the server. */
export interface McpStatus extends McpCommand {
  /** Whether assistants may use the databases; the server checks it on every call. */
  enabled: boolean;
}

function argsFor(command: McpCommand, allowWrites: boolean): string[] {
  return allowWrites ? [...command.args, "--allow-writes"] : command.args;
}

/** The `mcpServers` entry for Claude Desktop and other clients configured with JSON. */
export function mcpConfig(command: McpCommand, allowWrites: boolean): string {
  const entry = { command: command.command, args: argsFor(command, allowWrites) };
  return JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: entry } }, null, 2);
}

/** Quotes an argument for a terminal when it has spaces or quotes. */
function shellArg(arg: string): string {
  return /^[\w@%+=:,./\\-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '\\"')}"`;
}

/** The command that adds the server to Claude Code. */
export function claudeCodeCommand(command: McpCommand, allowWrites: boolean): string {
  const parts = [command.command, ...argsFor(command, allowWrites)].map(shellArg);
  return `claude mcp add ${MCP_SERVER_NAME} -- ${parts.join(" ")}`;
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
  view: "table" | "query" | "schema";
  table?: string;
  filters: McpFilter[];
  match: "all" | "any";
  search: string;
  sort: SortSpec[];
  sql?: string;
}

/** A filter value as the filter builder's text (lists become "a, b"). */
function filterText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
  return String(value);
}

/** The editor's table view settings for a request to show a table. */
export function showTableView(request: ShowRequest, makeId: () => string): Partial<TableViewState> {
  const filters: Filter[] = request.filters.map((f) => ({
    id: makeId(),
    column: f.column,
    op: f.op,
    value: filterText(f.value),
    value2: filterText(f.value2),
  }));
  return {
    filters,
    match: request.match === "any" ? "or" : "and",
    search: request.search,
    sort: request.sort,
    page: 0,
    mode: "data",
  };
}
