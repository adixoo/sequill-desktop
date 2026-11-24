/** Syntax highlighting for static code previews: Prism for config files and shell, our own for SQL. */
import Prism from "prismjs";
import "prismjs/components/prism-json";
import "prismjs/components/prism-toml";
import "prismjs/components/prism-bash";
import { tokenizeSql } from "@/lib/sqlite/highlight";
import type { CodeLanguage, CodeTokenType, CodeToken } from "@/types/utils/highlight-code";

/** Prism token names (and aliases) to our token types; anything else is plain. */
const PRISM_TYPES: Record<string, CodeTokenType> = {
  keyword: "keyword",
  builtin: "keyword",
  boolean: "number",
  null: "number",
  number: "number",
  constant: "number",
  date: "number",
  string: "string",
  char: "string",
  comment: "comment",
  function: "fn",
  "function-name": "fn",
  property: "property",
  key: "property",
  table: "property",
  "class-name": "property",
  variable: "property",
  punctuation: "punct",
  operator: "punct",
};

function prismType(token: Prism.Token): CodeTokenType | undefined {
  const aliases = Array.isArray(token.alias) ? token.alias : token.alias ? [token.alias] : [];
  for (const name of [token.type, ...aliases]) {
    const type = PRISM_TYPES[name];
    if (type) return type;
  }
  return undefined;
}

/** Flattens Prism's nested tokens; an inner token's own type wins over its parent's. */
function flatten(stream: Prism.TokenStream, inherited: CodeTokenType, out: CodeToken[]): void {
  if (typeof stream === "string") {
    out.push({ type: inherited, text: stream });
    return;
  }
  if (Array.isArray(stream)) {
    for (const part of stream) flatten(part, inherited, out);
    return;
  }
  flatten(stream.content, prismType(stream) ?? inherited, out);
}

const SQL_TYPES: Record<string, CodeTokenType> = { ident: "plain", space: "plain" };

function tokenize(code: string, language: CodeLanguage): CodeToken[] {
  if (language === "sql") {
    return tokenizeSql(code).map((t) => ({
      type: SQL_TYPES[t.type] ?? (t.type as CodeTokenType),
      text: t.text,
    }));
  }
  const out: CodeToken[] = [];
  flatten(Prism.tokenize(code, Prism.languages[language]), "plain", out);
  return out;
}

/** Highlighted code split into lines, so tokens that span lines (comments, strings) still colour each line. */
export function highlightLines(code: string, language: CodeLanguage): CodeToken[][] {
  const lines: CodeToken[][] = [[]];
  for (const token of tokenize(code.replace(/\n$/, ""), language)) {
    token.text.split("\n").forEach((text, i) => {
      if (i > 0) lines.push([]);
      if (text) lines[lines.length - 1].push({ type: token.type, text });
    });
  }
  return lines;
}
