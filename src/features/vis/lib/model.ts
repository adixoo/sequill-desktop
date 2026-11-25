/**
 * Schema visualizer model: turns a database schema plus the user's draft design
 * into diagram tables and relationship edges, and the draft into SQL.
 * Pure functions, independent of the diagram library.
 */
import { relations } from "@/lib/sqlite/introspect";
import {
  buildAddColumn,
  buildCreateTable,
  buildDrop,
  buildDropColumn,
  buildRenameColumn,
  buildRenameTable,
  emptyColumn,
} from "@/lib/sqlite/ddl";
import type { ColumnDef } from "@/types/lib/sqlite/ddl";
import { OBJECTS_TABLE, REBUILD_TABLE_PREFIX } from "@/constants";
import { typeAffinity } from "@/utils/data/format";
import { quoteIdent, sqlLiteral } from "@/lib/sqlite/sql";
import type { Schema, ExtraObject, RelationInfo, ColumnInfo } from "@/types/lib/sqlite/types";
import type {
  DraftTable,
  ColumnChange,
  Draft,
  DiagramColumn,
  DiagramTable,
  DiagramEdge,
  Diagram,
  ColumnEditMode,
} from "@/types/features/vis/lib/model";

export const EMPTY_DRAFT: Draft = {
  tables: [],
  addedColumns: {},
  renamedTables: {},
  droppedTables: [],
  columnChanges: {},
  objects: {},
};

/** How an imported object is keyed in a draft: its kind and name as stored. */
export const objectKey = (o: { kind: string; name: string }) => `${o.kind}:${o.name}`;

/** The imported schema's objects as they will be after saving, in order. */
export function currentObjects(schema: Schema | null | undefined, draft: Draft): ExtraObject[] {
  const stored = schema?.objects ?? [];
  const storedKeys = new Set(stored.map(objectKey));
  const kept = stored.flatMap((o) => {
    const key = objectKey(o);
    if (!(key in draft.objects)) return [o];
    const next = draft.objects[key];
    return next ? [next] : [];
  });
  const added = Object.entries(draft.objects)
    .filter(([key, o]) => !storedKeys.has(key) && o !== null)
    .map(([, o]) => o!);
  return [...kept, ...added];
}

/** Sets (or, with null, deletes) an imported object; `key` is its key as stored. */
export function setObject(draft: Draft, key: string, object: ExtraObject | null): Draft {
  return { ...draft, objects: { ...draft.objects, [key]: object } };
}

/** Forgets the draft's change to an object. */
export function revertObject(draft: Draft, key: string): Draft {
  const objects = { ...draft.objects };
  delete objects[key];
  return { ...draft, objects };
}

/**
 * SQL that stores an imported schema's database type and objects (`OBJECTS_TABLE`).
 * Mirrors `objects_sql` in `crates/sequill-core/src/sql_objects.rs`.
 */
export function objectsTableStatements(dialect: string, objects: ExtraObject[]): string[] {
  const rows: [string, string, string | null, string][] = [
    ["dialect", dialect, null, ""],
    ...objects.map((o): [string, string, string | null, string] => [
      o.kind,
      o.name,
      o.table,
      o.body,
    ]),
  ];
  return [
    `CREATE TABLE ${quoteIdent(OBJECTS_TABLE)} (kind TEXT NOT NULL, name TEXT NOT NULL, tbl TEXT, body TEXT NOT NULL, PRIMARY KEY (kind, name));`,
    ...rows.map(
      (r) =>
        `INSERT OR REPLACE INTO ${quoteIdent(OBJECTS_TABLE)} VALUES (${r.map(sqlLiteral).join(", ")});`,
    ),
  ];
}

/** Fills in fields missing from drafts saved by earlier versions. */
export function normalizeDraft(draft: Partial<Draft>): Draft {
  return { ...EMPTY_DRAFT, ...draft, objects: draft.objects ?? {} };
}

/** Handle id used when a relationship targets a table rather than a known column. */
export const TABLE_HANDLE = "__table__";

export const existingId = (name: string) => `t:${name}`;
export const draftTableId = (id: string) => `d:${id}`;

let seq = 0;
export function newDraftId(): string {
  seq += 1;
  return `${Date.now().toString(36)}${seq.toString(36)}`;
}

function draftColumn(c: ColumnDef, key: string): DiagramColumn {
  return {
    key,
    name: c.name,
    type: c.type,
    pk: c.primaryKey,
    notNull: c.notNull || c.primaryKey,
    fk: c.references?.table
      ? { table: c.references.table, column: c.references.column || null }
      : null,
    draft: true,
  };
}

