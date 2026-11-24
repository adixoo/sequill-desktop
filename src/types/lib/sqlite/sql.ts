import type { FILTER_OPS } from "@/lib/sqlite/sql";

export type FilterOp = keyof typeof FILTER_OPS;

export interface Filter {
  id: string;
  column: string;
  op: FilterOp;
  value?: string;
  value2?: string;
}

export interface SortSpec {
  column: string;
  desc: boolean;
}

export type FilterMatch = "and" | "or";

export interface TableQuery {
  table: string;
  /** All selectable columns of the relation, used to validate identifiers. */
  columns: string[];
  /** When set, the rowid is selected first under `ROWID_ALIAS`. */
  rowidName: string | null;
  filters: Filter[];
  match: FilterMatch;
  search: string;
  sort: SortSpec[];
  limit: number;
  offset: number;
}
