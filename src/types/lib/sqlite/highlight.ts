/** Tiny SQL tokenizer for static code previews (the console uses CodeMirror). */
export type TokenType =
  "keyword" | "string" | "number" | "comment" | "fn" | "punct" | "ident" | "space";

export interface Token {
  type: TokenType;
  text: string;
}