/** An existing column as an editable definition (what a rebuild would recreate). */
export function columnDefFromInfo(rel: RelationInfo, col: ColumnInfo): ColumnDef {
  const fk = rel.foreignKeys.find(
    (k) => k.from === col.name && rel.foreignKeys.filter((x) => x.id === k.id).length === 1,
  );
  const pkCount = rel.columns.filter((c) => c.pk > 0).length;
  return {
    name: col.name,
    type: col.type,
    primaryKey: col.pk > 0,
    autoincrement: col.pk > 0 && pkCount === 1 && /\bAUTOINCREMENT\b/i.test(rel.sql ?? ""),
    notNull: col.notNull,
    unique: rel.indexes.some(
      (ix) => ix.origin === "u" && ix.columns.length === 1 && ix.columns[0] === col.name,
    ),
    defaultKind: col.defaultValue === null ? "none" : "expression",
    defaultValue: col.defaultValue ?? "",
    references: fk ? { table: fk.table, column: fk.to ?? "", onDelete: fk.onDelete } : null,
  };
}

/** True when a change needs more than a rename (SQLite then has to rebuild the table). */
export function needsRebuild(base: ColumnDef, def: ColumnDef): boolean {
  const strip = (c: ColumnDef) => JSON.stringify({ ...c, name: "" });
  return strip(base) !== strip(def);
}

export function buildDiagram(
  schema: Schema | null | undefined,
  draft: Draft,
  showViews = true,
): Diagram {
  const tables: DiagramTable[] = [];
  const shown = schema
    ? [
        ...schema.tables.filter((t) => t.name !== "sqlite_sequence"),
        ...(showViews ? schema.views : []),
      ]
    : [];

  for (const rel of shown) {
    const fkByColumn = new Map(rel.foreignKeys.map((k) => [k.from, k]));
    const changes = draft.columnChanges[rel.name] ?? {};
    const columns: DiagramColumn[] = rel.columns
      .filter((c) => c.hidden !== 1)
      .map((c) => {
        const change = changes[c.name];
        if (change?.kind === "change") {
          return {
            ...draftColumn(change.def, `o:${c.name}`),
            draft: false,
            change: "edited",
            originalName: c.name,
          };
        }
        const fk = fkByColumn.get(c.name);
        return {
          key: `o:${c.name}`,
          name: c.name,
          type: c.type,
          pk: c.pk > 0,
          notNull: c.notNull || c.pk > 0,
          fk: fk ? { table: fk.table, column: fk.to } : null,
          draft: false,
          originalName: c.name,
          ...(change?.kind === "drop" && { change: "dropped" as const }),
        };
      });
    (draft.addedColumns[rel.name] ?? []).forEach((added, i) =>
      columns.push(draftColumn(added, `a:${i}`)),
    );
    const dropped = draft.droppedTables.includes(rel.name);
    const renamed = draft.renamedTables[rel.name];
    tables.push({
      id: existingId(rel.name),
      name: renamed ?? rel.name,
      kind: rel.kind,
      columns,
      originalName: rel.name,
      ...(dropped ? { change: "dropped" as const } : renamed ? { change: "renamed" as const } : {}),
    });
  }

  for (const t of draft.tables) {
    tables.push({
      id: draftTableId(t.id),
      name: t.name || "untitled",
      kind: "draft",
      columns: t.columns.map((c, i) => draftColumn(c, `n:${i}`)),
      draftId: t.id,
    });
  }

  // References may use a table's current or its new name.
  const byName = new Map<string, DiagramTable>();
  for (const t of tables) {
    if (t.change === "dropped") continue;
    byName.set(t.name.toLowerCase(), t);
    if (t.originalName) byName.set(t.originalName.toLowerCase(), t);
  }
  const edges: DiagramEdge[] = [];
  for (const table of tables) {
    if (table.change === "dropped") continue;
    for (const col of table.columns) {
      if (!col.fk || col.change === "dropped") continue;
      const parent = byName.get(col.fk.table.toLowerCase());
      if (!parent) continue;
      const live = parent.columns.filter((c) => c.change !== "dropped");
      const wanted = col.fk.column;
      const target = wanted
        ? live.find((c) => c.originalName === wanted || c.name === wanted)
        : live.find((c) => c.pk);
      const targetColumn = target?.name ?? TABLE_HANDLE;
      edges.push({
        id: `${table.id}.${col.name}->${parent.id}.${targetColumn}`,
        source: table.id,
        sourceColumn: col.name,
        target: parent.id,
        targetColumn,
        draft: col.draft || col.change === "edited",
      });
    }
  }
  return { tables, edges };
}

/**
 * Rebuilds a table with new column definitions (SQLite can't change a column's
 * type or constraints in place): copy into a new table, swap it in, recreate
 * the table's indexes and triggers and every view.
 */
function rebuildStatements(rel: RelationInfo, defs: ColumnDef[], schema: Schema): string[] {
  const tmp = `${REBUILD_TABLE_PREFIX}${rel.name}`;
  const cols = defs.map((d) => quoteIdent(d.name)).join(", ");
  const views = schema.views.filter((v) => v.sql);
  const objects = [
    ...schema.indexes.filter((i) => i.table === rel.name && i.sql),
    ...schema.triggers.filter((t) => t.table === rel.name && t.sql),
  ];
  return [
    ...views.map((v) => buildDrop("view", v.name)),
    buildCreateTable({
      name: tmp,
      columns: defs,
      withoutRowid: rel.withoutRowid,
      strict: rel.strict,
    }),
    `INSERT INTO ${quoteIdent(tmp)} (${cols}) SELECT ${cols} FROM ${quoteIdent(rel.name)};`,
    buildDrop("table", rel.name),
    // Swap without re-validating other objects that point at the table mid-rebuild.
    "PRAGMA legacy_alter_table = ON;",
    buildRenameTable(tmp, rel.name),
    "PRAGMA legacy_alter_table = OFF;",
    ...objects.map((o) => withSemicolon(o.sql!)),
    ...views.map((v) => withSemicolon(v.sql!)),
  ];
}

