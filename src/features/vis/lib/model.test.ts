import { describe, expect, test } from "bun:test";
import { emptyColumn } from "@/lib/sqlite/ddl";
import type { Schema } from "@/lib/sqlite/types";
import { SAMPLE_DB_SQL } from "@/lib/sqlite/sample";
import { memorySession } from "@/lib/sqlite/test-utils";
import {
  autoLayout,
  edgeSides,
  handleColumn,
  handleId,
  nextFreePosition,
  TABLE_WIDTH,
} from "./layout";
import {
  addColumn,
  buildDiagram,
  columnForEditing,
  dropColumn,
  dropTable,
  renameTable,
  revertColumn,
  updateColumn,
  connectColumns,
  createDraftTable,
  disconnectColumn,
  draftStatements,
  edgeTypeProblems,
  EMPTY_DRAFT,
  isNewColumn,
  existingId,
  countChanges,
  currentColumnDef,
  editExistingColumn,
  isDraftEmpty,
  newDatabaseStatements,
  saveWarnings,
  setColumnChange,
  setTableDropped,
  setTableRename,
  tablesToRebuild,
  schemaStatements,
  removeDraftTable,
  setAddedColumns,
  TABLE_HANDLE,
  updateDraftTable,
  validateDraft,
  type Draft,
} from "./model";

async function sample() {
  const s = await memorySession(SAMPLE_DB_SQL);
  return { s, schema: s.schema() };
}

describe("buildDiagram", () => {
  test("shows tables, views and foreign keys of a real database", async () => {
    const { schema } = await sample();
    const d = buildDiagram(schema, EMPTY_DRAFT);
    expect(d.tables.map((t) => t.name)).toEqual([
      "customers",
      "order_items",
      "orders",
      "products",
      "order_totals",
    ]);
    expect(d.tables.find((t) => t.name === "order_totals")?.kind).toBe("view");
    expect(
      d.edges.map((e) => `${e.source}.${e.sourceColumn}->${e.target}.${e.targetColumn}`).sort(),
    ).toEqual([
      "t:order_items.order_id->t:orders.id",
      "t:order_items.product_id->t:products.id",
      "t:orders.customer_id->t:customers.id",
    ]);
    expect(d.edges.every((e) => !e.draft)).toBe(true);
  });

  test("can hide views and works without a database", async () => {
    const { schema } = await sample();
    expect(buildDiagram(schema, EMPTY_DRAFT, false).tables.some((t) => t.kind === "view")).toBe(
      false,
    );
    expect(buildDiagram(null, EMPTY_DRAFT)).toEqual({ tables: [], edges: [] });
  });

  test("an implicit primary-key reference targets the parent's key column", () => {
    const { draft } = createDraftTable(EMPTY_DRAFT, null);
    const parent = { ...draft.tables[0], name: "parent" };
    const child = {
      ...parent,
      id: "child",
      name: "child",
      columns: [
        {
          ...emptyColumn("parent_id"),
          references: { table: "parent", column: "", onDelete: "NO ACTION" },
        },
      ],
    };
    const d = buildDiagram(null, { ...EMPTY_DRAFT, tables: [parent, child] });
    expect(d.edges[0]).toMatchObject({
      sourceColumn: "parent_id",
      targetColumn: "id",
      draft: true,
    });
  });
});

