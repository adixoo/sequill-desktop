import { describe, expect, test } from "vitest";
import { toCsv, toJson, toSqlInserts } from "@/utils/data/export";
import {
  cellPreview,
  formatBytes,
  textToValue,
  typeAffinity,
  typeKind,
  valueKind,
} from "@/utils/data/format";
import {
  coerceCell,
  inferJsonTypes,
  inferTypes,
  jsonToTable,
  normalizeHeader,
  parseImportText,
} from "@/utils/data/import";

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

  test("typeKind sorts types from any dialect", () => {
    const cases: [string, string][] = [
      ["INTEGER", "number"],
      ["bigserial", "number"],
      ["numeric(10,2)", "number"],
      ["double precision", "number"],
      ["varchar(255)", "text"],
      ["TEXT", "text"],
      ["boolean", "boolean"],
      ["TINYINT(1)", "boolean"],
      ["timestamp with time zone", "date"],
      ["DATETIME2", "date"],
      ["time", "time"],
      ["interval", "time"],
      ["jsonb", "json"],
      ["bytea", "binary"],
      ["BLOB", "binary"],
      ["uuid", "uuid"],
      ["inet", "network"],
      ["text[]", "array"],
      ["point", "other"],
      ["ANY", "other"],
      ["", "other"],
    ];
    for (const [type, kind] of cases) expect([type, typeKind(type)]).toEqual([type, kind]);
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

  test("parseImportText reads CSV, TSV and JSON text", () => {
    expect(parseImportText('name,age\n"Berg, Farah",31\n\n')).toEqual({
      kind: "text",
      rows: [
        ["name", "age"],
        ["Berg, Farah", "31"],
      ],
    });
    // Pasted from a spreadsheet: tab separated.
    expect(parseImportText("a\tb\n1\t2")).toEqual({
      kind: "text",
      rows: [
        ["a", "b"],
        ["1", "2"],
      ],
    });
    // JSON is told by its first character.
    expect(parseImportText(' [{"a":1}]')).toEqual({
      kind: "json",
      columns: ["a"],
      rows: [[1]],
      types: ["INTEGER"],
    });
  });

  test("parseImportText rejects text it can't read", () => {
    expect(() => parseImportText("[not json")).toThrow();
    // A .json file is read as JSON even when it doesn't start with "[".
    expect(() => parseImportText('{"a":1}', true)).toThrow("Expected a JSON array of objects");
  });
});