/** Final definitions for a rebuilt table: dropped columns left out, changes applied under the current names. */
function rebuildDefs(rel: RelationInfo, changes: Record<string, ColumnChange>): ColumnDef[] {
  return rel.columns
    .filter((c) => c.hidden === 0 && changes[c.name]?.kind !== "drop")
    .map((c) => {
      const change = changes[c.name];
      return change?.kind === "change"
        ? { ...change.def, name: c.name }
        : columnDefFromInfo(rel, c);
    });
}

/** Tables whose pending changes need a rebuild. */
export function tablesToRebuild(schema: Schema | null | undefined, draft: Draft): RelationInfo[] {
  if (!schema) return [];
  return schema.tables.filter((rel) => {
    if (draft.droppedTables.includes(rel.name)) return false;
    return Object.entries(draft.columnChanges[rel.name] ?? {}).some(([name, change]) => {
      const col = rel.columns.find((c) => c.name === name);
      return (
        change.kind === "change" && col && needsRebuild(columnDefFromInfo(rel, col), change.def)
      );
    });
  });
}

/**
 * The SQL that saves the draft, in an order where each step sees what it expects:
 * drop tables, drop columns, rebuild changed tables, rename columns, add columns,
 * rename tables, create new tables. Runs in one transaction with foreign keys paused.
 */
export function draftStatements(draft: Draft, schema?: Schema | null): string[] {
  const out: string[] = [];
  const rels = new Map((schema?.tables ?? []).map((t) => [t.name, t]));
  const live = (table: string) => !draft.droppedTables.includes(table);

  for (const table of draft.droppedTables) out.push(buildDrop("table", table));

  for (const [table, changes] of Object.entries(draft.columnChanges)) {
    if (!live(table)) continue;
    for (const [col, change] of Object.entries(changes)) {
      if (change.kind === "drop") out.push(buildDropColumn(table, col));
    }
  }

  if (schema) {
    for (const rel of tablesToRebuild(schema, draft)) {
      out.push(...rebuildStatements(rel, rebuildDefs(rel, draft.columnChanges[rel.name]), schema));
    }
  }

  for (const [table, changes] of Object.entries(draft.columnChanges)) {
    if (!live(table)) continue;
    for (const [col, change] of Object.entries(changes)) {
      if (change.kind === "change" && change.def.name.trim() !== col) {
        out.push(buildRenameColumn(table, col, change.def.name));
      }
    }
  }

  for (const [table, columns] of Object.entries(draft.addedColumns)) {
    if (!live(table) || (schema && !rels.has(table))) continue;
    for (const c of columns) out.push(buildAddColumn(table, c));
  }

  for (const [table, name] of Object.entries(draft.renamedTables)) {
    if (live(table) && name.trim() !== table) out.push(buildRenameTable(table, name));
  }

  for (const t of draft.tables) {
    out.push(
      buildCreateTable({
        name: t.name,
        columns: t.columns,
        withoutRowid: t.withoutRowid,
        strict: t.strict,
      }),
    );
  }

  // An imported schema's objects are rows of OBJECTS_TABLE: replace the changed ones.
  if (schema?.dialect) {
    const table = quoteIdent(OBJECTS_TABLE);
    for (const [key, object] of Object.entries(draft.objects)) {
      const [kind, ...name] = key.split(":");
      out.push(
        `DELETE FROM ${table} WHERE kind = ${sqlLiteral(kind)} AND name = ${sqlLiteral(name.join(":"))}`,
      );
      if (object) {
        const values = [object.kind, object.name.trim(), object.table, object.body];
        out.push(`INSERT INTO ${table} VALUES (${values.map(sqlLiteral).join(", ")})`);
      }
    }
  }
  return out;
}

const withSemicolon = (sql: string) => (sql.trim().endsWith(";") ? sql.trim() : `${sql.trim()};`);

/**
 * The schema of an existing database as SQL (no rows): tables first, then
 * indexes, triggers and views, so every object finds what it depends on.
 * sqlite_sequence and automatic indexes are recreated by SQLite itself.
 */
export function schemaStatements(schema: Schema | null | undefined): string[] {
  if (!schema) return [];
  const sqlOf = (items: { name: string; sql: string | null }[]) =>
    items.filter((i) => i.sql && i.name !== "sqlite_sequence").map((i) => withSemicolon(i.sql!));
  return [
    ...sqlOf(schema.tables),
    ...sqlOf(schema.indexes),
    ...sqlOf(schema.triggers),
    ...sqlOf(schema.views),
    ...(schema.dialect ? objectsTableStatements(schema.dialect, schema.objects) : []),
  ];
}