describe("designing a schema", () => {
  test("new tables get unique names and a primary key", async () => {
    const { schema } = await sample();
    const a = createDraftTable(EMPTY_DRAFT, schema);
    const b = createDraftTable(a.draft, schema);
    expect(a.table.name).toBe("table_1");
    expect(b.table.name).toBe("table_2");
    expect(a.table.columns[0]).toMatchObject({ name: "id", type: "INTEGER", primaryKey: true });
  });

  test("connecting a new column to an existing table, then applying it to SQLite", async () => {
    const { s, schema } = await sample();
    const created = createDraftTable(EMPTY_DRAFT, schema);
    const table = created.table;
    let draft = updateDraftTable(created.draft, table.id, {
      ...table,
      name: "reviews",
      columns: [
        ...table.columns,
        { ...emptyColumn("product_id"), type: "INTEGER" },
        {
          ...emptyColumn("stars"),
          type: "INTEGER",
          notNull: true,
          defaultKind: "number",
          defaultValue: "5",
        },
      ],
    });
    let diagram = buildDiagram(schema, draft);
    const linked = connectColumns(
      draft,
      diagram,
      { table: `d:${table.id}`, column: "product_id" },
      { table: existingId("products"), column: "id" },
    );
    if ("error" in linked) throw new Error(linked.error);
    draft = setAddedColumns(linked.draft, "customers", [
      { ...emptyColumn("referrer_id"), type: "INTEGER" },
    ]);
    diagram = buildDiagram(schema, draft);
    const selfLink = connectColumns(
      draft,
      diagram,
      { table: existingId("customers"), column: "referrer_id" },
      { table: existingId("customers"), column: TABLE_HANDLE },
    );
    if ("error" in selfLink) throw new Error(selfLink.error);
    draft = selfLink.draft;

    expect(validateDraft(schema, draft)).toEqual([]);
    const statements = draftStatements(draft);
    // Changes to existing tables come first; new tables are created last.
    expect(statements).toEqual([
      'ALTER TABLE "customers" ADD COLUMN "referrer_id" INTEGER REFERENCES "customers";',
      expect.stringContaining('"product_id" INTEGER REFERENCES "products"("id")'),
    ]);

    s.transaction(statements.map((sql) => ({ sql, params: [] })));
    const after = buildDiagram(s.schema(), EMPTY_DRAFT);
    expect(after.edges.map((e) => `${e.source}.${e.sourceColumn}->${e.target}`)).toEqual(
      expect.arrayContaining([
        "t:reviews.product_id->t:products",
        "t:customers.referrer_id->t:customers",
      ]),
    );
  });

  test("views can't be referenced; existing columns become a pending change", async () => {
    const { schema } = await sample();
    const { draft, table } = createDraftTable(EMPTY_DRAFT, schema);
    const d = buildDiagram(schema, draft);
    expect(
      connectColumns(
        draft,
        d,
        { table: `d:${table.id}`, column: "id" },
        { table: existingId("order_totals"), column: "customer" },
      ),
    ).toHaveProperty("error");
    const linked = connectColumns(
      draft,
      d,
      { table: existingId("products"), column: "stock" },
      { table: `d:${table.id}`, column: "id" },
      schema,
    );
    if ("error" in linked) throw new Error(linked.error);
    expect(linked.draft.columnChanges.products.stock).toMatchObject({
      kind: "change",
      def: { name: "stock", references: { table: table.name, column: "id" } },
    });
  });

  test("renaming or removing a draft table keeps references consistent", () => {
    const { draft: start, table: parent } = createDraftTable(EMPTY_DRAFT, null);
    const made = createDraftTable(start, null);
    let draft = updateDraftTable(made.draft, made.table.id, {
      ...made.table,
      columns: [
        ...made.table.columns,
        {
          ...emptyColumn("parent_id"),
          references: { table: parent.name, column: "id", onDelete: "CASCADE" },
        },
      ],
    });
    draft = updateDraftTable(draft, parent.id, { ...parent, name: "authors" });
    expect(draft.tables[1].columns[1].references?.table).toBe("authors");

    const diagram = buildDiagram(null, draft);
    expect(
      disconnectColumn(draft, diagram, diagram.edges[0]).tables[1].columns[1].references,
    ).toBeNull();

    draft = removeDraftTable(draft, parent.id);
    expect(draft.tables).toHaveLength(1);
    expect(draft.tables[0].columns[1].references).toBeNull();
    expect(isDraftEmpty(removeDraftTable(draft, draft.tables[0].id))).toBe(true);
  });

  test("validation explains name clashes and invalid columns", async () => {
    const { schema } = await sample();
    const { draft, table } = createDraftTable(EMPTY_DRAFT, schema);
    const bad: Draft = {
      ...EMPTY_DRAFT,
      tables: [
        { ...table, name: "orders" },
        { ...table, id: "x", name: "dup" },
        { ...table, id: "y", name: "dup" },
      ],
      addedColumns: {
        customers: [{ ...emptyColumn("email") }, { ...emptyColumn("vip2"), notNull: true }],
      },
    };
    const problems = validateDraft(schema, bad);
    expect(problems).toContain('A table or view called "orders" already exists');
    expect(problems).toContain('Two new tables are called "dup"');
    expect(problems).toContain('customers would have two columns called "email"');
    expect(problems.some((p) => p.includes("NOT NULL column needs a default"))).toBe(true);
    expect(validateDraft(schema, draft)).toEqual([]);
  });
});

