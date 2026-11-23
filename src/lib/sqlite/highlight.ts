/** Tiny SQL tokenizer for static code previews (the console uses CodeMirror). */
export type TokenType =
  "keyword" | "string" | "number" | "comment" | "fn" | "punct" | "ident" | "space";

export interface Token {
  type: TokenType;
  text: string;
}

const KEYWORDS = new Set(
  (
    "select from where and or not null is in like between order by group having limit offset as " +
    "insert into values update set delete create table index view trigger drop alter add column " +
    "rename to primary key foreign references on join left inner outer cross union all distinct " +
    "case when then else end begin commit rollback transaction with recursive returning default " +
    "unique check integer text real blob numeric if exists explain query plan pragma vacuum asc desc " +
    "collate nocase strict without rowid autoincrement over partition window filter glob escape"
  ).split(" "),
);

const PATTERN =
  /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^']|'')*'?)|("(?:[^"]|"")*"?|`[^`]*`?|\[[^\]]*\]?)|(\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\bx'[0-9a-fA-F]*')|([A-Za-z_][\w$]*)|(\s+)|(.)/g;

export function tokenizeSql(sql: string): Token[] {
  const tokens: Token[] = [];
  for (const m of sql.matchAll(PATTERN)) {
    const [text, comment, str, quoted, num, word, space] = m;
    if (comment) tokens.push({ type: "comment", text });
    else if (str) tokens.push({ type: "string", text });
    else if (quoted) tokens.push({ type: "ident", text });
    else if (num) tokens.push({ type: "number", text });
    else if (word) {
      const next = sql.slice((m.index ?? 0) + text.length).trimStart()[0];
      const type = KEYWORDS.has(word.toLowerCase()) ? "keyword" : next === "(" ? "fn" : "ident";
      tokens.push({ type, text });
    } else if (space) tokens.push({ type: "space", text });
    else tokens.push({ type: "punct", text });
  }
  return tokens;
}
