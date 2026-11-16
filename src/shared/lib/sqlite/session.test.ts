import { describe, expect, test } from "bun:test";
import {
  buildAddColumn,
  buildCreateIndex,
  buildCreateTable,
  buildDropColumn,
  buildRenameColumn,
  buildRenameTable,
  emptyColumn,
} from "./ddl";
import { splitStatements } from "./split";
import { memorySession } from "./test-utils";

const SAMPLE = `
  CREATE TABLE artist (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
  CREATE TABLE album (
    id INTEGER PRIMARY KEY, title TEXT, artist_id INTEGER REFERENCES artist(id) ON DELETE CASCADE,
    cover BLOB, price REAL DEFAULT 9.99
  );
  CREATE INDEX album_artist ON album(artist_id);
  CREATE VIEW album_names AS SELECT title FROM album;
  CREATE TRIGGER album_title AFTER INSERT ON album BEGIN UPDATE album SET title = trim(new.title) WHERE id = new.id; END;
  CREATE TABLE "odd ""name""" (rowid TEXT, _rowid_ TEXT, value TEXT);
  INSERT INTO artist (name) VALUES ('Nina'), ('Miles');
  INSERT INTO album (title, artist_id, cover) VALUES (' Kind of Blue ', 2, x'cafe'), ('Pastel Blues', 1, NULL);
  INSERT INTO "odd ""name""" VALUES ('r', 'u', 'it''s');
`;

describe("splitStatements", () => {
  test("respects strings, comments and trigger bodies", async () => {
    const s = await memorySession();
    const parts = splitStatements(
      `SELECT ';' AS a; -- note; here
       CREATE TRIGGER t AFTER INSERT ON x BEGIN SELECT 1; SELECT 2; END;
       /* only a comment; */
       SELECT 3`,
      (sql) => s.isComplete(sql),
    );
    expect(parts).toHaveLength(3);
    expect(parts[1]).toContain("END;");
    expect(parts[2]).toContain("SELECT 3");
  });
});

describe("SqliteSession", () => {
  test("execScript reports each statement and stops at the first error", async () => {
    const s = await memorySession();
    const results = s.execScript(
      "CREATE TABLE t(a); INSERT INTO t VALUES (1),(2); SELECT * FROM t; SELECT * FROM nope; SELECT 1;",
      100,
    );
    expect(results).toHaveLength(4);
    expect(results[1].changes).toBe(2);
    expect(results[2].rows).toEqual([[1], [2]]);
    expect(results[3].error).toContain("no such table");
  });

  test("explainScript plans every statement without running it", async () => {
    const s = await memorySession("CREATE TABLE t(a);");
    const plans = s.explainScript(
      "SELECT * FROM t WHERE a = 1; DELETE FROM t; SELECT * FROM nope;",
    );
    expect(plans).toHaveLength(3);
    expect(plans[0].columns).toContain("detail");
    expect(plans[2].error).toContain("no such table");
    expect(s.count("SELECT count(*) FROM t", [])).toBe(0);
  });

  test("query honours the row limit", async () => {
    const s = await memorySession("CREATE TABLE t(a); INSERT INTO t VALUES (1),(2),(3);");
    const r = s.query("SELECT a FROM t", [], 2);
    expect(r.rows).toHaveLength(2);
    expect(r.truncated).toBe(true);
  });

  test("transaction rolls back on error", async () => {
    const s = await memorySession("CREATE TABLE t(a UNIQUE);");
    expect(() =>
      s.transaction([
        { sql: "INSERT INTO t VALUES (?)", params: [1] },
        { sql: "INSERT INTO t VALUES (?)", params: [1] },
      ]),
    ).toThrow();
    expect(s.count("SELECT count(*) FROM t", [])).toBe(0);
  });

  test("insertMany inserts in one transaction", async () => {
    const s = await memorySession("CREATE TABLE t(a, b);");
    const rows = Array.from({ length: 500 }, (_, i) => [i, `v${i}`]);
    expect(s.insertMany("INSERT INTO t VALUES (?, ?)", rows)).toBe(500);
    expect(s.count("SELECT count(*) FROM t", [])).toBe(500);
  });
});

