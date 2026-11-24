/**
 * Pure SQL builders. Values always travel as bound parameters; identifiers are
 * checked against the known schema and quoted with `quoteIdent`.
 */
import { MAX_PARAMS_PER_STATEMENT, ROWID_ALIAS } from "@/constants";
import type { CellValue, RowKey, SqlStatement } from "@/types/lib/sqlite/types";
import type { Filter, SortSpec, TableQuery } from "@/types/lib/sqlite/sql";

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/** Renders a value as an SQL literal (for dumps and DDL previews, never for user queries). */
export function sqlLiteral(value: CellValue | boolean): string {
  if (value === null) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "NULL";
    if (!Number.isFinite(value)) return value > 0 ? "1e999" : "-1e999";
    return String(value);
  }
  if (value instanceof Uint8Array) return `X'${bytesToHex(value)}'`;
  return `'${value.replace(/'/g, "''")}'`;
}

export const FILTER_OPS = {
  eq: { label: "equals", arity: 1 },
  neq: { label: "not equal", arity: 1 },
  contains: { label: "contains", arity: 1 },
  not_contains: { label: "does not contain", arity: 1 },
  starts: { label: "starts with", arity: 1 },
  ends: { label: "ends with", arity: 1 },
  gt: { label: ">", arity: 1 },
  gte: { label: "≥", arity: 1 },
  lt: { label: "<", arity: 1 },
  lte: { label: "≤", arity: 1 },
  between: { label: "between", arity: 2 },
  in: { label: "is one of", arity: 1 },
  empty: { label: "is empty", arity: 0 },
  null: { label: "is NULL", arity: 0 },
  not_null: { label: "is not NULL", arity: 0 },
} as const;

const NUMERIC_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/**
 * Filter input arrives as text. Numeric-looking text is bound as a number so it
 * matches columns without numeric affinity too; text columns convert it back.
 */
export function coerceFilterValue(text: string): CellValue {
  const trimmed = text.trim();
  if (NUMERIC_RE.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isSafeInteger(n) || !Number.isInteger(n)) return n;
    return BigInt(trimmed);
  }
  return text;
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function assertKnown(column: string, known: Set<string>): void {
  if (!known.has(column)) throw new Error(`Unknown column: ${column}`);
}

function filterClause(filter: Filter, params: CellValue[]): string | null {
  const col = quoteIdent(filter.column);
  const value = filter.value ?? "";
  const like = (pattern: string, negate = false) => {
    params.push(pattern);
    return `${col} ${negate ? "NOT LIKE" : "LIKE"} ? ESCAPE '\\'`;
  };
  const compare = (operator: string) => {
    params.push(coerceFilterValue(value));
    return `${col} ${operator} ?`;
  };

  switch (filter.op) {
    case "null":
      return `${col} IS NULL`;
    case "not_null":
      return `${col} IS NOT NULL`;
    case "empty":
      return `${col} = ''`;
    case "eq":
      return compare("=");
    case "neq":
      return compare("IS NOT");
    case "gt":
      return compare(">");
    case "gte":
      return compare(">=");
    case "lt":
      return compare("<");
    case "lte":
      return compare("<=");
    case "contains":
      return like(`%${escapeLike(value)}%`);
    case "not_contains":
      return like(`%${escapeLike(value)}%`, true);
    case "starts":
      return like(`${escapeLike(value)}%`);
    case "ends":
      return like(`%${escapeLike(value)}`);
    case "between":
      params.push(coerceFilterValue(value), coerceFilterValue(filter.value2 ?? ""));
      return `${col} BETWEEN ? AND ?`;
    case "in": {
      const items = value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (items.length === 0) return null;
      params.push(...items.map(coerceFilterValue));
      return `${col} IN (${items.map(() => "?").join(", ")})`;
    }
  }
}

/** Builds the WHERE clause (including the keyword) or an empty string. */
export function buildWhere(
  query: Pick<TableQuery, "columns" | "filters" | "match" | "search">,
): SqlStatement {
  const known = new Set(query.columns);
  const params: CellValue[] = [];
  const parts: string[] = [];

  const filterParts: string[] = [];
  for (const filter of query.filters) {
    assertKnown(filter.column, known);
    const clause = filterClause(filter, params);
    if (clause) filterParts.push(clause);
  }
  if (filterParts.length > 0) {
    const joiner = query.match === "or" ? " OR " : " AND ";
    parts.push(filterParts.length === 1 ? filterParts[0] : `(${filterParts.join(joiner)})`);
  }

  const search = query.search.trim();
  if (search && query.columns.length > 0) {
    const pattern = `%${escapeLike(search)}%`;
    const searchParts = query.columns.map((c) => {
      params.push(pattern);
      return `CAST(${quoteIdent(c)} AS TEXT) LIKE ? ESCAPE '\\'`;
    });
    parts.push(`(${searchParts.join(" OR ")})`);
  }

  return { sql: parts.length > 0 ? ` WHERE ${parts.join(" AND ")}` : "", params };
}

