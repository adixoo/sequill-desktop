import { describe, expect, test } from "bun:test";
import { highlightLines, type CodeToken } from "./highlight-code";

const typeOf = (line: CodeToken[], text: string) => line.find((t) => t.text === text)?.type;

describe("highlightLines", () => {
  test("colours JSON keys, strings and punctuation, one array per line", () => {
    const lines = highlightLines('{\n  "args": ["mcp"],\n  "on": true\n}\n', "json");
    expect(lines).toHaveLength(4);
    expect(typeOf(lines[1], '"args"')).toBe("property");
    expect(typeOf(lines[1], '"mcp"')).toBe("string");
    expect(typeOf(lines[2], "true")).toBe("number");
    expect(typeOf(lines[0], "{")).toBe("punct");
  });

  test("keeps every character of the code", () => {
    const code = "[mcp_servers.sequill]\ncommand = 'C:\\x.exe'\nargs = ['mcp']";
    const text = highlightLines(code, "toml")
      .map((line) => line.map((t) => t.text).join(""))
      .join("\n");
    expect(text).toBe(code);
  });

  test("splits tokens that span lines", () => {
    const lines = highlightLines("/* a\nb */ select 1", "sql");
    expect(lines).toHaveLength(2);
    expect(lines[0][0]).toEqual({ type: "comment", text: "/* a" });
    expect(lines[1][0]).toEqual({ type: "comment", text: "b */" });
    expect(typeOf(lines[1], "select")).toBe("keyword");
  });

  test("keeps empty lines", () => {
    expect(highlightLines("echo a\n\necho b", "bash")).toHaveLength(3);
  });
});
