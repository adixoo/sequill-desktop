import { useId, useState } from "react";
import { Button } from "@/components/atoms/button";
import { GripVertical, Plus, Trash } from "@/components/atoms/icons";
import { Input } from "@/components/atoms/input";
import { cn, newId } from "@/utils";
import { moveItem } from "@/utils/data/grid";
import { duplicateValues } from "@/features/vis/lib/model";
import type { EnumValueRow } from "@/types/features/vis/components/enum-values-editor";

export const toRows = (values: string[]): EnumValueRow[] =>
  values.map((value) => ({ id: newId(), value }));

/**
 * An enum's values as a list: drag a row by its handle (or focus the handle and press the
 * arrow keys) to reorder, remove a row, or add one at the end.
 */
export function EnumValuesEditor({
  rows,
  onChange,
}: {
  rows: EnumValueRow[];
  onChange(rows: EnumValueRow[]): void;
}) {
  const base = useId();
  // Rows drag only from their handle, so selecting text in a value doesn't start a drag.
  const [armed, setArmed] = useState<string | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const dupes = duplicateValues(rows.map((r) => r.value.trim()));

  // React moves the row's node, which can drop focus; put it back once the list re-renders.
  const focusLater = (id: string) =>
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length || from === to) return;
    onChange(moveItem(rows, from, to));
  };

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm leading-none font-medium">Values</legend>
      <ol className="flex flex-col gap-2">
        {rows.map((row, i) => {
          const label = row.value.trim() || `value ${i + 1}`;
          const duplicate = dupes.has(row.value.trim());
          return (
            <li
              key={row.id}
              draggable={armed === row.id}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                setDragging(i);
              }}
              onDragOver={(e) => {
                if (dragging === null) return;
                e.preventDefault();
                setOver(i);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging !== null) move(dragging, i);
                setOver(null);
              }}
              onDragEnd={() => {
                setArmed(null);
                setDragging(null);
                setOver(null);
              }}
              className={cn(
                "flex items-center gap-2 rounded-lg",
                dragging === i && "opacity-50",
                over === i && dragging !== i && "shadow-[0_-2px_0_var(--sky-ink)]",
              )}
            >
              <Button
                id={`${base}-handle-${row.id}`}
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Move ${label}`}
                title="Drag, or press the arrow keys, to reorder"
                className="cursor-grab text-ink-muted"
                onPointerDown={() => setArmed(row.id)}
                onPointerUp={() => setArmed(null)}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                  e.preventDefault();
                  move(i, e.key === "ArrowUp" ? i - 1 : i + 1);
                  focusLater(`${base}-handle-${row.id}`);
                }}
              >
                <GripVertical />
              </Button>
              <Input
                id={`${base}-value-${row.id}`}
                aria-label={`Value ${i + 1}`}
                aria-invalid={duplicate || undefined}
                value={row.value}
                onChange={(e) =>
                  onChange(rows.map((r) => (r.id === row.id ? { ...r, value: e.target.value } : r)))
                }
                spellCheck={false}
              />
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={`Remove ${label}`}
                onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
              >
                <Trash />
              </Button>
            </li>
          );
        })}
      </ol>
      {dupes.size > 0 && (
        <p role="alert" className="text-sm text-rose-ink">
          Each value can appear only once: {[...dupes].join(", ")}.
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={() => {
          const row = toRows([""])[0];
          onChange([...rows, row]);
          focusLater(`${base}-value-${row.id}`);
        }}
      >
        <Plus /> Add value
      </Button>
    </fieldset>
  );
}
