/** Settings that connect an AI assistant to the desktop app's MCP server, and its requests. */
import type { CodeLanguage } from "@/utils/highlight-code";
import type { Filter, FilterOp, SortSpec } from "@/lib/sqlite/sql";
import type { TableViewState } from "@/store/workspace";

/** Server name in the client's config; matches the server's own name. */
export const MCP_SERVER_NAME = "sequill";

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

/** How long the history can be kept; null is forever. The first is the default. */
export const MCP_HISTORY_CHOICES: { days: number | null; label: string }[] = [
  { days: 7, label: "1 week" },
  { days: 1, label: "1 day" },
  { days: 30, label: "1 month" },
  { days: 90, label: "3 months" },
  { days: null, label: "Forever" },
];

/** What each MCP tool does, in a word or two, and whether it changes anything. */
const TOOL_LABELS: Record<string, { label: string; changes?: true }> = {
  list_databases: { label: "List databases" },
  get_schema: { label: "Read schema" },
  describe_table: { label: "Describe table" },
  find_rows: { label: "Find rows" },
  query: { label: "Query" },
  explain_query: { label: "Explain" },
  list_saved_queries: { label: "List saved queries" },
  show_in_app: { label: "Show" },
  get_design: { label: "Read design" },
  set_design: { label: "Edit design", changes: true },
  insert_rows: { label: "Insert rows", changes: true },
  update_rows: { label: "Update rows", changes: true },
  delete_rows: { label: "Delete rows", changes: true },
  create_table: { label: "Create table", changes: true },
  alter_table: { label: "Alter table", changes: true },
  drop_object: { label: "Drop", changes: true },
  create_index: { label: "Create index", changes: true },
  create_trigger: { label: "Create trigger", changes: true },
  create_view: { label: "Create view", changes: true },
  create_database: { label: "Create database", changes: true },
  rename_database: { label: "Rename database", changes: true },
  delete_database: { label: "Delete database", changes: true },
  save_query: { label: "Save query", changes: true },
  delete_saved_query: { label: "Delete saved query", changes: true },
  execute: { label: "Execute SQL", changes: true },
};

/** A tool's short label ("Query"), and whether it changes data. Unknown tools keep their name. */
export function describeTool(tool: string): { label: string; changes: boolean } {
  const known = TOOL_LABELS[tool];
  return known
    ? { label: known.label, changes: known.changes ?? false }
    : { label: tool, changes: false };
}

/** A call's short label: "Show query" for show_in_app's views, otherwise the tool's label. */
export function activityLabel(activity: McpActivity): string {
  const { label } = describeTool(activity.tool);
  const view = activityDetails(activity).view;
  return activity.tool === "show_in_app" && typeof view === "string" ? `${label} ${view}` : label;
}

/** A call's other arguments, or {} when there are none or they can't be read. */
export function activityDetails(activity: McpActivity): Record<string, unknown> {
  if (!activity.details) return {};
  try {
    const parsed: unknown = JSON.parse(activity.details);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {}; // clipped by the server's size limit
  }
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** "now", "5m", "3h", or the time of day for anything older than a day. */
export function timeAgo(at: number, now: number): string {
  const minutes = Math.floor((now - at) / MINUTE_MS);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
  return new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** The heading for a call's day: "Today", "Yesterday", or the date. */
export function dayLabel(at: number, now: number): string {
  const startOf = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);
  const days = Math.round((startOf(now) - startOf(at)) / DAY_MS);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Date(at).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** The `mcpServers` entry for Claude Desktop and other clients configured with JSON. */
export function mcpConfig(command: McpCommand): string {
  const entry = { command: command.command, args: command.args };
  return JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: entry } }, null, 2);
}

/** Quotes an argument for a terminal when it has spaces or quotes. */
function shellArg(arg: string): string {
  return /^[\w@%+=:,./\\-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '\\"')}"`;
}

/** The server's command line, quoted for a terminal. */
function commandLine(command: McpCommand): string {
  return [command.command, ...command.args].map(shellArg).join(" ");
}

/** Adds the server to Claude Code for every project (user scope). */
export function claudeCodeCommand(command: McpCommand): string {
  return `claude mcp add --scope user ${MCP_SERVER_NAME} -- ${commandLine(command)}`;
}

/** Adds the server to Codex (its global `config.toml`). */
export function codexCommand(command: McpCommand): string {
  return `codex mcp add ${MCP_SERVER_NAME} -- ${commandLine(command)}`;
}

/** Adds the server to Gemini CLI for every project (user scope). */
export function geminiCommand(command: McpCommand): string {
  return `gemini mcp add --scope user ${MCP_SERVER_NAME} ${commandLine(command)}`;
}

