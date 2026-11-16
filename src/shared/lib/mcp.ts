/** Settings that connect an AI assistant to the desktop app's MCP server, and its requests. */
import type { CodeLanguage } from "@/shared/lib/highlight-code";
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

/** The `servers` entry for VS Code's `mcp.json`. */
export function vsCodeConfig(command: McpCommand, allowWrites: boolean): string {
  const entry = { type: "stdio", command: command.command, args: argsFor(command, allowWrites) };
  return JSON.stringify({ servers: { [MCP_SERVER_NAME]: entry } }, null, 2);
}

/** The `context_servers` entry for Zed's `settings.json`. */
export function zedConfig(command: McpCommand, allowWrites: boolean): string {
  const entry = { command: command.command, args: argsFor(command, allowWrites), env: {} };
  return JSON.stringify({ context_servers: { [MCP_SERVER_NAME]: entry } }, null, 2);
}

/** A TOML string: literal (no escapes, so Windows paths stay readable) when it can be. */
function tomlString(value: string): string {
  return /^[^'\n\r]*$/.test(value) ? `'${value}'` : JSON.stringify(value);
}

/** The `[mcp_servers]` table for Codex's `config.toml`. */
export function codexConfig(command: McpCommand, allowWrites: boolean): string {
  const args = argsFor(command, allowWrites).map(tomlString).join(", ");
  return [
    `[mcp_servers.${MCP_SERVER_NAME}]`,
    `command = ${tomlString(command.command)}`,
    `args = [${args}]`,
  ].join("\n");
}

/** One assistant the MCP dialog explains how to connect. */
export interface McpClient {
  id: string;
  name: string;
  kind: "App" | "Editor" | "CLI" | "Any";
  /** What to do, in order. `code` and **bold** are rendered as such. */
  steps: string[];
  /** Title of the code window: the file to edit, or "terminal". */
  fileName: string;
  language: CodeLanguage;
  config(command: McpCommand, allowWrites: boolean): string;
}

/** Every client the dialog lists, in the order shown. */
export const MCP_CLIENTS: McpClient[] = [
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    kind: "App",
    steps: [
      "In Claude Desktop, open **Settings → Developer → Edit Config**.",
      "Add this to `claude_desktop_config.json`, merging it into `mcpServers` if the file has one.",
      "Save the file and restart Claude Desktop.",
    ],
    fileName: "claude_desktop_config.json",
    language: "json",
    config: mcpConfig,
  },
  {
    id: "claude-code",
    name: "Claude Code",
    kind: "CLI",
    steps: [
      "Run this in a terminal.",
      "Start a new Claude Code session and run `/mcp` to check it's connected.",
    ],
    fileName: "terminal",
    language: "bash",
    config: claudeCodeCommand,
  },
  {
    id: "cursor",
    name: "Cursor",
    kind: "Editor",
    steps: [
      "Open `~/.cursor/mcp.json` (**Cursor Settings → Tools & MCP → New MCP Server** opens it).",
      "Add this, merging it into `mcpServers` if the file has one.",
      "Save the file. Use it from the Agent chat.",
    ],
    fileName: "mcp.json",
    language: "json",
    config: mcpConfig,
  },
  {
    id: "vscode",
    name: "VS Code",
    kind: "Editor",
    steps: [
      "Run **MCP: Open User Configuration** from the Command Palette.",
      "Add this to `mcp.json`, merging it into `servers` if the file has one.",
      "Save the file, then use it from Copilot Chat in Agent mode.",
    ],
    fileName: "mcp.json",
    language: "json",
    config: vsCodeConfig,
  },
  {
    id: "windsurf",
    name: "Windsurf",
    kind: "Editor",
    steps: [
      "Open `~/.codeium/windsurf/mcp_config.json` (Cascade's MCP settings can open it too).",
      "Add this, merging it into `mcpServers` if the file has one.",
      "Save the file and refresh the MCP servers in Cascade.",
    ],
    fileName: "mcp_config.json",
    language: "json",
    config: mcpConfig,
  },
  {
    id: "zed",
    name: "Zed",
    kind: "Editor",
    steps: [
      "Run **zed: open settings file** from the Command Palette.",
      "Add this to `settings.json`, merging it into `context_servers` if the file has one.",
      "Save the file. The server shows up in the Agent Panel's settings.",
    ],
    fileName: "settings.json",
    language: "json",
    config: zedConfig,
  },
  {
    id: "jetbrains",
    name: "JetBrains",
    kind: "Editor",
    steps: [
      "Open **Settings → Tools → AI Assistant → Model Context Protocol (MCP)**.",
      "Click **Add**, choose **As JSON** and paste this.",
      "Apply, then use it from AI Assistant's chat.",
    ],
    fileName: "mcp.json",
    language: "json",
    config: mcpConfig,
  },
  {
    id: "codex",
    name: "Codex",
    kind: "CLI",
    steps: [
      "Open `~/.codex/config.toml` (create it if it's missing).",
      "Add this to the end of the file.",
      "Start a new Codex session, in the terminal or the editor extension.",
    ],
    fileName: "config.toml",
    language: "toml",
    config: codexConfig,
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    kind: "CLI",
    steps: [
      "Open `~/.gemini/settings.json`.",
      "Add this, merging it into `mcpServers` if the file has one.",
      "Restart Gemini CLI and run `/mcp` to check it's connected.",
    ],
    fileName: "settings.json",
    language: "json",
    config: mcpConfig,
  },
  {
    id: "other",
    name: "Other clients",
    kind: "Any",
    steps: [
      "Add a stdio MCP server to your client with this command and arguments.",
      "Most clients read this `mcpServers` format. Restart the client after saving.",
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
