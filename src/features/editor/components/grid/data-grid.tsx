import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Check,
  ClipboardCopy,
  Copy,
  CopyPlus,
  CornerDownRight,
  Filter,
  PanelRightOpen,
  SquareSlash,
  Trash,
} from "@/components/atoms/icons";
import {
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { toast } from "@/components/atoms/toast";
import { Checkbox } from "@/components/atoms/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/atoms/context-menu";
import { Skeleton } from "@/components/atoms/skeleton";
import { ROW_HEIGHT, ROW_NUMBER_WIDTH } from "@/constants";
import { textToValue, valueToText } from "@/utils/data/format";
import { layoutColumns, parseTsv, reorder, toTsv } from "@/utils/data/grid";
import type { SortSpec } from "@/lib/sqlite/sql";
import type { CellValue, Row } from "@/lib/sqlite/types";
import type { ColumnLayout, Density } from "@/store/workspace";
import { cn } from "@/utils";
import { CellValueView } from "./cell-value";
import { GridHeaderCell, type ColumnAction } from "./grid-header";
import type { CellEdit, GridColumn } from "./types";

const HEADER_HEIGHT = 36;

interface Cursor {
  row: number;
  col: number;
}

export interface DataGridProps {
  columns: GridColumn[];
  rows: Row[];
  /** Number of rows before this page, for row numbers. */
  rowOffset?: number;
  layout: ColumnLayout;
  onLayoutChange(patch: Partial<ColumnLayout>): void;
  sort?: SortSpec[];
  onSortChange?(sort: SortSpec[]): void;
  selection?: ReadonlySet<number>;
  onSelectionChange?(selection: Set<number>): void;
  /** When set, cells can be edited; resolves true when the edit was saved. */
  onEdit?(edits: CellEdit[]): Promise<boolean>;
  onOpenRow?(row: number): void;
  onDuplicateRow?(row: number): void;
  onDeleteRows?(rows: number[]): void;
  onFilterByValue?(column: string, value: CellValue): void;
  onFollowForeignKey?(column: string, value: CellValue): void;
  onColumnAction?(action: ColumnAction, column: string): void;
  density: Density;
  loading?: boolean;
  empty?: ReactNode;
  label: string;
}

export function DataGrid({
  columns,
  rows,
  rowOffset = 0,
  layout,
  onLayoutChange,
  sort,
  onSortChange,
  selection,
  onSelectionChange,
  onEdit,
  onOpenRow,
  onDuplicateRow,
  onDeleteRows,
  onFilterByValue,
  onFollowForeignKey,
  onColumnAction,
  density,
  loading,
  empty,
  label,
}: DataGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [liveWidths, setLiveWidths] = useState<Record<string, number>>({});
  // Cursor and edit state are tied to the rows they were made on; a new page or query clears them.
  const [cursorState, setCursorState] = useState<{ rows: Row[]; at: Cursor } | null>(null);
  const [editState, setEditState] = useState<{ rows: Row[]; cursor: Cursor; draft: string } | null>(
    null,
  );
  const cursor = cursorState?.rows === rows ? cursorState.at : null;
  const editing = editState?.rows === rows ? editState : null;
  const setCursor = (at: Cursor | null) => setCursorState(at ? { rows, at } : null);
  const setEditing = (e: { cursor: Cursor; draft: string } | null) =>
    setEditState(e ? { rows, ...e } : null);
  const anchor = useRef<{ rows: Row[]; row: number } | null>(null);
  const rowHeight = ROW_HEIGHT[density];

  const laid = useMemo(
    () => layoutColumns(columns, { ...layout, widths: { ...layout.widths, ...liveWidths } }),
    [columns, layout, liveWidths],
  );
  const infoByName = useMemo(() => new Map(columns.map((c) => [c.name, c])), [columns]);
  const totalWidth = ROW_NUMBER_WIDTH + laid.reduce((sum, c) => sum + c.width, 0);
  const selected = selection ?? new Set<number>();

  // The React Compiler skips this component because the virtualizer's functions can't be
  // memoized. That is safe as long as the virtualizer stays here: never pass it, or values
  // read from it, to a memoized child or hook, or they would go stale.
  // eslint-disable-next-line react-hooks/incompatible-library -- known and handled, see above
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
    scrollMargin: HEADER_HEIGHT,
    scrollPaddingStart: HEADER_HEIGHT,
  });

  const canEditColumn = (col: number) =>
    !!onEdit && (infoByName.get(laid[col]?.name)?.editable ?? false);

  const moveTo = (next: Cursor) => {
    const row = Math.max(0, Math.min(rows.length - 1, next.row));
    const col = Math.max(0, Math.min(laid.length - 1, next.col));
    setCursor({ row, col });
    virtualizer.scrollToIndex(row, { align: "auto" });
    const el = scrollRef.current;
    const c = laid[col];
    if (el && c && !c.pinned) {
      const pinnedWidth = laid.filter((l) => l.pinned).reduce((s, l) => s + l.width, 0);
      const x = ROW_NUMBER_WIDTH + laid.slice(0, col).reduce((s, l) => s + l.width, 0);
      if (x < el.scrollLeft + ROW_NUMBER_WIDTH + pinnedWidth)
        el.scrollLeft = x - ROW_NUMBER_WIDTH - pinnedWidth;
      else if (x + c.width > el.scrollLeft + el.clientWidth)
        el.scrollLeft = x + c.width - el.clientWidth;
    }
  };

  const startEdit = (at: Cursor, draft?: string) => {
    if (!canEditColumn(at.col)) {
      onOpenRow?.(at.row);
      return;
    }
    const value = rows[at.row]?.[laid[at.col].index] ?? null;
    if (value instanceof Uint8Array || (typeof value === "string" && value.includes("\n"))) {
      onOpenRow?.(at.row); // multi-line text and BLOBs are edited in the inspector
      return;
    }
    setEditing({ cursor: at, draft: draft ?? valueToText(value) });
  };

  const commitEdit = async (moveBy?: Partial<Cursor>) => {
    if (!editing || !onEdit) return;
    const { cursor: at, draft } = editing;
    const column = laid[at.col];
    const original = rows[at.row]?.[column.index] ?? null;
    setEditing(null);
    if (draft !== valueToText(original) || original === null) {
      if (!(original === null && draft === "")) {
        await onEdit([
          {
            row: at.row,
            column: column.name,
            value: textToValue(draft, infoByName.get(column.name)?.type ?? ""),
          },
        ]);
      }
    }
    if (moveBy) moveTo({ row: at.row + (moveBy.row ?? 0), col: at.col + (moveBy.col ?? 0) });
    scrollRef.current?.focus();
  };

  const toggleRow = (row: number, range: boolean) => {
    if (!onSelectionChange) return;
    const next = new Set(selected);
    const from = anchor.current?.rows === rows ? anchor.current.row : null;
    if (range && from !== null) {
      const [a, b] = [Math.min(from, row), Math.max(from, row)];
      for (let i = a; i <= b; i++) next.add(i);
    } else if (next.has(row)) next.delete(row);
    else next.add(row);
    anchor.current = { rows, row };
    onSelectionChange(next);
  };

  const copySelection = async () => {
    let text: string;
    if (selected.size > 0) {
      const picked = [...selected]
        .sort((a, b) => a - b)
        .map((r) => laid.map((c) => rows[r][c.index]));
      text = toTsv(
        picked,
        laid.map((c) => c.name),
      );
    } else if (cursor) {
      text = valueToText(rows[cursor.row]?.[laid[cursor.col].index] ?? null);
    } else return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success(selected.size > 0 ? `Copied ${selected.size} rows` : "Copied value");
    } catch {
      toast.error("The browser blocked clipboard access");
    }
  };

  const onKeyDown = async (e: KeyboardEvent<HTMLDivElement>) => {
    if (editing || e.target !== e.currentTarget) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "c") {
      e.preventDefault();
      await copySelection();
      return;
    }
    if (mod && e.key.toLowerCase() === "a" && onSelectionChange) {
      e.preventDefault();
      onSelectionChange(new Set(rows.map((_, i) => i)));
      return;
    }
    if (e.key === "Escape") {
      onSelectionChange?.(new Set());
      return;
    }
    if (e.key === "Delete" && selected.size > 0 && onDeleteRows) {
      e.preventDefault();
      onDeleteRows([...selected]);
      return;
    }
    if (rows.length === 0 || laid.length === 0) return;
    const at = cursor ?? { row: 0, col: 0 };
    const page = Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? 400) / rowHeight) - 1);
    const moves: Record<string, Cursor> = {
      ArrowUp: { row: at.row - 1, col: at.col },
      ArrowDown: { row: at.row + 1, col: at.col },
      ArrowLeft: { row: at.row, col: at.col - 1 },
      ArrowRight: { row: at.row, col: at.col + 1 },
      PageUp: { row: at.row - page, col: at.col },
      PageDown: { row: at.row + page, col: at.col },
      Home: mod ? { row: 0, col: 0 } : { row: at.row, col: 0 },
      End: mod
        ? { row: rows.length - 1, col: laid.length - 1 }
        : { row: at.row, col: laid.length - 1 },
      Tab: { row: at.row, col: at.col + (e.shiftKey ? -1 : 1) },
    };
    if (e.key in moves) {
      if (
        e.key === "Tab" &&
        ((e.shiftKey && at.col === 0) || (!e.shiftKey && at.col === laid.length - 1))
      )
        return;
      e.preventDefault();
      moveTo(cursor ? moves[e.key] : at);
      return;
    }
    if (!cursor) return;
    if ((e.key === "Enter" && e.shiftKey) || (e.key === " " && mod)) {
      e.preventDefault();
      onOpenRow?.(cursor.row);
    } else if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      startEdit(cursor);
    } else if (e.key === " ") {
      e.preventDefault();
      toggleRow(cursor.row, e.shiftKey);
    } else if (e.key.length === 1 && !mod && !e.altKey && canEditColumn(cursor.col)) {
      e.preventDefault();
      startEdit(cursor, e.key);
    }
  };

  const onPaste = async (e: ClipboardEvent<HTMLDivElement>) => {
    if (editing || !cursor || !onEdit) return;
    const matrix = parseTsv(e.clipboardData.getData("text/plain"));
    if (matrix.length === 0) return;
    e.preventDefault();
    const edits: CellEdit[] = [];
    matrix.forEach((line, r) =>
      line.forEach((text, c) => {
        const row = cursor.row + r;
        const col = cursor.col + c;
        if (row >= rows.length || col >= laid.length || !canEditColumn(col)) return;
        const info = infoByName.get(laid[col].name)!;
        edits.push({ row, column: info.name, value: textToValue(text, info.type) });
      }),
    );
    if (edits.length === 0) {
      toast.error("Nothing to paste into: these cells are read-only");
      return;
    }
    if (await onEdit(edits))
      toast.success(`Pasted ${edits.length} ${edits.length === 1 ? "value" : "values"}`);
  };

  const cellFromEvent = (e: MouseEvent): Cursor | null => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (!el) return null;
    const [row, col] = el.dataset.cell!.split(":").map(Number);
    return { row, col };
  };

  const setSort = (column: string, desc: boolean | null, additive: boolean) => {
    if (!onSortChange) return;
    const rest = additive ? (sort ?? []).filter((s) => s.column !== column) : [];
    onSortChange(desc === null ? rest : [...rest, { column, desc }]);
  };

  const onResize = (column: string, width: number, commit: boolean) => {
    if (!commit) {
      setLiveWidths((w) => ({ ...w, [column]: width }));
      return;
    }
    setLiveWidths({});
    const widths = { ...layout.widths };
    if (width === 0) delete widths[column];
    else widths[column] = width;
    onLayoutChange({ widths });
  };

  const fullOrder = laid
    .map((c) => c.name)
    .concat(layout.hidden.filter((h) => !laid.some((c) => c.name === h)));
  const active = cursor
    ? { value: rows[cursor.row]?.[laid[cursor.col]?.index] ?? null, col: laid[cursor.col] }
    : null;
  const activeInfo = active?.col ? infoByName.get(active.col.name) : undefined;
  const allSelected = rows.length > 0 && selected.size === rows.length;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={scrollRef}
          role="grid"
          aria-label={label}
          aria-rowcount={rows.length + 1}
          aria-colcount={laid.length + 1}
          aria-multiselectable={!!onSelectionChange}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onContextMenu={(e) => {
            const at = cellFromEvent(e);
            if (at) setCursor(at);
          }}
          className="relative min-h-0 flex-1 overflow-auto bg-surface text-[0.8125rem] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--sky-ink)]"
        >
          <div style={{ width: totalWidth, minWidth: "100%" }}>
            <div role="row" className="sticky top-0 z-30 flex" style={{ height: HEADER_HEIGHT }}>
              <div
                role="columnheader"
                className="sticky left-0 z-40 flex shrink-0 items-center justify-center border-r border-b-2 border-hairline bg-raised"
                style={{ width: ROW_NUMBER_WIDTH }}
              >
                {onSelectionChange && (
                  <Checkbox
                    aria-label="Select all rows on this page"
                    checked={allSelected ? true : selected.size > 0 ? "indeterminate" : false}
                    onCheckedChange={() =>
                      onSelectionChange(allSelected ? new Set() : new Set(rows.map((_, i) => i)))
                    }
                  />
                )}
              </div>
              {laid.map((col) => (
                <GridHeaderCell
                  key={col.name}
                  col={col}
                  info={infoByName.get(col.name)!}
                  sort={sort}
                  onSort={onSortChange ? setSort : undefined}
                  onResize={onResize}
                  onReorder={(from, to) => onLayoutChange({ order: reorder(fullOrder, from, to) })}
                  onHide={(name) => onLayoutChange({ hidden: [...layout.hidden, name] })}
                  onTogglePin={(name) =>
                    onLayoutChange({
                      pinned: layout.pinned.includes(name)
                        ? layout.pinned.filter((p) => p !== name)
                        : [...layout.pinned, name],
                    })
                  }
                  onColumnAction={onColumnAction}
                />
              ))}
              <div className="flex-1 border-b-2 border-hairline bg-raised" />
            </div>

            {loading && rows.length === 0 ? (
              <div className="flex flex-col gap-2 p-3" aria-busy>
                {Array.from({ length: 8 }, (_, i) => (
                  <Skeleton key={i} className="h-5" style={{ width: `${90 - (i % 3) * 15}%` }} />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="sticky left-0 flex w-full max-w-[100vw] items-center justify-center p-10 text-sm text-ink-muted">
                {empty ?? "No rows"}
              </div>
            ) : (
              <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
                {virtualizer.getVirtualItems().map((item) => {
                  const r = item.index;
                  const row = rows[r];
                  const isSelected = selected.has(r);
                  return (
                    <div
                      key={item.key}
                      role="row"
                      aria-rowindex={r + 2}
                      aria-selected={onSelectionChange ? isSelected : undefined}
                      className={cn(
                        "group/row absolute left-0 flex w-full border-b border-hairline",
                        isSelected ? "bg-row-selected" : "bg-surface hover:bg-raised",
                      )}
                      style={{
                        height: rowHeight,
                        transform: `translateY(${item.start - HEADER_HEIGHT}px)`,
                      }}
                    >
                      <div
                        role="rowheader"
                        className="sticky left-0 z-10 flex shrink-0 items-center justify-end gap-2 border-r border-hairline bg-inherit pr-2.5"
                        style={{ width: ROW_NUMBER_WIDTH }}
                      >
                        {onSelectionChange ? (
                          <button
                            type="button"
                            tabIndex={-1}
                            onClick={(e) => toggleRow(r, e.shiftKey)}
                            aria-label={`Select row ${rowOffset + r + 1}`}
                            className="flex size-full items-center justify-end gap-2 font-mono text-[0.6875rem] text-ink-muted"
                          >
                            <span
                              aria-hidden
                              className={cn(
                                "flex size-4 shrink-0 items-center justify-center rounded-xs border border-strong",
                                isSelected
                                  ? "border-sky-ink bg-sky-ink text-surface"
                                  : "opacity-0 group-hover/row:opacity-100",
                              )}
                            >
                              {isSelected && <Check className="size-3" strokeWidth={3} />}
                            </span>
                            <span className="q-num">{rowOffset + r + 1}</span>
                          </button>
                        ) : (
                          <span className="q-num font-mono text-[0.6875rem] text-ink-muted">
                            {rowOffset + r + 1}
                          </span>
                        )}
                      </div>
                      {laid.map((col, c) => {
                        const isActive = cursor?.row === r && cursor.col === c;
                        const isEditing = editing?.cursor.row === r && editing.cursor.col === c;
                        return (
                          <div
                            key={col.name}
                            role="gridcell"
                            aria-colindex={c + 2}
                            aria-selected={isActive}
                            data-cell={`${r}:${c}`}
                            onMouseDown={() => setCursor({ row: r, col: c })}
                            onDoubleClick={() => startEdit({ row: r, col: c })}
                            className={cn(
                              "relative flex min-w-0 shrink-0 items-center border-r border-hairline px-3",
                              col.pinned && "sticky z-5 bg-inherit",
                              isActive && "z-6 shadow-[inset_0_0_0_2px_var(--sky-ink)]",
                            )}
                            style={{
                              width: col.width,
                              left: col.pinned ? ROW_NUMBER_WIDTH + col.left : undefined,
                            }}
                          >
                            {isEditing ? (
                              <input
                                autoFocus
                                aria-label={`Edit ${col.name}`}
                                value={editing.draft}
                                onChange={(e) =>
                                  setEditing({ cursor: editing.cursor, draft: e.target.value })
                                }
                                onBlur={() => void commitEdit()}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    void commitEdit({ row: 1 });
                                  } else if (e.key === "Tab") {
                                    e.preventDefault();
                                    void commitEdit({ col: e.shiftKey ? -1 : 1 });
                                  } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    setEditing(null);
                                    scrollRef.current?.focus();
                                  }
                                }}
                                className="absolute inset-0 z-10 bg-surface px-3 font-sans text-[0.8125rem] text-ink [box-shadow:inset_0_0_0_2px_var(--sky-ink)] outline-none max-md:text-base md:text-[0.8125rem]"
                              />
                            ) : (
                              <div className="flex min-w-0 flex-1 items-center">
                                <CellValueView value={row[col.index]} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem disabled={!active} onSelect={() => void copySelection()}>
          <ClipboardCopy /> {selected.size > 0 ? `Copy ${selected.size} rows` : "Copy value"}
          <ContextMenuShortcut>Ctrl C</ContextMenuShortcut>
        </ContextMenuItem>
        {cursor && (
          <ContextMenuItem
            onSelect={async () => {
              const obj = Object.fromEntries(
                columns.map((c, i) => [c.name, valueToText(rows[cursor.row]?.[i] ?? null)]),
              );
              try {
                await navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
                toast.success("Copied row as JSON");
              } catch {
                toast.error("The browser blocked clipboard access");
              }
            }}
          >
            <Copy /> Copy row as JSON
          </ContextMenuItem>
        )}
        {cursor && onOpenRow && (
          <ContextMenuItem onSelect={() => onOpenRow(cursor.row)}>
            <PanelRightOpen /> Open row
            <ContextMenuShortcut>⇧ Enter</ContextMenuShortcut>
          </ContextMenuItem>
        )}
        {cursor && onDuplicateRow && (
          <ContextMenuItem onSelect={() => onDuplicateRow(cursor.row)}>
            <CopyPlus /> Duplicate row
          </ContextMenuItem>
        )}
        {active?.col && onFilterByValue && (
          <ContextMenuItem onSelect={() => onFilterByValue(active.col.name, active.value)}>
            <Filter /> Filter by this value
          </ContextMenuItem>
        )}
        {active?.col && activeInfo?.fk && active.value !== null && onFollowForeignKey && (
          <ContextMenuItem onSelect={() => onFollowForeignKey(active.col.name, active.value)}>
            <CornerDownRight /> Go to {activeInfo.fk.table}
          </ContextMenuItem>
        )}
        {cursor && active?.value !== null && canEditColumn(cursor.col) && (
          <ContextMenuItem
            onSelect={() =>
              void onEdit?.([{ row: cursor.row, column: laid[cursor.col].name, value: null }])
            }
          >
            <SquareSlash /> Set to NULL
          </ContextMenuItem>
        )}
        {onDeleteRows && cursor && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              onSelect={() => onDeleteRows(selected.size > 0 ? [...selected] : [cursor.row])}
            >
              <Trash /> {selected.size > 1 ? `Delete ${selected.size} rows` : "Delete row"}
              <ContextMenuShortcut>Del</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
