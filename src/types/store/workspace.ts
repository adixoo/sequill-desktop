import type { Filter, FilterMatch, SortSpec } from "@/types/lib/sqlite/sql";

/** Column layout remembered per table across sessions. */
export interface ColumnLayout {
  hidden: string[];
  order: string[];
  widths: Record<string, number>;
  pinned: string[];
}

export interface TableViewState extends ColumnLayout {
  filters: Filter[];
  match: FilterMatch;
  search: string;
  sort: SortSpec[];
  page: number;
  pageSize: number;
  mode: "data" | "structure";
}

export type Tab =
  | { id: string; kind: "table"; table: string; view: TableViewState }
  | {
      id: string;
      kind: "query";
      title: string;
      sql: string;
      /** The saved query this tab edits; Save updates it in place. */
      savedId?: string;
      /** The one tab assistants show queries in (MCP), reused rather than opening new ones. */
      assistant?: boolean;
    };

/** The saved query a tab is linked to, by id, with the name shown as its title. */
export interface SavedQueryRef {
  id: string;
  name: string;
}

export type Density = "compact" | "comfortable";
