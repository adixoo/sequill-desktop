/** Reads the schema of the open database through PRAGMA table-valued functions. */
import { ROWID_CANDIDATES } from "@/shared/lib/constants";
import type {
  CellValue,
  ColumnInfo,
  ForeignKey,
  IndexInfo,
  RelationInfo,
  RelationKind,
  Schema,
  SchemaObject,
} from "./types";

export type ExecObjects = (sql: string, params?: CellValue[]) => Record<string, CellValue>[];

const str = (v: CellValue): string => (v === null ? "" : String(v));
const num = (v: CellValue): number => Number(v ?? 0);

export function isInternalName(name: string): boolean {
  return name.toLowerCase().startsWith("sqlite_");
}

export function pickRowidName(columns: { name: string }[]): string | null {
  const taken = new Set(columns.map((c) => c.name.toLowerCase()));
  return ROWID_CANDIDATES.find((c) => !taken.has(c)) ?? null;
}

function readColumns(exec: ExecObjects, table: string): ColumnInfo[] {
  return exec(
    `SELECT cid, name, type, "notnull" AS nn, dflt_value, pk, hidden FROM pragma_table_xinfo(?) ORDER BY cid`,
    [table],
  ).map((r) => ({
    cid: num(r.cid),
    name: str(r.name),
    type: str(r.type).toUpperCase(),
    notNull: num(r.nn) === 1,
    defaultValue: r.dflt_value === null ? null : str(r.dflt_value),
    pk: num(r.pk),
    hidden: num(r.hidden),
  }));
}

function readForeignKeys(exec: ExecObjects, table: string): ForeignKey[] {
  return exec(
    `SELECT id, seq, "table" AS parent, "from" AS child, "to" AS target, on_update, on_delete FROM pragma_foreign_key_list(?)`,
    [table],
  ).map((r) => ({
    id: num(r.id),
    seq: num(r.seq),
    table: str(r.parent),
    from: str(r.child),
    to: r.target === null ? null : str(r.target),
    onUpdate: str(r.on_update),
    onDelete: str(r.on_delete),
  }));
}

function readIndexes(
  exec: ExecObjects,
  table: string,
  sqlByName: Map<string, string | null>,
): IndexInfo[] {
  return exec(`SELECT name, "unique" AS uq, origin, partial FROM pragma_index_list(?)`, [
    table,
  ]).map((r) => {
    const name = str(r.name);
    const columns = exec(`SELECT name FROM pragma_index_info(?) ORDER BY seqno`, [name]).map((c) =>
      c.name === null ? "<expr>" : str(c.name),
    );
    return {
      name,
      unique: num(r.uq) === 1,
      origin: str(r.origin),
      partial: num(r.partial) === 1,
      columns,
      sql: sqlByName.get(name) ?? null,
    };
  });
}

export function readSchema(exec: ExecObjects): Schema {
  const master = exec(`SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY name`);
  const sqlByName = new Map(master.map((r) => [str(r.name), r.sql === null ? null : str(r.sql)]));
  const objects = (type: string): SchemaObject[] =>
    master
      .filter((r) => r.type === type && !isInternalName(str(r.name)))
      .map((r) => ({
        name: str(r.name),
        table: str(r.tbl_name),
        sql: r.sql === null ? null : str(r.sql),
      }));

  const list = exec(
    `SELECT name, type, wr, strict FROM pragma_table_list WHERE schema = 'main' ORDER BY name COLLATE NOCASE`,
  );

  const tables: RelationInfo[] = [];
  const views: RelationInfo[] = [];
  for (const entry of list) {
    const name = str(entry.name);
    const type = str(entry.type);
    if (type === "shadow" || (isInternalName(name) && name !== "sqlite_sequence")) continue;
    const kind: RelationKind = type === "view" ? "view" : type === "virtual" ? "virtual" : "table";
    // A view whose tables were dropped can't be described; list it without columns.
    let columns: ColumnInfo[] = [];
    try {
      columns = readColumns(exec, name);
    } catch (error) {
      if (kind !== "view") throw error;
    }
    const withoutRowid = num(entry.wr) === 1;
    const rowidName = kind === "table" && !withoutRowid ? pickRowidName(columns) : null;
    const hasPk = columns.some((c) => c.pk > 0);
    const relation: RelationInfo = {
      name,
      kind,
      sql: sqlByName.get(name) ?? null,
      columns,
      foreignKeys: kind === "table" ? readForeignKeys(exec, name) : [],
      indexes: kind === "table" ? readIndexes(exec, name, sqlByName) : [],
      withoutRowid,
      strict: num(entry.strict) === 1,
      rowidName,
      editable: kind === "table" && (rowidName !== null || hasPk),
    };
    (kind === "view" ? views : tables).push(relation);
  }

  return { tables, views, indexes: objects("index"), triggers: objects("trigger") };
}

/** Columns that a SELECT * would return (virtual-table hidden columns excluded). */
export function visibleColumns(relation: RelationInfo): ColumnInfo[] {
  return relation.columns.filter((c) => c.hidden !== 1);
}

/** Generated columns cannot be written. */
export function isWritableColumn(column: ColumnInfo): boolean {
  return column.hidden === 0;
}