/** Everything needed to build a new database: the current schema plus the design. */
export function newDatabaseStatements(schema: Schema | null | undefined, draft: Draft): string[] {
  return [...schemaStatements(schema), ...draftStatements(draft, schema)];
}

export function isDraftEmpty(draft: Draft): boolean {
  return (
    draft.tables.length === 0 &&
    Object.values(draft.addedColumns).every((c) => c.length === 0) &&
    Object.keys(draft.renamedTables).length === 0 &&
    draft.droppedTables.length === 0 &&
    Object.values(draft.columnChanges).every((c) => Object.keys(c).length === 0) &&
    Object.keys(draft.objects).length === 0
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Short phrases for what the draft changes, e.g. ["1 new table", "2 columns changed"]. */
export function changeSummary(draft: Draft): string[] {
  const added = Object.values(draft.addedColumns).flat().length;
  const changes = Object.values(draft.columnChanges).flatMap((c) => Object.values(c));
  const dropped = changes.filter((c) => c.kind === "drop").length;
  const edited = changes.length - dropped;
  const renamed = Object.keys(draft.renamedTables).length;
  return [
    draft.tables.length > 0 && plural(draft.tables.length, "new table", "new tables"),
    added > 0 && plural(added, "new column", "new columns"),
    edited > 0 && plural(edited, "column changed", "columns changed"),
    dropped > 0 && plural(dropped, "column deleted", "columns deleted"),
    renamed > 0 && plural(renamed, "table renamed", "tables renamed"),
    draft.droppedTables.length > 0 &&
      plural(draft.droppedTables.length, "table deleted", "tables deleted"),
    Object.keys(draft.objects).length > 0 &&
      plural(Object.keys(draft.objects).length, "object changed", "objects changed"),
  ].filter((p): p is string => !!p);
}

/** "Enum", "Function"…: an object kind as the start of a sentence. */
const kindLabel = (kind: string) => kind.charAt(0).toUpperCase() + kind.slice(1);

/** An enum's values, from its stored body (a JSON array); [] if unreadable. */
/** Non-empty values that appear more than once. */
export function duplicateValues(values: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const v of values) {
    if (v && seen.has(v)) dupes.add(v);
    seen.add(v);
  }
  return dupes;
}

export function enumValues(object: Pick<ExtraObject, "body">): string[] {
  try {
    const values: unknown = JSON.parse(object.body);
    return Array.isArray(values) ? values.map(String) : [];
  } catch {
    return [];
  }
}

/** How a column default reads in a change list. */
function defaultText(c: ColumnDef): string {
  switch (c.defaultKind) {
    case "none":
      return "no default";
    case "null":
      return "default NULL";
    case "text":
      return `default '${c.defaultValue}'`;
    default:
      return `default ${c.defaultValue}`;
  }
}

/** What differs between a column as it is and as designed, e.g. ["type TEXT → INTEGER"]. */
function columnDifferences(base: ColumnDef, def: ColumnDef): string[] {
  const flag = (on: boolean, what: string) => (on ? `now ${what}` : `no longer ${what}`);
  const ref = (c: ColumnDef) =>
    c.references ? `${c.references.table}.${c.references.column}` : "nothing";
  return [
    base.name !== def.name && `renamed to "${def.name}"`,
    base.type !== def.type && `type ${base.type || "none"} → ${def.type || "none"}`,
    base.notNull !== def.notNull && flag(def.notNull, "NOT NULL"),
    base.unique !== def.unique && flag(def.unique, "UNIQUE"),
    base.primaryKey !== def.primaryKey && flag(def.primaryKey, "the primary key"),
    defaultText(base) !== defaultText(def) && defaultText(def),
    ref(base) !== ref(def) && `references ${ref(def)}`,
  ].filter((d): d is string => !!d);
}

/**
 * Everything a save would change, one plain sentence per change, for the review before
 * saving (the SQL shows how; this shows what).
 */
export function changeDetails(schema: Schema | null | undefined, draft: Draft): string[] {
  const rels = new Map((schema?.tables ?? []).map((t) => [t.name, t]));
  const out: string[] = [];
  for (const t of draft.tables) {
    const names = t.columns.map((c) => c.name).join(", ");
    out.push(
      `New table "${t.name}" with ${plural(t.columns.length, "column", "columns")}: ${names}`,
    );
  }
  for (const table of draft.droppedTables) {
    out.push(`Table "${table}" deleted, with all its rows`);
  }
  const live = (table: string) => !draft.droppedTables.includes(table);
  for (const [from, to] of Object.entries(draft.renamedTables)) {
    if (live(from)) out.push(`Table "${from}" renamed to "${to}"`);
  }
  for (const [table, columns] of Object.entries(draft.addedColumns)) {
    if (!live(table)) continue;
    for (const c of columns) {
      const ref = c.references ? `, references ${c.references.table}.${c.references.column}` : "";
      out.push(`"${table}": new column "${c.name}" (${c.type || "no type"}${ref})`);
    }
  }
  for (const [table, changes] of Object.entries(draft.columnChanges)) {
    if (!live(table)) continue;
    const rel = rels.get(table);
    for (const [column, change] of Object.entries(changes)) {
      if (change.kind === "drop") {
        out.push(`"${table}": column "${column}" deleted, with its data`);
        continue;
      }
      const info = rel?.columns.find((c) => c.name === column);
      const diffs = rel && info ? columnDifferences(columnDefFromInfo(rel, info), change.def) : [];
      out.push(`"${table}": column "${column}" ${diffs.length > 0 ? diffs.join(", ") : "changed"}`);
    }
  }
  const stored = new Map((schema?.objects ?? []).map((o) => [objectKey(o), o]));
  for (const [key, object] of Object.entries(draft.objects)) {
    const before = stored.get(key);
    const label = kindLabel(object?.kind ?? before?.kind ?? key.split(":")[0]);
    const name = before?.name ?? object?.name ?? "";
    if (!object) {
      out.push(`${label} "${name}" deleted`);
      continue;
    }
    const renamed = before && before.name !== object.name ? `, renamed to "${object.name}"` : "";
    const what =
      object.kind === "enum" ? `values ${enumValues(object).join(", ") || "none"}` : "SQL changed";
    out.push(
      before ? `${label} "${name}": ${what}${renamed}` : `New ${object.kind} "${object.name}"`,
    );
  }
  return out;
}

/** Tables a column can point at after saving, with their columns. */
export function referenceTargets(diagram: Diagram): { name: string; columns: string[] }[] {
  return diagram.tables
    .filter((t) => t.kind !== "view" && t.change !== "dropped")
    .map((t) => ({
      name: t.name,
      columns: t.columns.filter((c) => c.change !== "dropped").map((c) => c.name),
    }));
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Things to know before saving: what a rebuild can't keep, and views a deletion breaks. */
export function saveWarnings(schema: Schema | null | undefined, draft: Draft): string[] {
  const rebuilds = tablesToRebuild(schema, draft)
    .filter((rel) => /\bCHECK\b|\bCOLLATE\b|UNIQUE\s*\(/i.test(rel.sql ?? ""))
    .map(
      (rel) =>
        `${rel.name} is rebuilt to change column types or constraints; its CHECK, COLLATE and multi-column UNIQUE rules aren't kept.`,
    );
  const views = (schema?.views ?? []).flatMap((view) => {
    const uses = draft.droppedTables.filter((t) =>
      new RegExp(`\\b${escapeRegExp(t)}\\b`, "i").test(view.sql ?? ""),
    );
    return uses.length > 0
      ? [
          `The view ${view.name} uses ${uses.join(", ")}, which you're deleting; it will stop working.`,
        ]
      : [];
  });
  return [...rebuilds, ...views];
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Problems that stop the draft from being applied, in plain words. */
export function validateDraft(schema: Schema | null | undefined, draft: Draft): string[] {
  const problems: string[] = [];
  const finalNames = new Map<string, string>(); // lower-case final name → description
  for (const rel of relations(schema)) {
    if (draft.droppedTables.includes(rel.name)) continue;
    const name = (draft.renamedTables[rel.name] ?? rel.name).trim();
    if (!name) problems.push(`Table ${rel.name} needs a name`);
    const key = name.toLowerCase();
    if (finalNames.has(key)) problems.push(`Two tables would be called "${name}"`);
    finalNames.set(key, name);
  }

  const newNames = new Set<string>();
  for (const t of draft.tables) {
    const key = t.name.trim().toLowerCase();
    if (!key) {
      problems.push("A new table has no name");
      continue;
    }
    if (newNames.has(key)) problems.push(`Two new tables are called "${t.name}"`);
    else if (finalNames.has(key)) {
      problems.push(`A table or view called "${t.name}" already exists`);
    }
    newNames.add(key);
    finalNames.set(key, t.name);
    try {
      buildCreateTable({
        name: t.name,
        columns: t.columns,
        withoutRowid: t.withoutRowid,
        strict: t.strict,
      });
    } catch (error) {
      problems.push(`${t.name}: ${errorText(error)}`);
    }
  }

  for (const rel of schema?.tables ?? []) {
    if (draft.droppedTables.includes(rel.name)) continue;
    const changes = draft.columnChanges[rel.name] ?? {};
    const added = draft.addedColumns[rel.name] ?? [];
    const names = new Set<string>();
    const add = (name: string) => {
      const key = name.trim().toLowerCase();
      if (!key) problems.push(`A column of ${rel.name} has no name`);
      else if (names.has(key)) problems.push(`${rel.name} would have two columns called "${name}"`);
      names.add(key);
    };
    for (const c of rel.columns.filter((x) => x.hidden !== 1)) {
      const change = changes[c.name];
      if (change?.kind === "drop") continue;
      add(change?.kind === "change" ? change.def.name : c.name);
    }
    for (const c of added) {
      add(c.name);
      try {
        buildAddColumn(rel.name, c);
      } catch (error) {
        problems.push(`${rel.name}.${c.name || "?"}: ${errorText(error)}`);
      }
    }
    if (names.size === 0)
      problems.push(`${rel.name} would have no columns left; delete the table instead`);
  }

  for (const rel of tablesToRebuild(schema, draft)) {
    if (rel.columns.some((c) => c.hidden >= 2)) {
      problems.push(`${rel.name} has generated columns, so its column types can't be changed here`);
      continue;
    }
    try {
      buildCreateTable({
        name: rel.name,
        columns: rebuildDefs(rel, draft.columnChanges[rel.name]),
        withoutRowid: rel.withoutRowid,
        strict: rel.strict,
      });
    } catch (error) {
      problems.push(`${rel.name}: ${errorText(error)}`);
    }
  }
  // Every pending relationship links columns of fitting types.
  problems.push(...edgeTypeProblems(buildDiagram(schema, draft)).values());
  // Imported objects need a name, unique within their kind.
  const seen = new Set<string>();
  for (const object of currentObjects(schema, draft)) {
    const key = `${object.kind}:${object.name.trim().toLowerCase()}`;
    if (!object.name.trim()) problems.push(`A ${object.kind} needs a name`);
    else if (seen.has(key)) problems.push(`Two ${object.kind}s are called ${object.name}`);
    seen.add(key);
  }
  return problems;
}

export function createDraftTable(
  draft: Draft,
  schema: Schema | null | undefined,
): { draft: Draft; table: DraftTable } {
  const taken = new Set(
    [
      ...(schema?.tables ?? []).map((t) => draft.renamedTables[t.name] ?? t.name),
      ...(schema?.views ?? []).map((t) => t.name),
      ...draft.tables.map((t) => t.name),
    ].map((n) => n.toLowerCase()),
  );
  let n = draft.tables.length + 1;
  while (taken.has(`table_${n}`)) n++;
  const table: DraftTable = {
    id: newDraftId(),
    name: `table_${n}`,
    columns: [{ ...emptyColumn("id"), type: "INTEGER", primaryKey: true }],
    withoutRowid: false,
    strict: false,
  };
  return { draft: { ...draft, tables: [...draft.tables, table] }, table };
}

/** Points references at `to` wherever they pointed at `from` (new tables and new columns). */
function retargetReferences(draft: Draft, from: string, to: string | null): Draft {
  const retarget = (c: ColumnDef): ColumnDef =>
    c.references?.table === from
      ? { ...c, references: to === null ? null : { ...c.references, table: to } }
      : c;
  return {
    ...draft,
    tables: draft.tables.map((t) => ({ ...t, columns: t.columns.map(retarget) })),
    addedColumns: Object.fromEntries(
      Object.entries(draft.addedColumns).map(([k, cols]) => [k, cols.map(retarget)]),
    ),
  };
}

export function updateDraftTable(draft: Draft, id: string, next: DraftTable): Draft {
  const previous = draft.tables.find((t) => t.id === id);
  const replaced = { ...draft, tables: draft.tables.map((t) => (t.id === id ? next : t)) };
  return previous && previous.name !== next.name
    ? retargetReferences(replaced, previous.name, next.name)
    : replaced;
}

export function removeDraftTable(draft: Draft, id: string): Draft {
  const removed = draft.tables.find((t) => t.id === id);
  const without = { ...draft, tables: draft.tables.filter((t) => t.id !== id) };
  return removed ? retargetReferences(without, removed.name, null) : without;
}

export function setAddedColumns(draft: Draft, table: string, columns: ColumnDef[]): Draft {
  const addedColumns = { ...draft.addedColumns };
  if (columns.length === 0) delete addedColumns[table];
  else addedColumns[table] = columns;
  return { ...draft, addedColumns };
}

/** Renames an existing table (null or the current name undoes it). */
export function setTableRename(draft: Draft, table: string, name: string | null): Draft {
  const renamedTables = { ...draft.renamedTables };
  if (name === null || name === table) delete renamedTables[table];
  else renamedTables[table] = name;
  return { ...draft, renamedTables };
}

/** Marks an existing table to be deleted, or restores it. */
export function setTableDropped(draft: Draft, table: string, dropped: boolean): Draft {
  const droppedTables = draft.droppedTables.filter((t) => t !== table);
  if (dropped) droppedTables.push(table);
  return { ...draft, droppedTables };
}

/** Sets or clears (null) a pending change to an existing column. */
export function setColumnChange(
  draft: Draft,
  table: string,
  column: string,
  change: ColumnChange | null,
): Draft {
  const forTable = { ...(draft.columnChanges[table] ?? {}) };
  if (change === null) delete forTable[column];
  else forTable[column] = change;
  const columnChanges = { ...draft.columnChanges };
  if (Object.keys(forTable).length === 0) delete columnChanges[table];
  else columnChanges[table] = forTable;
  return { ...draft, columnChanges };
}

/** Records an edited definition for an existing column; going back to the original clears it. */
export function editExistingColumn(
  draft: Draft,
  rel: RelationInfo,
  column: string,
  def: ColumnDef,
): Draft {
  const col = rel.columns.find((c) => c.name === column);
  if (!col) return draft;
  const base = columnDefFromInfo(rel, col);
  const unchanged = def.name === column && !needsRebuild(base, def);
  return setColumnChange(draft, rel.name, column, unchanged ? null : { kind: "change", def });
}

/** The editable definition of an existing column, with any pending change applied. */
export function currentColumnDef(
  draft: Draft,
  rel: RelationInfo,
  column: string,
): ColumnDef | null {
  const change = draft.columnChanges[rel.name]?.[column];
  if (change?.kind === "change") return change.def;
  const col = rel.columns.find((c) => c.name === column);
  return col ? columnDefFromInfo(rel, col) : null;
}

/** Integer, real and numeric values compare as numbers, so those types can link to each other. */
function typeFamily(type: string): string | null {
  if (!type.trim()) return null; // no declared type: holds anything
  const affinity = typeAffinity(type);
  return affinity === "TEXT" || affinity === "BLOB" ? affinity : "NUMBER";
}

/** Why a column can't reference another because of their types, or null when they fit. */
function referenceTypeProblem(
  from: { table: string; column: DiagramColumn },
  to: { table: string; column: DiagramColumn },
): string | null {
  const a = typeFamily(from.column.type);
  const b = typeFamily(to.column.type);
  if (a === null || b === null || a === b) return null;
  return `${from.table}.${from.column.name} is ${from.column.type} but ${to.table}.${to.column.name} is ${to.column.type}; linked columns need the same type`;
}

/** The column a line ends at: the named one, or the table's primary key for TABLE_HANDLE. */
function targetColumnOf(table: DiagramTable, column: string): DiagramColumn | undefined {
  const live = table.columns.filter((c) => c.change !== "dropped");
  return column === TABLE_HANDLE ? live.find((c) => c.pk) : live.find((c) => c.name === column);
}

/** Pending relationships whose column types don't match, by edge id, with the reason. */
export function edgeTypeProblems(diagram: Diagram): Map<string, string> {
  const problems = new Map<string, string>();
  for (const edge of diagram.edges) {
    if (!edge.draft) continue;
    const source = diagram.tables.find((t) => t.id === edge.source);
    const target = diagram.tables.find((t) => t.id === edge.target);
    const from = source?.columns.find((c) => c.name === edge.sourceColumn);
    const to = target && targetColumnOf(target, edge.targetColumn);
    if (!source || !target || !from || !to) continue;
    const problem = referenceTypeProblem(
      { table: source.name, column: from },
      { table: target.name, column: to },
    );
    if (problem) problems.set(edge.id, problem);
  }
  return problems;
}

/**
 * Creates a relationship by pointing a column at another table's column. New
 * columns get a REFERENCES clause; existing ones become a pending change
 * (saved by rebuilding the table).
 */
export function connectColumns(
  draft: Draft,
  diagram: Diagram,
  from: { table: string; column: string },
  to: { table: string; column: string },
  schema?: Schema | null,
): { draft: Draft } | { error: string } {
  const source = diagram.tables.find((t) => t.id === from.table);
  const target = diagram.tables.find((t) => t.id === to.table);
  if (!source || !target) return { error: "Pick two tables to connect" };
  if (target.kind === "view") return { error: "A foreign key can't point at a view" };
  if (source.kind === "view" || source.kind === "virtual") {
    return { error: "Only tables can have foreign keys" };
  }
  if (source.change === "dropped" || target.change === "dropped") {
    return { error: "That table is marked for deletion" };
  }
  const column = source.columns.find((c) => c.name === from.column);
  if (!column || column.change === "dropped") return { error: "Pick a column to start from" };
  const targetColumn = targetColumnOf(target, to.column);
  // A new column holds no data yet, so it takes the type of the column it points at.
  // An existing one keeps its type, and must already match.
  const typeProblem =
    !column.draft &&
    targetColumn &&
    referenceTypeProblem(
      { table: source.name, column },
      { table: target.name, column: targetColumn },
    );
  if (typeProblem) return { error: typeProblem };
  const references = {
    table: target.name,
    column: to.column === TABLE_HANDLE ? "" : to.column,
    onDelete: "NO ACTION",
  };
  const point = (c: ColumnDef): ColumnDef =>
    c.name === from.column
      ? { ...c, references, ...(targetColumn && { type: targetColumn.type }) }
      : c;

  if (source.draftId) {
    return {
      draft: {
        ...draft,
        tables: draft.tables.map((t) =>
          t.id === source.draftId ? { ...t, columns: t.columns.map(point) } : t,
        ),
      },
    };
  }
  if (column.draft) {
    const key = source.originalName ?? source.name;
    return { draft: setAddedColumns(draft, key, (draft.addedColumns[key] ?? []).map(point)) };
  }
  const rel = schema?.tables.find((t) => t.name === source.originalName);
  const original = column.originalName ?? column.name;
  const base = rel && currentColumnDef(draft, rel, original);
  if (!rel || !base) return { error: "That column can't be changed here" };
  return { draft: editExistingColumn(draft, rel, original, { ...base, references }) };
}

/** Whether a line's end is a column that isn't in the database yet. */
export function isNewColumn(diagram: Diagram, end: { table: string; column: string }): boolean {
  const table = diagram.tables.find((t) => t.id === end.table);
  return !!table?.columns.find((c) => c.name === end.column)?.draft;
}

/* ---- Editing from the outline: one interface for every kind of column ---- */

const relationOf = (schema: Schema | null | undefined, table: DiagramTable) =>
  schema?.tables.find((t) => t.name === table.originalName);

function uniqueColumnName(taken: string[]): string {
  const names = new Set(taken.map((n) => n.toLowerCase()));
  let n = taken.length + 1;
  while (names.has(`column_${n}`)) n++;
  return `column_${n}`;
}

/** The editable definition of a column, and which options apply ("add": SQLite's ADD COLUMN limits). */
export function columnForEditing(
  draft: Draft,
  schema: Schema | null | undefined,
  table: DiagramTable,
  key: string,
): { def: ColumnDef; mode: ColumnEditMode } | null {
  const [kind, id] = [key.slice(0, 1), key.slice(2)];
  if (kind === "n") {
    const def = draft.tables.find((t) => t.id === table.draftId)?.columns[Number(id)];
    return def ? { def, mode: "create" } : null;
  }
  if (kind === "a") {
    const def = draft.addedColumns[table.originalName ?? ""]?.[Number(id)];
    return def ? { def, mode: "add" } : null;
  }
  const rel = relationOf(schema, table);
  const def = rel && currentColumnDef(draft, rel, id);
  return def ? { def, mode: "create" } : null;
}

/** Edits the columns of a new table ("n" keys) or those added to an existing one ("a" keys). */
function mapNewColumns(
  draft: Draft,
  table: DiagramTable,
  kind: "n" | "a",
  f: (columns: ColumnDef[]) => ColumnDef[],
): Draft {
  if (kind === "n") {
    const t = draft.tables.find((x) => x.id === table.draftId);
    return t ? updateDraftTable(draft, t.id, { ...t, columns: f(t.columns) }) : draft;
  }
  const name = table.originalName ?? "";
  return setAddedColumns(draft, name, f(draft.addedColumns[name] ?? []));
}

export function updateColumn(
  draft: Draft,
  schema: Schema | null | undefined,
  table: DiagramTable,
  key: string,
  def: ColumnDef,
): Draft {
  const [kind, id] = [key.slice(0, 1), key.slice(2)];
  if (kind === "n" || kind === "a")
    return mapNewColumns(draft, table, kind, (cols) =>
      cols.map((c, i) => (i === Number(id) ? def : c)),
    );
  const rel = relationOf(schema, table);
  return rel ? editExistingColumn(draft, rel, id, def) : draft;
}

/** Deletes a column: new ones disappear, existing ones are marked (revertColumn restores them). */
export function dropColumn(draft: Draft, table: DiagramTable, key: string): Draft {
  const [kind, id] = [key.slice(0, 1), key.slice(2)];
  if (kind === "n" || kind === "a")
    return mapNewColumns(draft, table, kind, (cols) => cols.filter((_, i) => i !== Number(id)));
  return setColumnChange(draft, table.originalName ?? "", id, { kind: "drop" });
}

/** Undoes every pending change (edit or delete) to an existing column. */
export function revertColumn(draft: Draft, table: DiagramTable, key: string): Draft {
  return key.startsWith("o:")
    ? setColumnChange(draft, table.originalName ?? "", key.slice(2), null)
    : draft;
}

/** Adds a column to a new or an existing table; returns its key so it can be edited right away. */
export function addColumn(draft: Draft, table: DiagramTable): { draft: Draft; key: string } {
  const name = uniqueColumnName(table.columns.map((c) => c.name));
  if (table.draftId) {
    const t = draft.tables.find((x) => x.id === table.draftId)!;
    return {
      draft: updateDraftTable(draft, t.id, { ...t, columns: [...t.columns, emptyColumn(name)] }),
      key: `n:${t.columns.length}`,
    };
  }
  const original = table.originalName ?? table.name;
  const added = draft.addedColumns[original] ?? [];
  return {
    draft: setAddedColumns(draft, original, [...added, emptyColumn(name)]),
    key: `a:${added.length}`,
  };
}

export function renameTable(draft: Draft, table: DiagramTable, name: string): Draft {
  if (table.draftId) {
    const t = draft.tables.find((x) => x.id === table.draftId);
    return t ? updateDraftTable(draft, t.id, { ...t, name }) : draft;
  }
  return setTableRename(draft, table.originalName ?? table.name, name.trim() || null);
}

/** Deletes a table: new ones disappear, existing ones are marked (dropped=false restores them). */
export function dropTable(draft: Draft, table: DiagramTable, dropped = true): Draft {
  if (table.draftId) return removeDraftTable(draft, table.draftId);
  return setTableDropped(draft, table.originalName ?? table.name, dropped);
}
