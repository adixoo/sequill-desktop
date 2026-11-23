/**
 * Stress: a large schema design (renames, dropped and changed columns that force table
 * rebuilds, added columns, new tables) built through the designer's model and saved into a
 * real SQLite database full of linked rows, in one transaction. Nothing may be lost.
 */
import { describe, expect, test } from "vitest";
import { emptyColumn } from "@/lib/sqlite/ddl";
import { quoteIdent } from "@/lib/sqlite/sql";
import {
  columnDefFromInfo,
  createDraftTable,
  draftStatements,
  EMPTY_DRAFT,
  setAddedColumns,
  setColumnChange,
  setTableRename,
  validateDraft,
  type Draft,
} from "@/features/vis/lib/model";
import { random, SEED } from "../../helpers/random";
import { memorySession } from "../../helpers/sqlite";

const TABLES = 120;
const ROWS = 40;
const name = (i: number) => `t${i} "x"`;

async function linkedDatabase() {
  const sql: string[] = [];
  for (let i = 0; i < TABLES; i++) {
    const parent = i > 0 ? `, parent_id INTEGER REFERENCES ${quoteIdent(name(i - 1))}(id)` : "";
    sql.push(
      `CREATE TABLE ${quoteIdent(name(i))} (id INTEGER PRIMARY KEY, label TEXT, v REAL${parent});`,
    );
    const values = Array.from({ length: ROWS }, (_, r) =>
      i > 0
        ? `(${r + 1}, 'row ${r}', ${r / 2}, ${(r % ROWS) + 1})`
        : `(${r + 1}, 'row ${r}', ${r / 2})`,
    );
    sql.push(`INSERT INTO ${quoteIdent(name(i))} VALUES ${values.join(", ")};`);
  }
  const s = await memorySession(sql.join("\n"));
  s.query("PRAGMA foreign_keys = ON");
  return s;
}

describe(`schema designer at scale (seed ${SEED})`, () => {
  test(`a design touching every one of ${TABLES} linked tables saves without losing a row`, async () => {
    const r = random(SEED + 20);
    const s = await linkedDatabase();
    const schema = s.schema();
    let draft: Draft = EMPTY_DRAFT;
    const finalName = new Map<string, string>();

    for (const rel of schema.tables) {
      finalName.set(rel.name, rel.name);
      switch (r.int(0, 3)) {
        case 0: {
          const to = `${rel.name} renamed`;
          draft = setTableRename(draft, rel.name, to);
          finalName.set(rel.name, to);
          break;
        }
        case 1:
          // Dropping a column SQLite can't drop in place (none here) or plain: either way rows stay.
          draft = setColumnChange(draft, rel.name, "v", { kind: "drop" });
          break;
        case 2: {
          // Making a column NOT NULL forces a rebuild that copies every row.
          const col = rel.columns.find((c) => c.name === "label")!;
          const def = { ...columnDefFromInfo(rel, col), notNull: true, name: "title" };
          draft = setColumnChange(draft, rel.name, "label", { kind: "change", def });
          break;
        }
        default:
          draft = setAddedColumns(draft, rel.name, [
            { ...emptyColumn("added"), type: "INTEGER", defaultKind: "number", defaultValue: "7" },
          ]);
      }
    }
    for (let i = 0; i < 15; i++) draft = createDraftTable(draft, schema).draft;

    expect(validateDraft(schema, draft)).toEqual([]);
    const statements = draftStatements(draft, schema);
    s.schemaOnlyCopy().checkDesign(statements);
    s.applyDesign(statements);

    const after = s.schema();
    expect(after.tables).toHaveLength(TABLES + draft.tables.length);
    for (const [, to] of finalName) {
      expect(s.count(`SELECT count(*) FROM ${quoteIdent(to)}`, []), to).toBe(ROWS);
    }
    expect(s.query("PRAGMA foreign_key_check").rows).toEqual([]);
    expect(s.query("PRAGMA integrity_check").rows).toEqual([["ok"]]);
  });

  test("a design SQLite would refuse rolls back completely", async () => {
    const s = await linkedDatabase();
    // Every label the same, then the design makes labels UNIQUE: the rebuild's copy fails.
    s.query(`UPDATE ${quoteIdent(name(5))} SET label = 'same'`);
    const schema = s.schema();
    const before = s.dump();
    const rel = schema.tables.find((t) => t.name === name(5))!;
    const label = rel.columns.find((c) => c.name === "label")!;
    const def = { ...columnDefFromInfo(rel, label), unique: true };
    let draft = setColumnChange(EMPTY_DRAFT, name(5), "label", { kind: "change", def });
    draft = setTableRename(draft, name(9), "renamed nine");
    expect(() => s.applyDesign(draftStatements(draft, schema))).toThrow();
    // The rename that ran before the failure is undone too.
    expect(s.dump()).toBe(before);
  });
});
