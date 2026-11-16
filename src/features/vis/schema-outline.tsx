import {
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  ExternalLink,
  Eye,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Table2,
  Trash2,
  Undo2,
} from "lucide-react";
import { Link } from "@/shared/components/link";
import { editorHref } from "@/shared/lib/router";
import { useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Input } from "@/shared/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/shared/ui/input-group";
import type { TableColor } from "@/features/vis/lib/colors";
import {
  addColumn,
  dropTable,
  renameTable,
  type DiagramColumn,
  type DiagramTable,
} from "@/features/vis/lib/model";
import { cn } from "@/shared/lib/utils";
import {
  ColumnIcon,
  ColumnName,
  tableChangeClass,
  tableChangeLabel,
} from "@/shared/components/change-marks";
import { ColorDot } from "./color-picker";
import { ColumnEditPopover, ColumnType, isEditableTable, type SchemaEditor } from "./column-editor";

interface SchemaOutlineProps {
  tables: DiagramTable[];
  colors: Record<string, TableColor>;
  onColorChange(id: string, color: TableColor | null): void;
  selectedId: string | null;
  onSelect(id: string): void;
  editor: SchemaEditor;
  /** Hides the sidebar; when omitted (inside a sheet, which has its own close) no button shows. */
  onClose?(): void;
}

const KIND_ORDER: Record<DiagramTable["kind"], number> = {
  table: 0,
  virtual: 0,
  draft: 1,
  view: 2,
};

// Row actions stay visible on touch screens and appear on hover with a mouse.
const rowAction =
  "[@media(hover:hover)]:opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100";

