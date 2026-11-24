import type { CellValue, ForeignKey } from "@/types/lib/sqlite/types";

export interface GridColumn {
  name: string;
  /** Declared type ("" when none). */
  type: string;
  pk?: boolean;
  fk?: ForeignKey | null;
  /** False for generated columns and read-only results. */
  editable: boolean;
}

export interface CellEdit {
  row: number;
  column: string;
  value: CellValue;
}
