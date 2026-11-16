import { describe, expect, test } from "bun:test";
import { toCsv, toJson, toSqlInserts } from "./export";
import { cellPreview, formatBytes, textToValue, typeAffinity, valueKind } from "./format";
import { coerceCell, inferJsonTypes, inferTypes, jsonToTable, normalizeHeader } from "./import";

describe("format", () => {
  test("valueKind", () => {
    expect(valueKind(null)).toBe("null");
    expect(valueKind(3)).toBe("integer");
    expect(valueKind(3.5)).toBe("real");
    expect(valueKind(1n)).toBe("integer");
    expect(valueKind(new Uint8Array(1))).toBe("blob");
    expect(valueKind('{"a":1}')).toBe("json");
    expect(valueKind("{not json}")).toBe("text");
  });

  test("formatBytes and previews", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(cellPreview("a\nb")).toBe("a ⏎ b");
    expect(cellPreview(new Uint8Array(2048))).toBe("BLOB · 2.0 KB");
  });

  test("affinity and textToValue follow SQLite rules", () => {
    expect(typeAffinity("VARCHAR(20)")).toBe("TEXT");
    expect(typeAffinity("BIGINT")).toBe("INTEGER");
    expect(typeAffinity("")).toBe("BLOB");
    expect(typeAffinity("DECIMAL(10,2)")).toBe("NUMERIC");
    expect(textToValue("42", "INTEGER")).toBe(42);
    expect(textToValue("42", "TEXT")).toBe("42");
    expect(textToValue("4.5", "REAL")).toBe(4.5);
    expect(textToValue("abc", "INTEGER")).toBe("abc");
    expect(textToValue("9007199254740993", "INT")).toBe(9007199254740993n);
    expect(textToValue("\\x00ff", "BLOB")).toEqual(new Uint8Array([0, 255]));
  });
});

describe("export", () => {
  const columns = ["id", "note", "data"];
  const rows = [
    [1, 'say "hi", ok', null],
    [2n ** 60n, "line\nbreak", new Uint8Array([104, 105])],
  ];

  test("CSV quotes and escapes", () => {
    expect(toCsv(columns, rows)).toBe(
      'id,note,data\r\n1,"say ""hi"", ok",\r\n1152921504606846976,"line\nbreak",aGk=\r\n',
    );
  });

  test("JSON keeps big integers exact", () => {
    const parsed = JSON.parse(toJson(columns, rows));
    expect(parsed[1]).toEqual({ id: "1152921504606846976", note: "line\nbreak", data: "aGk=" });
  });

  test("SQL inserts", () => {
    expect(toSqlInserts("t", ["a"], [["it's"]])).toBe(`INSERT INTO "t" ("a") VALUES ('it''s');\n`);
  });
});

describe("import", () => {
  test("inferTypes", () => {
    const rows = [
      ["1", "1.5", "007", "x", ""],
      ["2", "2", "8", "", ""],
    ];
    expect(inferTypes(rows, 5)).toEqual(["INTEGER", "REAL", "TEXT", "TEXT", "TEXT"]);
  });

  test("coerceCell", () => {
    expect(coerceCell("", "INTEGER", true)).toBeNull();
    expect(coerceCell("", "TEXT", false)).toBe("");
    expect(coerceCell(" 12 ", "INTEGER", true)).toBe(12);
    expect(coerceCell(undefined, "TEXT", false)).toBeNull();
  });

  test("normalizeHeader dedupes and fills blanks", () => {
    expect(normalizeHeader(["id", " ", "ID", "name"])).toEqual(["id", "column_2", "ID_2", "name"]);
  });

  test("jsonToTable unions keys and flattens nested values", () => {
    const table = jsonToTable([
      { a: 1, b: true },
      { a: 2.5, c: { x: 1 } },
    ]);
    expect(table.columns).toEqual(["a", "b", "c"]);
    expect(table.rows).toEqual([
      [1, 1, null],
      [2.5, null, '{"x":1}'],
    ]);
    expect(inferJsonTypes(table)).toEqual(["REAL", "INTEGER", "TEXT"]);
    expect(() => jsonToTable({})).toThrow();
    expect(() => jsonToTable([1])).toThrow();
  });
});