describe("editing existing tables", () => {
  const rel = (schema: Schema, name: string) => schema.tables.find((t) => t.name === name)!;

  test("renames, drops and type changes are saved together and keep data and relations", async () => {
    const { s, schema } = await sample();
    const customers = rel(schema, "customers");
    let draft = setTableRename(EMPTY_DRAFT, "products", "items");
    draft = setColumnChange(draft, "orders", "note", { kind: "drop" });
    // Rename + type change on a table with AUTOINCREMENT, a CHECK, a view and an incoming FK.
    const vip = currentColumnDef(draft, customers, "vip")!;
    draft = editExistingColumn(draft, customers, "vip", { ...vip, name: "is_vip", type: "TEXT" });
    const city = currentColumnDef(draft, customers, "city")!;
    draft = editExistingColumn(draft, customers, "city", { ...city, name: "town" });
    draft = setAddedColumns(draft, "orders", [{ ...emptyColumn("channel"), type: "TEXT" }]);

    expect(validateDraft(schema, draft)).toEqual([]);
    expect(tablesToRebuild(schema, draft).map((t) => t.name)).toEqual(["customers"]);
    expect(saveWarnings(schema, draft)[0]).toContain("customers is rebuilt");
    expect(countChanges(draft)).toBe(5);

    // Before saving, the diagram shows the result.
    const preview = buildDiagram(schema, draft);
    const pc = preview.tables.find((t) => t.id === "t:customers")!;
    expect(pc.columns.find((c) => c.name === "is_vip")?.change).toBe("edited");
    expect(preview.tables.find((t) => t.id === "t:products")).toMatchObject({
      name: "items",
      change: "renamed",
    });
    const orderNote = preview.tables
      .find((t) => t.id === "t:orders")!
      .columns.find((c) => c.name === "note");
    expect(orderNote?.change).toBe("dropped");
    expect(preview.edges.some((e) => e.target === "t:products")).toBe(true);

    s.applyDesign(draftStatements(draft, schema));
    const after = s.schema();
    const c2 = after.tables.find((t) => t.name === "customers")!;
    expect(c2.columns.map((c) => [c.name, c.type])).toEqual([
      ["id", "INTEGER"],
      ["name", "TEXT"],
      ["email", "TEXT"],
      ["town", "TEXT"],
      ["joined_on", "TEXT"],
      ["is_vip", "TEXT"],
    ]);
    expect(s.count("SELECT count(*) FROM customers", [])).toBe(60);
    expect(s.count("SELECT count(*) FROM order_totals", [])).toBe(150);
    expect(after.triggers.map((t) => t.name)).toEqual(["order_items_stock"]);
    expect(after.tables.some((t) => t.name === "items")).toBe(true);
    const itemFks = after.tables
      .find((t) => t.name === "order_items")!
      .foreignKeys.map((k) => k.table);
    expect(itemFks.sort()).toEqual(["items", "orders"]);
    const orders = after.tables.find((t) => t.name === "orders")!;
    expect(orders.foreignKeys[0].table).toBe("customers");
    expect(orders.columns.map((c) => c.name)).toEqual([
      "id",
      "customer_id",
      "ordered_at",
      "status",
      "channel",
    ]);
    expect(s.query("PRAGMA foreign_key_check").rows).toEqual([]);
    // AUTOINCREMENT survived the rebuild.
    expect(c2.sql).toContain("AUTOINCREMENT");
  });

  test("a new foreign key on an existing column is checked against the data", async () => {
    const { s, schema } = await sample();
    const diagram = buildDiagram(schema, EMPTY_DRAFT);
    const bad = connectColumns(
      EMPTY_DRAFT,
      diagram,
      // REAL and INTEGER can link; prices like 19.99 match no customer id.
      { table: existingId("products"), column: "price" },
      { table: existingId("customers"), column: "id" },
      schema,
    );
    if ("error" in bad) throw new Error(bad.error);
    expect(() => s.applyDesign(draftStatements(bad.draft, schema))).toThrow(
      "pointing at missing rows",
    );
    // Rolled back: products still has no foreign keys, and foreign keys are back on.
    expect(s.schema().tables.find((t) => t.name === "products")!.foreignKeys).toHaveLength(0);
    expect(s.query("PRAGMA foreign_keys").rows[0][0]).toBe(1);
  });

  test("dropping a table, and undoing changes", async () => {
    const { s, schema } = await sample();
    let draft = setTableDropped(EMPTY_DRAFT, "order_items", true);
    const preview = buildDiagram(schema, draft);
    expect(preview.tables.find((t) => t.id === "t:order_items")?.change).toBe("dropped");
    expect(preview.edges.some((e) => e.source === "t:order_items")).toBe(false);
    expect(saveWarnings(schema, draft)).toEqual([
      "The view order_totals uses order_items, which you're deleting; it will stop working.",
    ]);
    s.applyDesign(draftStatements(draft, schema));
    expect(s.schema().tables.some((t) => t.name === "order_items")).toBe(false);
    // The now-broken view is still listed (without columns) instead of breaking the schema.
    expect(s.schema().views.map((v) => [v.name, v.columns.length])).toEqual([["order_totals", 0]]);
    expect(s.schema().triggers).toEqual([]);

    draft = setTableDropped(draft, "order_items", false);
    draft = setTableRename(draft, "orders", "orders");
    expect(isDraftEmpty(draft)).toBe(true);
    const customers = rel(schema, "customers");
    const name = currentColumnDef(EMPTY_DRAFT, customers, "name")!;
    expect(isDraftEmpty(editExistingColumn(EMPTY_DRAFT, customers, "name", { ...name }))).toBe(
      true,
    );
  });

  test("validation catches name clashes from renames and empty tables", async () => {
    const { schema } = await sample();
    expect(validateDraft(schema, setTableRename(EMPTY_DRAFT, "orders", "customers"))).toContain(
      'Two tables would be called "customers"',
    );
    const customers = rel(schema, "customers");
    const email = currentColumnDef(EMPTY_DRAFT, customers, "email")!;
    const clash = editExistingColumn(EMPTY_DRAFT, customers, "email", { ...email, name: "name" });
    expect(validateDraft(schema, clash)).toContain(
      'customers would have two columns called "name"',
    );
    let all = EMPTY_DRAFT;
    for (const c of rel(schema, "order_items").columns) {
      all = setColumnChange(all, "order_items", c.name, { kind: "drop" });
    }
    expect(validateDraft(schema, all).some((p) => p.includes("no columns left"))).toBe(true);
  });
});

