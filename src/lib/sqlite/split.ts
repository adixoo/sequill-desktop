/**
 * Splits a script into statements. `isComplete` is SQLite's own `sqlite3_complete`,
 * so strings, comments and CREATE TRIGGER bodies are handled exactly as SQLite does.
 */
export function splitStatements(script: string, isComplete: (sql: string) => boolean): string[] {
  const statements: string[] = [];
  let start = 0;
  for (let i = script.indexOf(";"); i !== -1; i = script.indexOf(";", i + 1)) {
    const piece = script.slice(start, i + 1);
    if (isComplete(piece)) {
      pushIfMeaningful(statements, piece);
      start = i + 1;
    }
  }
  pushIfMeaningful(statements, script.slice(start));
  return statements;
}

function pushIfMeaningful(out: string[], piece: string): void {
  const trimmed = piece.trim();
  if (stripComments(trimmed).replace(/;/g, "").trim().length > 0) out.push(trimmed);
}

/** Only used to detect comment-only pieces; good enough because real statements keep other text. */
function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}
