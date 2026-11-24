/** Languages a code preview can show. */
export type CodeLanguage = "sql" | "json" | "toml" | "bash";

/** What a piece of code is, for its colour. */
export type CodeTokenType =
  "keyword" | "string" | "number" | "comment" | "fn" | "property" | "punct" | "plain";

export interface CodeToken {
  type: CodeTokenType;
  text: string;
}