describe("schema introspection", () => {
  test("reads tables, views, indexes, triggers, keys and row identity", async () => {
    const s = await memorySession(SAMPLE);
    const schema = s.schema();
    expect(schema.tables.map((t) => t.name)).toEqual([
      "album",
      "artist",
      'odd "name"',
      "sqlite_sequence",
    ]);
    const album = schema.tables.find((t) => t.name === "album")!;
    expect(album.columns.map((c) => c.name)).toEqual([
      "id",
      "title",
      "artist_id",
      "cover",
      "price",
    ]);
    expect(album.columns[0].pk).toBe(1);
    expect(album.columns[4].defaultValue).toBe("9.99");
    expect(album.foreignKeys[0]).toMatchObject({
      table: "artist",
      from: "artist_id",
      to: "id",
      onDelete: "CASCADE",
    });
    expect(album.indexes.map((i) => i.name)).toEqual(["album_artist"]);
    expect(album.rowidName).toBe("rowid");
    expect(album.editable).toBe(true);

    const odd = schema.tables.find((t) => t.name === 'odd "name"')!;
    expect(odd.rowidName).toBe("oid");

    expect(schema.views[0]).toMatchObject({ name: "album_names", kind: "view", editable: false });
    expect(schema.indexes.map((i) => i.name)).toEqual(["album_artist"]);
    expect(schema.triggers.map((t) => t.name)).toEqual(["album_title"]);
  });
});

describe("dump", () => {
  test("round-trips schema and data into a fresh database", async () => {
    const source = await memorySession(SAMPLE);
    const dump = source.dump();
    expect(dump.startsWith("PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;")).toBe(true);

    const copy = await memorySession(dump);
    for (const table of ["artist", "album", '"odd ""name"""']) {
      const sql = `SELECT * FROM ${table} ORDER BY 1`;
      expect(copy.query(sql).rows).toEqual(source.query(sql).rows);
    }
    expect(copy.query("SELECT seq FROM sqlite_sequence WHERE name = 'artist'").rows[0][0]).toBe(2);
    expect(copy.schema().triggers).toHaveLength(1);
    expect(copy.schema().views).toHaveLength(1);
  });
});

describe("DDL builders run on SQLite", () => {
  test("create, alter and index a table", async () => {
    const s = await memorySession("CREATE TABLE parent (id INTEGER PRIMARY KEY);");
    const id = { ...emptyColumn("id"), type: "INTEGER", primaryKey: true, autoincrement: true };
    const name = {
      ...emptyColumn("full name"),
      notNull: true,
      defaultKind: "text" as const,
      defaultValue: "it's",
    };
    const parent = {
      ...emptyColumn("parent_id"),
      type: "INTEGER",
      references: { table: "parent", column: "id", onDelete: "CASCADE" },
    };
    s.db.exec(
      buildCreateTable({
        name: "child",
        columns: [id, name, parent],
        withoutRowid: false,
        strict: true,
      }),
    );
    s.db.exec("INSERT INTO child DEFAULT VALUES");
    expect(s.query('SELECT "full name" FROM child').rows[0][0]).toBe("it's");

    s.db.exec(
      buildAddColumn("child", {
        ...emptyColumn("score"),
        type: "REAL",
        defaultKind: "number",
        defaultValue: "1.5",
      }),
    );
    s.db.exec(buildRenameColumn("child", "score", "points"));
    s.db.exec(
      buildCreateIndex({
        name: "child_points",
        table: "child",
        columns: [{ name: "points", desc: true }],
        unique: false,
      }),
    );
    s.db.exec("DROP INDEX child_points");
    s.db.exec(buildDropColumn("child", "points"));
    s.db.exec(buildRenameTable("child", "kid"));
    const kid = s.schema().tables.find((t) => t.name === "kid")!;
    expect(kid.strict).toBe(true);
    expect(kid.columns.map((c) => c.name)).toEqual(["id", "full name", "parent_id"]);
  });

  test("validates invalid definitions", () => {
    expect(() =>
      buildCreateTable({
        name: "",
        columns: [emptyColumn("a")],
        withoutRowid: false,
        strict: false,
      }),
    ).toThrow();
    expect(() =>
      buildCreateTable({
        name: "t",
        columns: [emptyColumn("a"), emptyColumn("A")],
        withoutRowid: false,
        strict: false,
      }),
    ).toThrow("appears twice");
    expect(() =>
      buildCreateTable({
        name: "t",
        columns: [emptyColumn("a")],
        withoutRowid: true,
        strict: false,
      }),
    ).toThrow("primary key");
    expect(() => buildAddColumn("t", { ...emptyColumn("a"), notNull: true })).toThrow("default");
    const composite = [
      { ...emptyColumn("a"), primaryKey: true },
      { ...emptyColumn("b"), primaryKey: true },
    ];
    expect(
      buildCreateTable({ name: "t", columns: composite, withoutRowid: true, strict: false }),
    ).toContain('PRIMARY KEY ("a", "b")');
  });
});
