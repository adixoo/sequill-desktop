import { ArrowRight, ExternalLink, Plus, Trash, Unlink } from "@/components/atoms/icons";
import { Link } from "@/components/atoms/link";
import { editorHref } from "@/lib/router";
import type { ReactNode } from "react";
import { Check, ColumnFields } from "@/components/organisms/dialogs/column-fields";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { useTableCount } from "@/hooks/use-db";
import { ColumnIcon, ColumnName } from "./change-marks";
import { ColorSwatches } from "./color-picker";
import { formatCount } from "@/utils/data/format";
import type { TableColor } from "@/features/vis/lib/colors";
import { emptyColumn, type ColumnDef } from "@/lib/sqlite/ddl";
import {
  edgeTypeProblems,
  referenceTargets,
  TABLE_HANDLE,
  type Diagram,
  type DiagramEdge,
  type DiagramTable,
  type Draft,
  type DraftTable,
} from "@/features/vis/lib/model";

export type Selection = { kind: "table"; id: string } | { kind: "edge"; id: string } | null;

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="pn-eyebrow text-ink-muted">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Column editors with add / remove, shared by new tables and new columns on existing tables. */
function ColumnList({
  columns,
  onChange,
  tables,
  mode,
  types,
}: {
  columns: ColumnDef[];
  onChange(columns: ColumnDef[]): void;
  tables: { name: string; columns: string[] }[];
  mode: "create" | "add";
  /** Another database's types and enums to suggest (see ColumnFields). */
  types?: readonly string[];
}) {
  return (
    <div className="flex flex-col gap-2">
      {columns.map((col, i) => (
        <ColumnFields
          key={i}
          col={col}
          mode={mode}
          tables={tables}
          types={types}
          onChange={(c) => onChange(columns.map((x, j) => (j === i ? c : x)))}
          actions={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${col.name || "column"}`}
              onClick={() => onChange(columns.filter((_, j) => j !== i))}
            >
              <Trash />
            </Button>
          }
        />
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onChange([...columns, emptyColumn(`column_${columns.length + 1}`)])}
      >
        <Plus /> Add column
      </Button>
    </div>
  );
}

function ExistingTableDetails({ table, dbId }: { table: DiagramTable; dbId: string | null }) {
  // Counted under the name it has in the database now.
  const dbName = table.originalName ?? table.name;
  const count = useTableCount(dbId ?? "", dbName, !!dbId && table.kind !== "virtual");
  return (
    <>
      <p className="text-sm text-ink-soft">
        {table.kind === "view" ? "View" : "Table"}
        {count.data !== undefined &&
          ` · ${formatCount(count.data)} ${count.data === 1 ? "row" : "rows"}`}
      </p>
      <ul className="flex flex-col divide-y divide-hairline rounded-sm bg-surface ring-2 ring-hairline ring-inset">
        {table.columns
          .filter((c) => !c.draft)
          .map((c) => (
            <li key={c.key} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <span className="flex w-3 shrink-0 justify-center">
                <ColumnIcon column={c} />
              </span>
              <ColumnName column={c} />
              <span className="ml-auto font-mono text-[0.6875rem] text-ink-muted uppercase">
                {c.type || "any"}
              </span>
            </li>
          ))}
      </ul>
      {table.change === "dropped" && (
        <p className="text-sm text-rose-ink">Deleted when you save, with its rows.</p>
      )}
      {dbId && table.change !== "dropped" && (
        <Button variant="outline" size="sm" asChild className="self-start">
          <Link href={editorHref(dbName)}>
            <ExternalLink /> Open in editor
          </Link>
        </Button>
      )}
    </>
  );
}

function ColorSection({
  table,
  colors,
  onColorChange,
}: {
  table: DiagramTable;
  colors: Record<string, TableColor>;
  onColorChange(id: string, color: TableColor | null): void;
}) {
  return (
    <Section title="Color">
      <ColorSwatches
        value={colors[table.id] ?? null}
        onChange={(color) => onColorChange(table.id, color)}
        label={`Color for ${table.name}`}
      />
    </Section>
  );
}

interface InspectorProps {
  selection: Selection;
  diagram: Diagram;
  draft: Draft;
  dbId: string | null;
  colors: Record<string, TableColor>;
  onColorChange(id: string, color: TableColor | null): void;
  onDraftTableChange(table: DraftTable): void;
  onRemoveDraftTable(id: string): void;
  onAddedColumnsChange(table: string, columns: ColumnDef[]): void;
  onDisconnect(edge: DiagramEdge): void;
  /** Another database's types and enums to suggest in column editors. */
  types?: readonly string[];
}

/** Details for the selected table or relationship; renders nothing when nothing is selected. */
export function Inspector(props: InspectorProps) {
  const { selection, diagram, draft } = props;
  const refTables = referenceTargets(diagram);

  if (selection?.kind === "edge") {
    const edge = diagram.edges.find((e) => e.id === selection.id);
    if (edge) {
      const source = diagram.tables.find((t) => t.id === edge.source);
      const target = diagram.tables.find((t) => t.id === edge.target);
      const typeProblem = edgeTypeProblems(diagram).get(edge.id);
      return (
        <div className="flex flex-col gap-4">
          <Section title={edge.draft ? "New relationship" : "Relationship"}>
            <p className="flex flex-wrap items-center gap-1.5 font-mono text-sm text-ink">
              {source?.name}.{edge.sourceColumn}
              <ArrowRight className="size-3.5 text-ink-muted" aria-label="references" />
              {target?.name}
              {edge.targetColumn !== TABLE_HANDLE && `.${edge.targetColumn}`}
            </p>
            <p className="text-sm text-ink-soft">
              Each {source?.name} row points at one {target?.name} row through this foreign key.
            </p>
            {typeProblem && (
              <p className="rounded-sm bg-rose-wash px-3 py-2 text-sm text-rose-ink">
                {typeProblem}. Change one of the types, or remove this relationship.
              </p>
            )}
            {edge.draft ? (
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => props.onDisconnect(edge)}
              >
                <Unlink /> Remove relationship
              </Button>
            ) : (
              <p className="text-xs text-ink-muted">
                SQLite can&apos;t change an existing foreign key in place; rebuild the table from
                the SQL console to change it.
              </p>
            )}
          </Section>
        </div>
      );
    }
  }

  const table =
    selection?.kind === "table" ? diagram.tables.find((t) => t.id === selection.id) : undefined;

  if (table?.kind === "draft") {
    const def = draft.tables.find((t) => t.id === table.draftId)!;
    return (
      <div className="flex flex-col gap-5">
        <Section
          title="New table"
          action={
            <Button variant="ghost" size="sm" onClick={() => props.onRemoveDraftTable(def.id)}>
              <Trash /> Remove
            </Button>
          }
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="draft-table-name">Name</Label>
            <Input
              id="draft-table-name"
              value={def.name}
              onChange={(e) => props.onDraftTableChange({ ...def, name: e.target.value })}
              className="font-mono max-md:text-base"
            />
          </div>
        </Section>
        <ColorSection table={table} {...props} />
        <Section title="Columns">
          <p className="text-xs text-ink-muted">
            To relate tables, drag from the dot at the right of a column on the diagram onto another
            table&apos;s column.
          </p>
          <ColumnList
            columns={def.columns}
            tables={refTables}
            types={props.types}
            mode="create"
            onChange={(columns) => props.onDraftTableChange({ ...def, columns })}
          />
          <div className="flex flex-wrap gap-4">
            <Check
              label="WITHOUT ROWID"
              checked={def.withoutRowid}
              onChange={(withoutRowid) => props.onDraftTableChange({ ...def, withoutRowid })}
            />
            <Check
              label="STRICT typing"
              checked={def.strict}
              onChange={(strict) => props.onDraftTableChange({ ...def, strict })}
            />
          </div>
        </Section>
      </div>
    );
  }

  if (table) {
    // New columns are keyed by the table's name in the database, which a pending rename doesn't change.
    const original = table.originalName ?? table.name;
    const added = draft.addedColumns[original] ?? [];
    return (
      <div className="flex flex-col gap-5">
        <Section title={table.name}>
          <ExistingTableDetails table={table} dbId={props.dbId} />
        </Section>
        <ColorSection table={table} {...props} />
        {table.kind === "table" && table.change !== "dropped" && (
          <Section title="New columns">
            <ColumnList
              columns={added}
              tables={refTables}
              types={props.types}
              mode="add"
              onChange={(columns) => props.onAddedColumnsChange(original, columns)}
            />
          </Section>
        )}
      </div>
    );
  }

  return null;
}
