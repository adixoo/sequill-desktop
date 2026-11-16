import { KeyRound, Link2, Minus } from "lucide-react";
import type { DiagramColumn, DiagramTable } from "@/features/vis/lib/model";
import { cn } from "@/shared/lib/utils";

/*
 * Unsaved schema changes: added is green, edited is blue, deleted is rose and
 * struck through. Color is the only visual cue besides the strike; screen readers get text.
 */

/** The icon before a column name: deleted, primary key or foreign key. */
export function ColumnIcon({ column }: { column: DiagramColumn }) {
  if (column.change === "dropped") {
    return <Minus className="size-3 text-rose-ink" aria-label="Deleted when you save" />;
  }
  if (column.pk) return <KeyRound className="size-3 text-butter-ink" aria-label="Primary key" />;
  if (column.fk) {
    return <Link2 className="size-3 text-sky-ink" aria-label={`References ${column.fk.table}`} />;
  }
  return null;
}

/** A column's name in the color of its pending change. */
export function ColumnName({ column, className }: { column: DiagramColumn; className?: string }) {
  return (
    <>
      <span
        className={cn(
          "truncate",
          column.change === "dropped"
            ? "text-rose-ink line-through"
            : column.change === "edited"
              ? "text-edited-ink"
              : column.draft
                ? "text-added-ink"
                : column.pk || column.fk
                  ? "text-ink"
                  : "text-ink-soft",
          !column.name && "italic",
          className,
        )}
        title={
          column.originalName && column.originalName !== column.name
            ? `Was ${column.originalName}`
            : undefined
        }
      >
        {column.name || "unnamed"}
      </span>
      {column.change === "edited" ? (
        <span className="sr-only">, changed</span>
      ) : (
        column.draft && <span className="sr-only">, new column</span>
      )}
    </>
  );
}

/** Text color for a table name with a pending change, or null when unchanged. */
export function tableChangeClass(table: DiagramTable): string | null {
  if (table.change === "dropped") return "text-rose-ink line-through";
  if (table.change === "renamed") return "text-edited-ink";
  if (table.kind === "draft") return "text-added-ink";
  return null;
}

/** Screen-reader text for a table's pending change. */
export function tableChangeLabel(table: DiagramTable): string | null {
  if (table.change === "dropped") return "deleted when you save";
  if (table.change === "renamed") return `renamed from ${table.originalName}`;
  if (table.kind === "draft") return "new table";
  return null;
}
