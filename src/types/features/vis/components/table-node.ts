import type { TableColor } from "@/types/features/vis/lib/colors";
import type { DiagramTable } from "@/types/features/vis/lib/model";
import type { SchemaEditor } from "@/types/features/vis/components/column-editor";
import type { Node } from "@xyflow/react";

export type TableNodeData = {
  table: DiagramTable;
  dimmed: boolean;
  color: TableColor | null;
  editor: SchemaEditor;
  /** Showing the schema as saved: nothing can be edited. */
  readOnly?: boolean;
};

export type TableNodeType = Node<TableNodeData, "table">;
