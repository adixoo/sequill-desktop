import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import { Eye, Table } from "@/shared/ui/icons";
import { memo, useEffect, useState } from "react";
import { colorInk, colorWash, type TableColor } from "@/features/vis/lib/colors";
import {
  handleId,
  TABLE_HEADER_HEIGHT,
  TABLE_ROW_HEIGHT,
  TABLE_WIDTH,
} from "@/features/vis/lib/layout";
import { TABLE_HANDLE, type DiagramTable } from "@/features/vis/lib/model";
import { cn } from "@/shared/lib/utils";
import {
  ColumnIcon,
  ColumnName,
  tableChangeClass,
  tableChangeLabel,
} from "@/shared/components/change-marks";
import { ColumnEditPopover, ColumnType, isEditableTable, type SchemaEditor } from "./column-editor";

export type TableNodeData = {
  table: DiagramTable;
  dimmed: boolean;
  color: TableColor | null;
  editor: SchemaEditor;
};
export type TableNodeType = Node<TableNodeData, "table">;

const handleClass =
  "!size-2.5 !min-w-0 !rounded-full !border-2 !border-surface !bg-strong opacity-0 transition-opacity duration-150 group-hover/node:opacity-100";
// The table-level points only anchor lines that reference a table without naming a column.
const anchorClass = "!size-px !min-w-0 !border-0 opacity-0";

/**
 * A connection point on each side of a row. The canvas runs in "loose" mode, so
 * any point can start or end a line, and each line picks the sides that face
 * each other.
 */
function SideHandles({ column, anchorOnly }: { column: string; anchorOnly?: boolean }) {
  const className = anchorOnly ? anchorClass : handleClass;
  return (
    <>
      <Handle
        type="source"
        position={Position.Left}
        id={handleId("L", column)}
        className={className}
        isConnectable={!anchorOnly}
      />
      <Handle
        type="source"
        position={Position.Right}
        id={handleId("R", column)}
        className={className}
        isConnectable={!anchorOnly}
      />
    </>
  );
}

/** One table on the diagram: header plus one row per column, each with connection handles. */
export const TableNode = memo(function TableNode({ id, data, selected }: NodeProps<TableNodeType>) {
  const { table, dimmed, color, editor } = data;
  /** Key of the column whose editor is open. */
  const [editing, setEditing] = useState<string | null>(null);
  const editable = isEditableTable(table);
  // Columns (and so handles) can be added or renamed while designing; React Flow
  // must re-measure the handles or new ones can't start a connection.
  const updateNodeInternals = useUpdateNodeInternals();
  const handleKey = table.columns.map((c) => c.name).join("\n");
  useEffect(() => updateNodeInternals(id), [id, handleKey, updateNodeInternals]);
  const dropped = table.change === "dropped";
  const Icon = table.kind === "view" ? Eye : Table;
  return (
    <div
      className={cn(
        "group/node overflow-visible rounded-md border-2 border-hairline bg-surface text-[0.8125rem] shadow-lift transition-opacity duration-150",
        selected && "border-sky-ink",
        (dimmed || dropped) && "opacity-40",
        dropped && selected && "opacity-70",
      )}
      style={{ width: TABLE_WIDTH }}
    >
      <div
        className="relative flex items-center gap-2 rounded-t-[calc(var(--radius-md)-2px)] border-b-2 border-hairline bg-raised px-3"
        style={{
          height: TABLE_HEADER_HEIGHT,
          // The table's color: a tinted header with a stripe along its top edge.
          ...(color && {
            background: colorWash(color),
            boxShadow: `inset 0 3px 0 ${colorInk(color)}`,
          }),
        }}
      >
        <SideHandles column={TABLE_HANDLE} anchorOnly />
        <Icon
          className={cn(
            "size-3.5 shrink-0",
            table.kind === "view" ? "text-lilac-ink" : "text-ink-muted",
          )}
          style={color ? { color: colorInk(color) } : undefined}
          aria-hidden
        />
        <span className={cn("truncate font-semibold", tableChangeClass(table) ?? "text-ink")}>
          {table.name || "unnamed"}
        </span>
        {tableChangeLabel(table) && <span className="sr-only">, {tableChangeLabel(table)}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {(table.kind === "view" || table.kind === "virtual") && (
            <span className="pn-table-head rounded-xs bg-lilac-wash px-1.5 py-0.5 text-lilac-ink">
              {table.kind}
            </span>
          )}
          <span
            className="pn-tnum font-mono text-[0.6875rem] text-ink-muted"
            title={`${table.columns.length} ${table.columns.length === 1 ? "column" : "columns"}`}
          >
            {table.columns.length}
          </span>
        </span>
      </div>
      <ul className="py-1">
        {table.columns.map((c) => (
          <li
            key={c.key}
            className="group/col relative flex items-center gap-2 px-3"
            style={{ height: TABLE_ROW_HEIGHT }}
          >
            <SideHandles column={c.name} />
            <span className="flex w-3.5 shrink-0 justify-center">
              <ColumnIcon column={c} />
            </span>
            <ColumnName column={c} className={cn((c.pk || c.fk) && "font-medium")} />
            {editable ? (
              <ColumnEditPopover
                table={table}
                column={c}
                editor={editor}
                open={editing === c.key}
                onOpenChange={(open) => setEditing(open ? c.key : null)}
              >
                {/* nodrag: a click here opens the editor instead of starting to move the card. */}
                <button
                  type="button"
                  aria-label={`Edit column ${c.name || "unnamed"}`}
                  // Only open the editor; don't also select the table.
                  onClick={(e) => e.stopPropagation()}
                  className="nodrag group/col ml-auto flex h-full items-center rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ColumnType column={c} editable />
                </button>
              </ColumnEditPopover>
            ) : (
              <ColumnType column={c} />
            )}
          </li>
        ))}
        {table.columns.length === 0 && (
          <li
            className="px-3 text-xs text-ink-muted italic"
            style={{ height: TABLE_ROW_HEIGHT, lineHeight: `${TABLE_ROW_HEIGHT}px` }}
          >
            No columns yet
          </li>
        )}
      </ul>
    </div>
  );
});
