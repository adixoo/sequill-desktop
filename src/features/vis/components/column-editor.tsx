import { Pencil, RotateCcw, Trash, Undo } from "@/components/atoms/icons";
import { useEffect, useRef, type ReactNode } from "react";
import { ColumnFields } from "@/components/organisms/dialogs/column-fields";
import { Button } from "@/components/atoms/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/atoms/popover";
import type { Schema } from "@/lib/sqlite/types";
import {
  columnForEditing,
  dropColumn,
  revertColumn,
  updateColumn,
  type DiagramColumn,
  type DiagramTable,
  type Draft,
} from "@/features/vis/lib/model";
import { cn } from "@/utils";

/** What the outline and the table cards need to edit the schema. Edits stay in the draft until saved. */
export interface SchemaEditor {
  draft: Draft;
  schema: Schema | undefined;
  /** The open database, for "Open in editor" links; null for a blank design. */
  dbId: string | null;
  /** Tables a column can reference, with their columns. */
  refTables: { name: string; columns: string[] }[];
  onChange(draft: Draft): void;
}

export const isEditableTable = (t: DiagramTable) =>
  (t.kind === "table" || t.kind === "draft") && t.change !== "dropped";

const swap = "transition-opacity duration-150";

/**
 * A column's type. When editable, a pencil takes its place while the row is
 * hovered or focused, or its editor is open. The row (or the trigger inside
 * it) carries the `group/col` class.
 */
export function ColumnType({ column, editable }: { column: DiagramColumn; editable?: boolean }) {
  return (
    <span className="relative ml-auto flex shrink-0 items-center">
      <span
        className={cn(
          "font-mono text-[0.625rem] tracking-[0.04em] text-ink-muted uppercase",
          editable &&
            cn(
              swap,
              "group-hover/col:opacity-0 group-focus-visible/col:opacity-0 group-data-[state=open]/col:opacity-0",
            ),
        )}
      >
        {column.type || "any"}
        {column.notNull && !column.pk && <span aria-label="not null">*</span>}
      </span>
      {editable && (
        <Pencil
          aria-hidden
          className={cn(
            swap,
            "absolute right-0 size-3.5 text-ink-soft opacity-0 group-hover/col:opacity-100 group-focus-visible/col:opacity-100 group-data-[state=open]/col:opacity-100",
          )}
        />
      )}
    </span>
  );
}

/** Layers that belong to an open editor: the popover itself and its dropdown lists. */
const INSIDE_EDITOR = '[data-radix-popper-content-wrapper], [data-slot="select-content"]';

/** The column editor in a popover beside `children`, its trigger. */
export function ColumnEditPopover({
  table,
  column,
  editor,
  open,
  onOpenChange,
  children,
}: {
  table: DiagramTable;
  column: DiagramColumn;
  editor: SchemaEditor;
  open: boolean;
  onOpenChange(open: boolean): void;
  children: ReactNode;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  // React Flow's canvas stops pointer events from reaching the document, so the popover
  // never hears about clicks there. Listen in the capture phase instead and close on any
  // press outside the trigger, the popover and its dropdown lists.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target || trigger.current?.contains(target)) return;
      if (target.closest(INSIDE_EDITOR)) return;
      onOpenChange(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, onOpenChange]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild ref={trigger}>
        {children}
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        className="w-[min(22rem,calc(100vw-2rem))] gap-0 p-3"
      >
        <ColumnEditor
          table={table}
          column={column}
          editor={editor}
          onClose={() => onOpenChange(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

/** The editor for one column, opened from a column row in the outline or on a table card. */
function ColumnEditor({
  table,
  column,
  editor,
  onClose,
}: {
  table: DiagramTable;
  column: DiagramColumn;
  editor: SchemaEditor;
  onClose(): void;
}) {
  const { draft, schema } = editor;
  if (column.change === "dropped") {
    return (
      <div className="flex flex-col gap-2 p-1">
        <p className="text-sm text-ink-soft">
          <span className="font-mono text-ink">{column.name}</span> is deleted from {table.name}{" "}
          when you save, with its data.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => editor.onChange(revertColumn(draft, table, column.key))}
        >
          <RotateCcw /> Restore column
        </Button>
      </div>
    );
  }
  const current = columnForEditing(draft, schema, table, column.key);
  if (!current)
    return <p className="p-1 text-sm text-ink-muted">This column can&apos;t be edited.</p>;
  const existing = column.key.startsWith("o:");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="pn-eyebrow min-w-0 truncate text-ink-muted">
          {existing ? "Edit column" : "New column"} · {table.name}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="-my-1 shrink-0 text-ink-muted hover:text-rose-ink"
          aria-label={`Delete column ${column.name || "unnamed"}`}
          title="Delete column"
          onClick={() => {
            editor.onChange(dropColumn(draft, table, column.key));
            // New columns disappear; existing ones stay listed as deleted.
            if (!existing) onClose();
          }}
        >
          <Trash />
        </Button>
      </div>
      <ColumnFields
        layout="form"
        col={current.def}
        mode={current.mode}
        tables={editor.refTables}
        onChange={(def) => editor.onChange(updateColumn(draft, schema, table, column.key, def))}
      />
      {(existing || column.change === "edited") && (
        <div className="-mx-3 -mb-3 flex items-center gap-3 border-t-2 border-hairline px-3 py-2">
          {existing && (
            <p className="text-xs text-ink-muted">
              Renames are saved in place. Other changes rebuild the table and keep its rows.
            </p>
          )}
          {column.change === "edited" && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto shrink-0"
              onClick={() => editor.onChange(revertColumn(draft, table, column.key))}
            >
              <Undo /> Undo
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