describe("relationship types", () => {
  test("a line between columns of different types is refused", async () => {
    const { schema } = await sample();
    const d = buildDiagram(schema, EMPTY_DRAFT);
    const result = connectColumns(
      EMPTY_DRAFT,
      d,
      { table: existingId("products"), column: "category" },
      { table: existingId("customers"), column: "id" },
      schema,
    );
    expect(result).toEqual({
      error:
        "products.category is TEXT but customers.id is INTEGER; linked columns need the same type",
    });
    // Targeting the table means its primary key, which is checked the same way.
    expect(
      connectColumns(
        EMPTY_DRAFT,
        d,
        { table: existingId("products"), column: "category" },
        { table: existingId("customers"), column: TABLE_HANDLE },
        schema,
      ),
    ).toHaveProperty("error");
  });

  test("a new column takes the type of the column it's linked to", async () => {
    const { schema } = await sample();
    const { draft, table } = createDraftTable(EMPTY_DRAFT, schema);
    const withCol = updateDraftTable(draft, table.id, {
      ...table,
      columns: [...table.columns, emptyColumn("customer")], // TEXT by default
    });
    const linked = connectColumns(
      withCol,
      buildDiagram(schema, withCol),
      { table: `d:${table.id}`, column: "customer" },
      { table: existingId("customers"), column: "id" },
      schema,
    );
    if ("error" in linked) throw new Error(linked.error);
    expect(linked.draft.tables[0].columns[1]).toMatchObject({
      type: "INTEGER",
      references: { table: "customers", column: "id" },
    });
    expect(validateDraft(schema, linked.draft)).toEqual([]);
  });

  test("numbers link to numbers, and untyped columns link to anything", async () => {
    const { schema } = await sample();
    const { draft, table } = createDraftTable(EMPTY_DRAFT, schema);
    const references = { table: "customers", column: "id", onDelete: "NO ACTION" };
    const linked = updateDraftTable(draft, table.id, {
      ...table,
      columns: [
        ...table.columns,
        { ...emptyColumn("amount"), type: "REAL", references },
        { ...emptyColumn("anything"), type: "", references },
      ],
    });
    expect(edgeTypeProblems(buildDiagram(schema, linked)).size).toBe(0);
    expect(validateDraft(schema, linked)).toEqual([]);
  });

  test("a mismatched reference set in the editor blocks saving and marks the line", async () => {
    const { schema } = await sample();
    const { draft, table } = createDraftTable(EMPTY_DRAFT, schema);
    const bad = updateDraftTable(draft, table.id, {
      ...table,
      columns: [
        ...table.columns,
        {
          ...emptyColumn("customer"),
          type: "TEXT",
          references: { table: "customers", column: "id", onDelete: "NO ACTION" },
        },
      ],
    });
    expect(validateDraft(schema, bad)).toContain(
      `${table.name}.customer is TEXT but customers.id is INTEGER; linked columns need the same type`,
    );
    const problems = edgeTypeProblems(buildDiagram(schema, bad));
    expect([...problems.keys()]).toEqual([`d:${table.id}.customer->t:customers.id`]);
    // Relationships already in the database aren't flagged.
    expect(edgeTypeProblems(buildDiagram(schema, EMPTY_DRAFT)).size).toBe(0);
  });
});

