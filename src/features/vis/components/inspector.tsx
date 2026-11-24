import type { TypeChoices } from "@/components/organisms/dialogs/type-picker";
import { ArrowRight, Plus, Trash, Unlink } from "@/components/atoms/icons";
import type { ReactNode } from "react";
import { Check, ColumnFields } from "@/components/organisms/dialogs/column-fields";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { ColorSwatches } from "./color-picker";
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
        <h3 className="q-label text-ink-muted">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Column editors with add / remove for a new table. */
function ColumnList({
  columns,
  onChange,
  tables,
  types,
}: {
  columns: ColumnDef[];
  onChange(columns: ColumnDef[]): void;
  tables: { name: string; columns: string[] }[];
  /** Another database's types and enums to suggest (see ColumnFields). */
  types?: TypeChoices;
}) {
  return (
    <div className="flex flex-col gap-2">
      {columns.map((col, i) => (
        <ColumnFields
          key={i}
          col={col}
          mode="create"
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
        className="self-start"
        onClick={() => onChange([...columns, emptyColumn(`column_${columns.length + 1}`)])}
      >
        <Plus /> Add column
      </Button>
    </div>
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
  colors: Record<string, TableColor>;
  onColorChange(id: string, color: TableColor | null): void;
  onDraftTableChange(table: DraftTable): void;
  onRemoveDraftTable(id: string): void;
  onDisconnect(edge: DiagramEdge): void;
  /** Another database's types and enums to suggest in column editors. */
  types?: TypeChoices;
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
            <Button variant="ghost" onClick={() => props.onRemoveDraftTable(def.id)}>
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
              className="font-mono"
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

  return null;
}
