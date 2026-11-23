/**
 * A schema imported from another database (here PostgreSQL): exact data types, and enums,
 * functions and triggers kept beside the tables, designed on and saved like tables.
 */
import { describe, expect, test } from "vitest";
import { emptyColumn, sqliteTypeName } from "@/lib/sqlite/ddl";
import {
  changeDetails,
  currentObjects,
  draftStatements,
  EMPTY_DRAFT,
  enumValues,
  newDatabaseStatements,
  objectKey,
  objectsTableStatements,
  setAddedColumns,
  setObject,
  validateDraft,
} from "@/features/vis/lib/model";
import { memorySession } from "../../helpers/sqlite";

const OBJECTS = [
  { kind: "enum", name: "mood", table: null, body: '["sad","happy"]' },
  {
    kind: "function",
    name: "stamp",
    table: null,
    body: "CREATE FUNCTION stamp() RETURNS trigger AS $$ BEGIN RETURN NEW; END $$ LANGUAGE plpgsql",
  },
  {
    kind: "trigger",
    name: "ticket_stamp",
    table: "ticket",
    body: "CREATE TRIGGER ticket_stamp BEFORE INSERT ON ticket FOR EACH ROW EXECUTE FUNCTION stamp()",
  },
];

async function imported() {
  const s = await memorySession(
    [
      `CREATE TABLE ticket (id integer PRIMARY KEY, feeling mood NOT NULL, tags ${sqliteTypeName("text[]")}, kind ${sqliteTypeName("ENUM('a','b')")});`,
      ...objectsTableStatements("postgresql", OBJECTS),
    ].join("\n"),
  );
  return { s, schema: s.schema() };
}

describe("a schema imported from another database", () => {
  test("keeps its database type, exact column types and objects, and hides where they live", async () => {
    const { schema } = await imported();
    expect(schema.dialect).toBe("postgresql");
    expect(schema.tables.map((t) => t.name)).toEqual(["ticket"]);
    // SQLite itself reports a row-id column ("integer PRIMARY KEY") as INTEGER.
    expect(schema.tables[0].columns.map((c) => c.type)).toEqual([
      "INTEGER",
      "mood",
      "text[]",
      "ENUM('a','b')",
    ]);
    expect(schema.objects.map(objectKey)).toEqual([
      "enum:mood",
      "function:stamp",
      "trigger:ticket_stamp",
    ]);
    expect(enumValues(schema.objects[0])).toEqual(["sad", "happy"]);
  });

  test("saves edited, new and deleted objects with the tables, and lists them before saving", async () => {
    const { s, schema } = await imported();
    let draft = setObject(EMPTY_DRAFT, "enum:mood", {
      ...schema.objects[0],
      body: JSON.stringify(["sad", "ok", "happy"]),
    });
    draft = setObject(draft, "trigger:ticket_stamp", null);
    draft = setObject(draft, "view:sad", {
      kind: "view",
      name: "sad",
      table: null,
      body: "CREATE VIEW sad AS SELECT * FROM ticket WHERE feeling = 'sad'",
    });
    draft = setAddedColumns(draft, "ticket", [{ ...emptyColumn("at"), type: "timestamptz" }]);

    expect(validateDraft(schema, draft)).toEqual([]);
    expect(changeDetails(schema, draft)).toEqual([
      '"ticket": new column "at" (timestamptz)',
      'Enum "mood": values sad, ok, happy',
      'Trigger "ticket_stamp" deleted',
      'New view "sad"',
    ]);
    expect(currentObjects(schema, draft).map(objectKey)).toEqual([
      "enum:mood",
      "function:stamp",
      "view:sad",
    ]);

    s.applyDesign(draftStatements(draft, schema));
    const after = s.schema();
    expect(after.objects.map(objectKey)).toEqual(["function:stamp", "enum:mood", "view:sad"]);
    expect(enumValues(after.objects.find((o) => o.name === "mood")!)).toEqual([
      "sad",
      "ok",
      "happy",
    ]);
    expect(after.tables[0].columns.at(-1)!.type).toBe("timestamptz");
  });

  test("a copy as a new database keeps the database type and objects", async () => {
    const { schema } = await imported();
    const copy = await memorySession(newDatabaseStatements(schema, EMPTY_DRAFT).join("\n"));
    expect(copy.schema().dialect).toBe("postgresql");
    expect(copy.schema().objects).toEqual(schema.objects);
  });

  test("objects need a name, unique within their kind", async () => {
    const { schema } = await imported();
    const twice = setObject(EMPTY_DRAFT, "function:copy", {
      kind: "function",
      name: "STAMP",
      table: null,
      body: "x",
    });
    expect(validateDraft(schema, twice)).toContain("Two functions are called STAMP");
    const unnamed = setObject(EMPTY_DRAFT, "enum:mood", { ...schema.objects[0], name: " " });
    expect(validateDraft(schema, unnamed)).toContain("A enum needs a name");
  });
});
