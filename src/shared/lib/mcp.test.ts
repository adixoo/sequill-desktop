import { describe, expect, test } from "bun:test";
import { claudeCodeCommand, mcpConfig, showTableView } from "./mcp";

const command = { command: "C:\\Program Files\\Sequill\\sequill.exe", args: ["mcp"] };

describe("mcpConfig", () => {
  test("is read-only unless writes are allowed", () => {
    expect(JSON.parse(mcpConfig(command, false))).toEqual({
      mcpServers: { sequill: { command: command.command, args: ["mcp"] } },
    });
    expect(JSON.parse(mcpConfig(command, true)).mcpServers.sequill.args).toEqual([
      "mcp",
      "--allow-writes",
    ]);
  });

  test("escapes Windows paths as valid JSON", () => {
    expect(mcpConfig(command, false)).toContain('"C:\\\\Program Files\\\\Sequill\\\\sequill.exe"');
  });
});

describe("claudeCodeCommand", () => {
  test("quotes a path with spaces and passes the server's arguments", () => {
    expect(claudeCodeCommand(command, false)).toBe(
      'claude mcp add sequill -- "C:\\Program Files\\Sequill\\sequill.exe" mcp',
    );
    expect(claudeCodeCommand(command, true)).toEndWith(" mcp --allow-writes");
  });

  test("leaves simple paths unquoted", () => {
    const simple = { command: "/Applications/Sequill.app/Contents/MacOS/sequill", args: ["mcp"] };
    expect(claudeCodeCommand(simple, false)).toBe(
      "claude mcp add sequill -- /Applications/Sequill.app/Contents/MacOS/sequill mcp",
    );
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
