import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  EyeOff,
  Filter,
  KeyRound,
  Link2,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { ROW_NUMBER_WIDTH } from "@/shared/lib/constants";
import { clampWidth, type LaidOutColumn } from "@/shared/lib/data/grid";
import type { SortSpec } from "@/shared/lib/sqlite/sql";
import { cn } from "@/shared/lib/utils";
import type { GridColumn } from "./types";

export type ColumnAction = "filter" | "rename" | "drop";

interface GridHeaderCellProps {
  col: LaidOutColumn;
  info: GridColumn;
  sort?: SortSpec[];
  onSort?(column: string, desc: boolean | null, additive: boolean): void;
  onResize(column: string, width: number, commit: boolean): void;
  onReorder(from: string, to: string): void;
  onHide(column: string): void;
  onTogglePin(column: string): void;
  onColumnAction?(action: ColumnAction, column: string): void;
}

const DRAG_TYPE = "application/x-sbe-column";

export function GridHeaderCell({
  col,
  info,
  sort,
  onSort,
  onResize,
  onReorder,
  onHide,
  onTogglePin,
  onColumnAction,
}: GridHeaderCellProps) {
  const [dropTarget, setDropTarget] = useState(false);
  const resizing = useRef<{ startX: number; startWidth: number } | null>(null);
  const sortIndex = sort?.findIndex((s) => s.column === col.name) ?? -1;
  const sortSpec = sortIndex >= 0 ? sort![sortIndex] : null;

  const cycleSort = (additive: boolean) => {
    if (!onSort) return;
    // asc → desc → none
    onSort(col.name, sortSpec === null ? false : sortSpec.desc ? null : true, additive);
  };

  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizing.current = { startX: e.clientX, startWidth: col.width };
  };
  const moveResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizing.current) return;
    onResize(
      col.name,
      clampWidth(resizing.current.startWidth + e.clientX - resizing.current.startX),
      false,
    );
  };
  const endResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizing.current) return;
    onResize(
      col.name,
      clampWidth(resizing.current.startWidth + e.clientX - resizing.current.startX),
      true,
    );
    resizing.current = null;
  };

  return (
    <div
      role="columnheader"
      aria-sort={sortSpec ? (sortSpec.desc ? "descending" : "ascending") : undefined}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, col.name);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        setDropTarget(true);
      }}
      onDragLeave={() => setDropTarget(false)}
      onDrop={(e) => {
        setDropTarget(false);
        const from = e.dataTransfer.getData(DRAG_TYPE);
        if (from && from !== col.name) onReorder(from, col.name);
      }}
      className={cn(
        "group/head relative flex h-full shrink-0 items-center border-r border-b-2 border-hairline bg-raised",
        col.pinned && "sticky z-20",
        dropTarget && "shadow-[inset_3px_0_0_var(--sky-ink)]",
      )}
      style={{ width: col.width, left: col.pinned ? ROW_NUMBER_WIDTH + col.left : undefined }}
    >
      <button
        type="button"
        onClick={(e) => cycleSort(e.shiftKey)}
        disabled={!onSort}
        title={onSort ? "Sort (Shift+click to add)" : undefined}
        className="flex h-full min-w-0 flex-1 items-center gap-1.5 pl-3 text-left outline-none focus-visible:bg-zebra disabled:cursor-default"
      >
        {info.pk && (
          <KeyRound className="size-3 shrink-0 text-butter-ink" aria-label="Primary key" />
        )}
        {info.fk && (
          <Link2
            className="size-3 shrink-0 text-sky-ink"
            aria-label={`References ${info.fk.table}`}
          />
        )}
        <span className="min-w-[3ch] truncate text-[0.8125rem] font-semibold text-ink">
          {col.name}
        </span>
        {info.type && (
          // Shrinks away before the column name does.
          <span className="min-w-0 shrink-[100] truncate font-mono text-[0.625rem] tracking-[0.04em] text-ink-muted uppercase">
            {info.type.toLowerCase()}
          </span>
        )}
        {sortSpec && (
          <span className="ml-auto flex shrink-0 items-center text-sky-ink">
            {sortSpec.desc ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />}
            {sort!.length > 1 && <span className="font-mono text-[0.625rem]">{sortIndex + 1}</span>}
            <span className="sr-only">
              {sortSpec.desc ? "sorted descending" : "sorted ascending"}
            </span>
          </span>
        )}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="mr-1 flex size-6 shrink-0 items-center justify-center rounded-xs text-ink-muted opacity-0 outline-none group-hover/head:opacity-100 hover:bg-zebra focus-visible:opacity-100 data-[state=open]:opacity-100"
          aria-label={`Column options for ${col.name}`}
        >
          <ChevronDown className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {onSort && (
            <>
              <DropdownMenuItem onSelect={() => onSort(col.name, false, false)}>
                <ArrowUp /> Sort ascending
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onSort(col.name, true, false)}>
                <ArrowDown /> Sort descending
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {onColumnAction && (
            <DropdownMenuItem onSelect={() => onColumnAction("filter", col.name)}>
              <Filter /> Filter by column
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => onTogglePin(col.name)}>
            {col.pinned ? <PinOff /> : <Pin />} {col.pinned ? "Unpin" : "Pin to left"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onHide(col.name)}>
            <EyeOff /> Hide column
          </DropdownMenuItem>
          {onColumnAction && info.editable && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onColumnAction("rename", col.name)}>
                <Pencil /> Rename column
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => onColumnAction("drop", col.name)}
              >
                <Trash2 /> Drop column
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${col.name}`}
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onDoubleClick={() => onResize(col.name, 0, true)}
        className="absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize touch-none hover:bg-sky-ink/40"
      />
    </div>
  );
}
