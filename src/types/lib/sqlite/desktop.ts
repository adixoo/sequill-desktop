/** What another process (an AI assistant over MCP) changed. */
export interface ExternalChanges {
  /** The list of databases (names, sizes, times) changed. */
  catalog: boolean;
  /** Id of the open database when its data or schema changed. */
  database: string | null;
}

/** A schema design as the catalog keeps it; `version` goes up by one on every save. */
export interface StoredDesign {
  key: string;
  draft: unknown;
  version: number;
}