/** The `servers` entry for VS Code's `mcp.json`. */
export function vsCodeConfig(command: McpCommand): string {
  const entry = { type: "stdio", command: command.command, args: command.args };
  return JSON.stringify({ servers: { [MCP_SERVER_NAME]: entry } }, null, 2);
}

/** The `context_servers` entry for Zed's `settings.json`. */
export function zedConfig(command: McpCommand): string {
  const entry = { command: command.command, args: command.args, env: {} };
  return JSON.stringify({ context_servers: { [MCP_SERVER_NAME]: entry } }, null, 2);
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

/** Steps for clients set up with one terminal command. */
const commandSteps = (app: string, check: string): string[] => [
  "Open a terminal (on Windows: **PowerShell** or **Command Prompt**).",
  "Paste this command and press **Enter**.",
  `Start a new ${app} session. ${check}`,
];

/** Every client the guide lists, in the order shown. */
export const MCP_CLIENTS: McpClient[] = [
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    install: "file",
    steps: [
      "In Claude Desktop, open **Settings → Developer** and click **Edit Config**. A folder opens with `claude_desktop_config.json` in it.",
      "Open that file in Notepad. If it's empty, paste this in. If it already has `mcpServers`, add only the `sequill` part inside it.",
      "Save the file, then quit Claude Desktop completely (also from the system tray) and open it again.",
    ],
    fileName: "claude_desktop_config.json",
    language: "json",
    config: mcpConfig,
  },
  {
    id: "claude-code",
    name: "Claude Code",
    install: "command",
    steps: commandSteps("Claude Code", "Type `/mcp` to see that **sequill** is connected."),
    fileName: "terminal",
    language: "bash",
    config: claudeCodeCommand,
  },
  {
    id: "cursor",
    name: "Cursor",
    install: "file",
    steps: [
      "Open **Cursor Settings → Tools & MCP** and click **New MCP Server**. Cursor opens `mcp.json`.",
      "Paste this in. If the file already has `mcpServers`, add only the `sequill` part inside it.",
      "Save the file. Sequill's tools work in the Agent chat.",
    ],
    fileName: "mcp.json",
    language: "json",
    config: mcpConfig,
  },
  {
    id: "vscode",
    name: "VS Code",
    install: "file",
    steps: [
      "Press **Ctrl+Shift+P** (Cmd+Shift+P on a Mac) and run **MCP: Open User Configuration**.",
      "Paste this into `mcp.json`. If it already has `servers`, add only the `sequill` part inside it.",
      "Save the file, then use Copilot Chat in **Agent** mode.",
    ],
    fileName: "mcp.json",
    language: "json",
    config: vsCodeConfig,
  },
  {
    id: "codex",
    name: "Codex",
    install: "command",
    steps: commandSteps("Codex", "Type `/mcp` to see that **sequill** is listed."),
    fileName: "terminal",
    language: "bash",
    config: codexCommand,
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    install: "command",
    steps: commandSteps("Gemini CLI", "Type `/mcp` to see that **sequill** is connected."),
    fileName: "terminal",
    language: "bash",
    config: geminiCommand,
  },
  {
    id: "windsurf",
    name: "Windsurf",
    install: "file",
    steps: [
      "Open `~/.codeium/windsurf/mcp_config.json` (Cascade's MCP settings can open it).",
      "Paste this in. If the file already has `mcpServers`, add only the `sequill` part inside it.",
      "Save the file and refresh the MCP servers in Cascade.",
    ],
    fileName: "mcp_config.json",
    language: "json",
    config: mcpConfig,
  },
  {
    id: "zed",
    name: "Zed",
    install: "file",
    steps: [
      "Run **zed: open settings file** from the Command Palette.",
      "Add this to `settings.json`. If it already has `context_servers`, add only the `sequill` part inside it.",
      "Save the file. Sequill shows up in the Agent Panel's settings.",
    ],
    fileName: "settings.json",
    language: "json",
    config: zedConfig,
  },
  {
    id: "jetbrains",
    name: "JetBrains IDEs",
    install: "file",
    steps: [
      "Open **Settings → Tools → AI Assistant → Model Context Protocol (MCP)**.",
      "Click **Add**, choose **As JSON** and paste this.",
      "Click **Apply**, then use AI Assistant's chat.",
    ],
    fileName: "mcp.json",
    language: "json",
    config: mcpConfig,
  },
  {
    id: "other",
    name: "Another assistant",
    install: "file",
    steps: [
      "Find your assistant's MCP settings and add a **stdio** server.",
      "Most assistants accept this `mcpServers` format. Others ask for the command and arguments separately: they're the two values below.",
      "Save, and restart the assistant.",
    ],
    fileName: "mcp settings",
    language: "json",
    config: mcpConfig,
  },
];

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