function buildOrderBy(sort: SortSpec[], known: Set<string>): string {
  if (sort.length === 0) return "";
  const items = sort.map((s) => {
    assertKnown(s.column, known);
    return `${quoteIdent(s.column)}${s.desc ? " DESC" : ""}`;
  });
  return ` ORDER BY ${items.join(", ")}`;
}

export function buildSelect(query: TableQuery): SqlStatement {
  const known = new Set(query.columns);
  const where = buildWhere(query);
  const rowid = query.rowidName
    ? `${quoteIdent(query.rowidName)} AS ${quoteIdent(ROWID_ALIAS)}, `
    : "";
  const columns = query.columns.map(quoteIdent).join(", ");
  const sql =
    `SELECT ${rowid}${columns} FROM ${quoteIdent(query.table)}${where.sql}` +
    `${buildOrderBy(query.sort, known)} LIMIT ? OFFSET ?`;
  return { sql, params: [...where.params, query.limit, query.offset] };
}

export function buildCount(
  query: Pick<TableQuery, "table" | "columns" | "filters" | "match" | "search">,
): SqlStatement {
  const where = buildWhere(query);
  return {
    sql: `SELECT count(*) FROM ${quoteIdent(query.table)}${where.sql}`,
    params: where.params,
  };
}

function keyClause(key: RowKey, params: CellValue[]): string {
  if (key.kind === "rowid") {
    params.push(key.value);
    return `${quoteIdent(key.name)} = ?`;
  }
  return key.values
    .map(({ column, value }) => {
      params.push(value);
      return `${quoteIdent(column)} IS ?`;
    })
    .join(" AND ");
}

export function buildUpdate(
  table: string,
  values: { column: string; value: CellValue }[],
  key: RowKey,
): SqlStatement {
  if (values.length === 0) throw new Error("Nothing to update");
  const params: CellValue[] = [];
  const set = values
    .map(({ column, value }) => {
      params.push(value);
      return `${quoteIdent(column)} = ?`;
    })
    .join(", ");
  const where = keyClause(key, params);
  return { sql: `UPDATE ${quoteIdent(table)} SET ${set} WHERE ${where}`, params };
}

export function buildInsert(
  table: string,
  values: { column: string; value: CellValue }[],
): SqlStatement {
  if (values.length === 0) {
    return { sql: `INSERT INTO ${quoteIdent(table)} DEFAULT VALUES`, params: [] };
  }
  const columns = values.map((v) => quoteIdent(v.column)).join(", ");
  const marks = values.map(() => "?").join(", ");
  return {
    sql: `INSERT INTO ${quoteIdent(table)} (${columns}) VALUES (${marks})`,
    params: values.map((v) => v.value),
  };
}

/** Deletes rows by key. Rowid keys are batched into IN lists; primary keys get one statement each. */
export function buildDelete(table: string, keys: RowKey[]): SqlStatement[] {
  const statements: SqlStatement[] = [];
  const rowidKeys = keys.filter((k): k is Extract<RowKey, { kind: "rowid" }> => k.kind === "rowid");
  for (let i = 0; i < rowidKeys.length; i += MAX_PARAMS_PER_STATEMENT) {
    const chunk = rowidKeys.slice(i, i + MAX_PARAMS_PER_STATEMENT);
    statements.push({
      sql: `DELETE FROM ${quoteIdent(table)} WHERE ${quoteIdent(chunk[0].name)} IN (${chunk.map(() => "?").join(", ")})`,
      params: chunk.map((k) => k.value),
    });
  }
  for (const key of keys) {
    if (key.kind !== "pk") continue;
    const params: CellValue[] = [];
    const where = keyClause(key, params);
    statements.push({ sql: `DELETE FROM ${quoteIdent(table)} WHERE ${where}`, params });
  }
  return statements;
}

/** Deletes every row matching the current filters and search. */
export function buildDeleteWhere(
  query: Pick<TableQuery, "table" | "columns" | "filters" | "match" | "search">,
): SqlStatement {
  const where = buildWhere(query);
  return { sql: `DELETE FROM ${quoteIdent(query.table)}${where.sql}`, params: where.params };
}

/** Inserts many rows with one prepared statement (the worker reuses the SQL for every row). */
export function buildInsertMany(table: string, columns: string[]): string {
  const cols = columns.map(quoteIdent).join(", ");
  const marks = columns.map(() => "?").join(", ");
  return `INSERT INTO ${quoteIdent(table)} (${cols}) VALUES (${marks})`;
}
