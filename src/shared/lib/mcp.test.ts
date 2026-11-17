import { describe, expect, test } from "bun:test";
import {
  claudeCodeCommand,
  codexCommand,
  geminiCommand,
  MCP_CLIENTS,
  mcpConfig,
  showTableView,
  vsCodeConfig,
  zedConfig,
} from "./mcp";

const command = { command: "C:\\Program Files\\Sequill\\sequill.exe", args: ["mcp"] };

describe("mcpConfig", () => {
  test("starts the app with mcp, and nothing else to set: the app decides what's allowed", () => {
    expect(JSON.parse(mcpConfig(command))).toEqual({
      mcpServers: { sequill: { command: command.command, args: ["mcp"] } },
    });
  });

  test("escapes Windows paths as valid JSON", () => {
    expect(mcpConfig(command)).toContain('"C:\\\\Program Files\\\\Sequill\\\\sequill.exe"');
  });
});

describe("install commands", () => {
  test("Claude Code: for every project, with a quoted path", () => {
    expect(claudeCodeCommand(command)).toBe(
      'claude mcp add --scope user sequill -- "C:\\Program Files\\Sequill\\sequill.exe" mcp',
    );
  });

  test("Codex and Gemini CLI", () => {
    expect(codexCommand(command)).toBe(
      'codex mcp add sequill -- "C:\\Program Files\\Sequill\\sequill.exe" mcp',
    );
    expect(geminiCommand(command)).toBe(
      'gemini mcp add --scope user sequill "C:\\Program Files\\Sequill\\sequill.exe" mcp',
    );
  });

  test("leaves simple paths unquoted", () => {
    const simple = { command: "/Applications/Sequill.app/Contents/MacOS/sequill", args: ["mcp"] };
    expect(claudeCodeCommand(simple)).toBe(
      "claude mcp add --scope user sequill -- /Applications/Sequill.app/Contents/MacOS/sequill mcp",
    );
  });
});

describe("other clients' configs", () => {
  test("VS Code uses a stdio entry under servers", () => {
    expect(JSON.parse(vsCodeConfig(command))).toEqual({
      servers: { sequill: { type: "stdio", command: command.command, args: ["mcp"] } },
    });
  });

  test("Zed uses context_servers", () => {
    expect(JSON.parse(zedConfig(command))).toEqual({
      context_servers: { sequill: { command: command.command, args: ["mcp"], env: {} } },
    });
  });

  test("every client has a unique id, steps, and a command or parsable JSON", () => {
    expect(new Set(MCP_CLIENTS.map((c) => c.id)).size).toBe(MCP_CLIENTS.length);
    for (const client of MCP_CLIENTS) {
      expect(client.steps.length).toBeGreaterThan(0);
      const code = client.config(command);
      if (client.install === "command") {
        expect(code).toContain('"C:\\Program Files\\Sequill\\sequill.exe" mcp');
        expect(code).not.toContain("--allow-writes");
      } else if (client.language === "json") {
        expect(() => JSON.parse(code)).not.toThrow();
      }
    }
  });
});

describe("showTableView", () => {
  test("turns an assistant's filters into the filter builder's", () => {
    let n = 0;
    const view = showTableView(
      {
        databaseId: "db",
        view: "table",
        table: "orders",
        filters: [
          { column: "total", op: "between", value: 10, value2: "20" },
          { column: "status", op: "in", value: ["paid", "sent"] },
          { column: "note", op: "null" },
        ],
        match: "any",
        search: "x",
        sort: [{ column: "total", desc: true }],
      },
      () => `f${++n}`,
    );
    expect(view.filters).toEqual([
      { id: "f1", column: "total", op: "between", value: "10", value2: "20" },
      { id: "f2", column: "status", op: "in", value: "paid, sent", value2: undefined },
      { id: "f3", column: "note", op: "null", value: undefined, value2: undefined },
    ]);
    expect(view).toMatchObject({ match: "or", search: "x", page: 0, mode: "data" });
    expect(view.sort).toEqual([{ column: "total", desc: true }]);
  });
});