describe("isNewColumn", () => {
  test("only columns not yet in the database are new", async () => {
    const { schema } = await sample();
    const { draft, table } = createDraftTable(EMPTY_DRAFT, schema);
    const d = buildDiagram(schema, draft);
    expect(isNewColumn(d, { table: `d:${table.id}`, column: "id" })).toBe(true);
    expect(isNewColumn(d, { table: existingId("products"), column: "id" })).toBe(false);
    expect(isNewColumn(d, { table: existingId("products"), column: TABLE_HANDLE })).toBe(false);
  });
});

describe("editing from the outline", () => {
  const tableOf = (draft: Draft, schema: Schema, id: string) =>
    buildDiagram(schema, draft).tables.find((t) => t.id === id)!;

  test("every kind of column is edited, added and deleted through its key", async () => {
    const { s, schema } = await sample();
    let draft: Draft = EMPTY_DRAFT;

    // Existing column: edit, then delete and restore another one.
    let orders = tableOf(draft, schema, existingId("orders"));
    const status = orders.columns.find((c) => c.name === "status")!;
    expect(status.key).toBe("o:status");
    const editing = columnForEditing(draft, schema, orders, status.key)!;
    expect(editing.mode).toBe("create");
    draft = updateColumn(draft, schema, orders, status.key, { ...editing.def, name: "state" });
    draft = dropColumn(draft, orders, "o:note");
    orders = tableOf(draft, schema, existingId("orders"));
    expect(orders.columns.find((c) => c.key === "o:status")).toMatchObject({
      name: "state",
      change: "edited",
    });
    expect(orders.columns.find((c) => c.key === "o:note")?.change).toBe("dropped");
    draft = revertColumn(draft, orders, "o:note");
    expect(
      tableOf(draft, schema, existingId("orders")).columns.find((c) => c.key === "o:note")?.change,
    ).toBeUndefined();

    // Added column on an existing table: unique name, "add" limits, edit, delete.
    const added = addColumn(draft, orders);
    draft = added.draft;
    expect(added.key).toBe("a:0");
    orders = tableOf(draft, schema, existingId("orders"));
    const fresh = columnForEditing(draft, schema, orders, added.key)!;
    expect(fresh.mode).toBe("add");
    expect(orders.columns.some((c) => c.name === fresh.def.name)).toBe(true);
    draft = updateColumn(draft, schema, orders, added.key, {
      ...fresh.def,
      name: "channel",
      type: "TEXT",
    });
    const second = addColumn(draft, tableOf(draft, schema, existingId("orders")));
    draft = dropColumn(
      second.draft,
      tableOf(second.draft, schema, existingId("orders")),
      second.key,
    );
    expect(draft.addedColumns.orders.map((c) => c.name)).toEqual(["channel"]);

    // New table: add a column, rename the table, then save everything.
    const created = createDraftTable(draft, schema);
    let table = tableOf(created.draft, schema, `d:${created.table.id}`);
    const col = addColumn(created.draft, table);
    expect(col.key).toBe("n:1");
    draft = renameTable(col.draft, table, "notes");
    table = tableOf(draft, schema, `d:${created.table.id}`);
    draft = updateColumn(draft, schema, table, "n:1", { ...emptyColumn("body"), type: "TEXT" });
    expect(table.name).toBe("notes");

    // Existing table: rename; another one deleted then restored.
    draft = renameTable(draft, tableOf(draft, schema, existingId("products")), "items");
    const items = tableOf(draft, schema, existingId("products"));
    expect(items).toMatchObject({ name: "items", change: "renamed" });
    draft = dropTable(draft, items);
    expect(tableOf(draft, schema, existingId("products")).change).toBe("dropped");
    draft = dropTable(draft, items, false);

    expect(validateDraft(schema, draft)).toEqual([]);
    s.applyDesign(draftStatements(draft, schema));
    const after = s.schema();
    expect(after.tables.find((t) => t.name === "orders")!.columns.map((c) => c.name)).toEqual([
      "id",
      "customer_id",
      "ordered_at",
      "state",
      "note",
      "channel",
    ]);
    expect(after.tables.find((t) => t.name === "notes")!.columns.map((c) => c.name)).toEqual([
      "id",
      "body",
    ]);
    expect(after.tables.some((t) => t.name === "items")).toBe(true);
  });

  test("deleting a new table removes it; keys of unknown columns are ignored", async () => {
    const { schema } = await sample();
    const { draft, table } = createDraftTable(EMPTY_DRAFT, schema);
    const t = tableOf(draft, schema, `d:${table.id}`);
    expect(dropTable(draft, t).tables).toEqual([]);
    expect(columnForEditing(draft, schema, t, "n:9")).toBeNull();
    expect(updateColumn(draft, schema, t, "n:9", emptyColumn("x"))).toEqual(draft);
  });
});

