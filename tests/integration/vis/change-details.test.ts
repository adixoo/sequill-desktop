import { describe, expect, test } from "vitest";
import { emptyColumn } from "@/lib/sqlite/ddl";
import { SAMPLE_DB_SQL } from "@/lib/sqlite/sample";
import {
  changeDetails,
  columnDefFromInfo,
  createDraftTable,
  EMPTY_DRAFT,
  setAddedColumns,
  setColumnChange,
  setTableDropped,
  setTableRename,
} from "@/features/vis/lib/model";
import { memorySession } from "../../helpers/sqlite";

async function sampleSchema() {
  return (await memorySession(SAMPLE_DB_SQL)).schema();
}

describe("changeDetails", () => {
  test("describes every kind of change in plain words", async () => {
    const schema = await sampleSchema();
    const customers = schema.tables.find((t) => t.name === "customers")!;
    const email = customers.columns.find((c) => c.name === "email")!;

    let draft = createDraftTable(EMPTY_DRAFT, schema).draft;
    draft = setTableRename(draft, "products", "items");
    draft = setTableDropped(draft, "order_items", true);
    draft = setAddedColumns(draft, "orders", [{ ...emptyColumn("note"), type: "TEXT" }]);
    draft = setColumnChange(draft, "customers", "email", {
      kind: "change",
      def: { ...columnDefFromInfo(customers, email), name: "mail", notNull: true },
    });
    draft = setColumnChange(draft, "customers", "name", { kind: "drop" });

    expect(changeDetails(schema, draft)).toEqual([
      `New table "${draft.tables[0].name}" with 1 column: id`,
      'Table "order_items" deleted, with all its rows',
      'Table "products" renamed to "items"',
      '"orders": new column "note" (TEXT)',
      `"customers": column "email" renamed to "mail"${email.notNull ? "" : ", now NOT NULL"}`,
      '"customers": column "name" deleted, with its data',
    ]);
  });

  test("says nothing about tables that are deleted anyway, and nothing for no changes", async () => {
    const schema = await sampleSchema();
    let draft = setAddedColumns(EMPTY_DRAFT, "orders", [emptyColumn("x")]);
    draft = setTableDropped(draft, "orders", true);
    expect(changeDetails(schema, draft)).toEqual(['Table "orders" deleted, with all its rows']);
    expect(changeDetails(schema, EMPTY_DRAFT)).toEqual([]);
  });
});