/** Left panel: every table and view with its columns and types, and where they are edited. */
export function SchemaOutline({
  tables,
  colors,
  onColorChange,
  selectedId,
  onSelect,
  editor,
  onClose,
}: SchemaOutlineProps) {
  // Tables start collapsed; track the ones the user opens.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  /** The column whose editor is open: "<table id>|<column key>". */
  const [editing, setEditing] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const visible = [...tables]
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name))
    .map((t) => ({
      table: t,
      // While searching, a table matches by name or shows only its matching columns.
      columns:
        !q || t.name.toLowerCase().includes(q)
          ? t.columns
          : t.columns.filter((c) => c.name.toLowerCase().includes(q)),
    }))
    .filter(
      ({ table, columns }) => !q || table.name.toLowerCase().includes(q) || columns.length > 0,
    );
  const allCollapsed = tables.every((t) => !expanded.has(t.id));

  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const addColumnTo = (table: DiagramTable) => {
    const { draft, key } = addColumn(editor.draft, table);
    editor.onChange(draft);
    setQuery("");
    setExpanded((s) => new Set(s).add(table.id));
    setEditing(`${table.id}|${key}`);
  };

  return (
    <nav aria-label="Tables and columns" className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b-2 border-hairline p-2">
        <InputGroup className="h-8 flex-1">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            placeholder="Find a table or column"
            aria-label="Find a table or column"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-md:text-base"
          />
        </InputGroup>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={allCollapsed ? "Expand all tables" : "Collapse all tables"}
          title={allCollapsed ? "Expand all" : "Collapse all"}
          onClick={() => setExpanded(allCollapsed ? new Set(tables.map((t) => t.id)) : new Set())}
        >
          {allCollapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}
        </Button>
        {onClose && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Hide tables sidebar"
            title="Hide sidebar"
            onClick={onClose}
          >
            <PanelLeftClose />
          </Button>
        )}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {visible.map(({ table, columns }) => {
          const open = !!q || expanded.has(table.id);
          const selected = table.id === selectedId;
          const Icon = table.kind === "view" ? Eye : Table2;
          return (
            <li key={table.id}>
              <div
                className={cn(
                  "group/row flex h-8 items-center rounded-xs",
                  selected ? "bg-sky-wash" : "hover:bg-zebra",
                )}
              >
                <button
                  type="button"
                  onClick={() => toggle(table.id)}
                  aria-expanded={open}
                  aria-label={`${open ? "Collapse" : "Expand"} ${table.name}`}
                  className="flex size-7 shrink-0 items-center justify-center rounded-xs text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform duration-150",
                      !open && "-rotate-90",
                    )}
                  />
                </button>
                {renaming === table.id ? (
                  <RenameInput
                    initial={table.name}
                    label={`New name for ${table.name}`}
                    onDone={(name) => {
                      setRenaming(null);
                      if (name !== null && name !== table.name) {
                        editor.onChange(renameTable(editor.draft, table, name));
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelect(table.id)}
                    onDoubleClick={() => isEditableTable(table) && setRenaming(table.id)}
                    aria-current={selected ? "true" : undefined}
                    className="flex h-full min-w-0 flex-1 items-center gap-2 pr-1 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon
                      className={cn(
                        "size-3.5 shrink-0",
                        table.kind === "view" && "text-lilac-ink",
                        table.kind === "draft" && "text-added-ink",
                        table.kind !== "view" &&
                          table.kind !== "draft" &&
                          (selected ? "text-sky-ink" : "text-ink-muted"),
                      )}
                      aria-hidden
                    />
                    <span
                      className={cn(
                        "truncate",
                        selected ? "font-semibold" : "font-medium",
                        tableChangeClass(table) ?? (selected ? "text-ink" : "text-ink-soft"),
                      )}
                    >
                      {table.name || "unnamed"}
                    </span>
                    {tableChangeLabel(table) && (
                      <span className="sr-only">, {tableChangeLabel(table)}</span>
                    )}
                    {(table.kind === "view" || table.kind === "virtual") && (
                      <span className="pn-table-head shrink-0 text-lilac-ink">{table.kind}</span>
                    )}
                  </button>
                )}
                <ColorDot
                  value={colors[table.id] ?? null}
                  onChange={(color) => onColorChange(table.id, color)}
                  tableName={table.name}
                />
                <TableMenu
                  table={table}
                  editor={editor}
                  onAddColumn={() => addColumnTo(table)}
                  onRename={() => setRenaming(table.id)}
                />
              </div>
              {open && (columns.length > 0 || isEditableTable(table)) && (
                <ul
                  className="mb-1 ml-[1.375rem] border-l-2 border-hairline"
                  aria-label={`${table.name} columns`}
                >
                  {columns.map((c) => {
                    const id = `${table.id}|${c.key}`;
                    return (
                      <li key={c.key}>
                        {isEditableTable(table) ? (
                          <ColumnEditPopover
                            table={table}
                            column={c}
                            editor={editor}
                            open={editing === id}
                            onOpenChange={(o) => setEditing(o ? id : null)}
                          >
                            <button
                              type="button"
                              aria-label={`Edit column ${c.name || "unnamed"} of ${table.name}`}
                              className="group/col flex h-7 w-full items-center gap-2 rounded-r-xs pr-2 pl-2.5 text-left text-[0.8125rem] outline-none hover:bg-zebra focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-zebra"
                            >
                              <ColumnRow column={c} editable />
                            </button>
                          </ColumnEditPopover>
                        ) : (
                          <div className="flex h-7 items-center gap-2 pr-2 pl-2.5 text-[0.8125rem]">
                            <ColumnRow column={c} />
                          </div>
                        )}
                      </li>
                    );
                  })}
                  {isEditableTable(table) && !q && (
                    <li>
                      <button
                        type="button"
                        onClick={() => addColumnTo(table)}
                        className="flex h-7 w-full items-center gap-2 rounded-r-xs pr-2 pl-2.5 text-left text-[0.8125rem] text-ink-muted outline-none hover:bg-zebra hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Plus className="size-3" aria-hidden /> Add column
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-ink-muted">
            {tables.length === 0 ? "No tables yet." : "Nothing matches."}
          </li>
        )}
      </ul>
    </nav>
  );
}

/** One column in the outline. */
function ColumnRow({ column, editable }: { column: DiagramColumn; editable?: boolean }) {
  return (
    <>
      <span className="flex w-3 shrink-0 justify-center">
        <ColumnIcon column={column} />
      </span>
      <ColumnName column={column} />
      <ColumnType column={column} editable={editable} />
    </>
  );
}

/** Name field shown in place of a table name; Enter or leaving it saves, Escape cancels. */
function RenameInput({
  initial,
  label,
  onDone,
}: {
  initial: string;
  label: string;
  onDone(name: string | null): void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Input
      autoFocus
      aria-label={label}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => onDone(value.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") onDone(value.trim());
        if (e.key === "Escape") onDone(null);
      }}
      className="mr-1 h-7 min-w-0 flex-1 bg-surface px-2 font-mono text-sm max-md:text-base"
    />
  );
}

function TableMenu({
  table,
  editor,
  onAddColumn,
  onRename,
}: {
  table: DiagramTable;
  editor: SchemaEditor;
  onAddColumn(): void;
  onRename(): void;
}) {
  const editable = isEditableTable(table);
  const existing = !table.draftId && table.kind !== "virtual";
  const canOpen = !!editor.dbId && !table.draftId && table.change !== "dropped";
  const canDrop = table.kind === "table" || table.kind === "draft";
  // Rename and Add column focus a field. They run once the menu has closed: while open it
  // traps focus, and on close it would pull focus back to its button.
  const afterClose = useRef<(() => void) | null>(null);
  if (!editable && !canOpen && !canDrop) return <span className="w-7 shrink-0" />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${table.name}`}
          className={cn("size-7 shrink-0", rowAction)}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-44"
        onCloseAutoFocus={(e) => {
          const action = afterClose.current;
          if (!action) return;
          afterClose.current = null;
          e.preventDefault();
          action();
        }}
      >
        {editable && (
          <>
            <DropdownMenuItem
              onSelect={() => {
                afterClose.current = onAddColumn;
              }}
            >
              <Plus /> Add column
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                afterClose.current = onRename;
              }}
            >
              <Pencil /> Rename table
            </DropdownMenuItem>
          </>
        )}
        {table.change === "renamed" && table.originalName && (
          <DropdownMenuItem
            onSelect={() =>
              editor.onChange(renameTable(editor.draft, table, table.originalName ?? table.name))
            }
          >
            <Undo2 /> Undo rename
          </DropdownMenuItem>
        )}
        {canOpen && existing && (
          <DropdownMenuItem asChild>
            <Link href={editorHref(table.originalName ?? table.name)}>
              <ExternalLink /> Open in editor
            </Link>
          </DropdownMenuItem>
        )}
        {canDrop && (
          <>
            <DropdownMenuSeparator />
            {table.change === "dropped" ? (
              <DropdownMenuItem
                onSelect={() => editor.onChange(dropTable(editor.draft, table, false))}
              >
                <RotateCcw /> Restore table
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => editor.onChange(dropTable(editor.draft, table))}
              >
                <Trash2 /> Delete table
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