describe("saving as a new database", () => {
  test("rebuilds the full schema without rows, plus the design", async () => {
    const { s: source, schema } = await sample();
    const { draft, table } = createDraftTable(EMPTY_DRAFT, schema);
    const designed = updateDraftTable(draft, table.id, { ...table, name: "reviews" });

    expect(schemaStatements(null)).toEqual([]);
    const script = newDatabaseStatements(schema, designed).join("\n");
    const copy = await memorySession(script);
    const copied = copy.schema();

    expect(copied.tables.map((t) => t.name)).toEqual(
      [...schema.tables.map((t) => t.name), "reviews"].sort(),
    );
    expect(copied.views.map((v) => v.name)).toEqual(["order_totals"]);
    expect(copied.indexes.map((i) => i.name)).toEqual(schema.indexes.map((i) => i.name));
    expect(copied.triggers.map((t) => t.name)).toEqual(["order_items_stock"]);
    expect(copy.count("SELECT count(*) FROM customers", [])).toBe(0);
    // Foreign keys survive.
    expect(buildDiagram(copied, EMPTY_DRAFT).edges).toHaveLength(
      buildDiagram(schema, EMPTY_DRAFT).edges.length,
    );
    // The source is untouched.
    expect(source.schema().tables.some((t) => t.name === "reviews")).toBe(false);
  });

  test("copying rows too: a dump followed by the design", async () => {
    const { s: source, schema } = await sample();
    const { draft } = createDraftTable(EMPTY_DRAFT, schema);
    const copy = await memorySession(`${source.dump()}\n${draftStatements(draft).join("\n")}`);
    expect(copy.count("SELECT count(*) FROM customers", [])).toBe(60);
    expect(copy.schema().tables.some((t) => t.name === "table_1")).toBe(true);
  });
});

describe("layout", () => {
  test("lays tables out left to right without overlaps", () => {
    const tables = [
      { id: "a", columns: 3 },
      { id: "b", columns: 8 },
      { id: "c", columns: 2 },
    ];
    const pos = autoLayout(tables, [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
    ]);
    expect(pos.a.x).toBeLessThan(pos.b.x);
    expect(pos.b.x).toBeLessThan(pos.c.x);
    expect(pos.b.x - pos.a.x).toBeGreaterThanOrEqual(TABLE_WIDTH);
  });

  test("new tables are placed right of the existing ones", () => {
    expect(nextFreePosition({})).toEqual({ x: 24, y: 24 });
    expect(nextFreePosition({ a: { x: 100, y: 50 }, b: { x: 400, y: 10 } }).x).toBeGreaterThan(
      400 + TABLE_WIDTH,
    );
  });

  test("relationship lines leave and enter on the facing sides", () => {
    const a = { x: 0, y: 0 };
    expect(edgeSides(a, { x: 600, y: 40 })).toEqual({ source: "R", target: "L" });
    expect(edgeSides({ x: 600, y: 40 }, a)).toEqual({ source: "L", target: "R" });
    // Stacked cards and self-references bracket around the right side.
    expect(edgeSides(a, { x: 60, y: 400 })).toEqual({ source: "R", target: "R" });
    expect(edgeSides(a, a, true)).toEqual({ source: "R", target: "R" });
  });

  test("handle ids carry the side and the column", () => {
    expect(handleId("L", "customer_id")).toBe("L:customer_id");
    expect(handleColumn(handleId("R", "a:b"))).toBe("a:b");
  });
});
