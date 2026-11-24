/** React Query bindings for the SQLite worker. */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { toast } from "@/components/atoms/toast";
import { getSqlite } from "@/lib/sqlite/client";
import { errorMessage } from "@/lib/sqlite/errors";
import { buildCount, buildSelect, quoteIdent, type TableQuery } from "@/lib/sqlite/sql";
import type { Schema, SqlStatement } from "@/lib/sqlite/types";
import { STORAGE_KEYS } from "@/constants";
import { readJson } from "@/lib/storage";
import { useWorkspace } from "@/store/workspace";

export const queryKeys = {
  dbs: ["dbs"] as const,
  schema: (dbId: string) => ["schema", dbId] as const,
  data: (dbId: string) => ["data", dbId] as const,
  rows: (dbId: string, q: TableQuery) => ["data", dbId, "rows", q] as const,
  count: (dbId: string, q: Omit<TableQuery, "sort" | "limit" | "offset">) =>
    ["data", dbId, "count", q] as const,
  tableCount: (dbId: string, table: string) => ["data", dbId, "table-count", table] as const,
  /** Under the database's data, so any change to it (here or outside) checks again. */
  designCheck: (dbId: string | null, statements: string[]) =>
    dbId
      ? (["data", dbId, "design-check", statements] as const)
      : (["design-check", statements] as const),
  mcp: ["mcp"] as const,
  mcpActivity: ["mcp", "activity"] as const,
};

export function useDatabases() {
  return useQuery({ queryKey: queryKeys.dbs, queryFn: () => getSqlite().listDatabases() });
}

/** Reopens the last used database (or the most recent one) when none is selected. */
export function useRestoreLastDatabase() {
  const dbs = useDatabases();
  const dbId = useWorkspace((s) => s.dbId);
  const setDb = useWorkspace((s) => s.setDb);
  useEffect(() => {
    if (dbId || !dbs.data || dbs.data.length === 0) return;
    const last = readJson<string | null>(STORAGE_KEYS.lastDatabase, null);
    setDb((dbs.data.find((d) => d.id === last) ?? dbs.data[0]).id);
  }, [dbs.data, dbId, setDb]);
}

export function useSchema(dbId: string | null) {
  return useQuery({
    queryKey: queryKeys.schema(dbId ?? ""),
    queryFn: () => getSqlite().schema(dbId!),
    enabled: !!dbId,
  });
}

export function useTableRows(dbId: string, query: TableQuery) {
  return useQuery({
    queryKey: queryKeys.rows(dbId, query),
    queryFn: () => {
      const { sql, params } = buildSelect(query);
      return getSqlite().query(dbId, sql, params);
    },
    placeholderData: keepPreviousData,
  });
}

export function useRowCount(dbId: string, query: TableQuery) {
  const { table, columns, rowidName, filters, match, search } = query;
  const key = { table, columns, rowidName, filters, match, search };
  return useQuery({
    queryKey: queryKeys.count(dbId, key),
    queryFn: () => {
      const { sql, params } = buildCount(key);
      return getSqlite().count(dbId, sql, params);
    },
    placeholderData: keepPreviousData,
  });
}

/** Total rows of a table, shown in the sidebar. */
export function useTableCount(dbId: string, table: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.tableCount(dbId, table),
    queryFn: () => getSqlite().count(dbId, `SELECT count(*) FROM ${quoteIdent(table)}`, []),
    enabled,
    staleTime: 30_000,
  });
}

/** Invalidates what a change can affect. Schema changes also refresh the object tree. */
export function useInvalidate() {
  const client = useQueryClient();
  const dbId = useWorkspace((s) => s.dbId);
  return useCallback(
    async (opts: { schema?: boolean; renamed?: { from: string; to: string } } = {}) => {
      if (!dbId) return;
      const jobs = [
        client.invalidateQueries({ queryKey: queryKeys.data(dbId) }),
        client.invalidateQueries({ queryKey: queryKeys.dbs }),
      ];
      if (opts.schema) {
        const schemaJob = client
          .invalidateQueries({ queryKey: queryKeys.schema(dbId) })
          .then(() => {
            const schema = client.getQueryData<Schema>(queryKeys.schema(dbId));
            if (schema) {
              useWorkspace.getState().syncTables(
                [...schema.tables, ...schema.views].map((t) => t.name),
                opts.renamed,
              );
            }
          });
        jobs.push(schemaJob);
      }
      await Promise.all(jobs);
    },
    [client, dbId],
  );
}

/**
 * Runs statements in one transaction against the active database. `design`
 * runs a schema design instead: foreign-key checks are deferred to the end
 * (tables may be rebuilt) and the save fails if it would break any.
 */
export function useRunStatements() {
  const dbId = useWorkspace((s) => s.dbId);
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      statements,
      design,
      designBase,
    }: {
      statements: SqlStatement[];
      schema?: boolean;
      design?: boolean;
      /**
       * For a design: the structure version it was checked against (`previewDesign`); the
       * save is refused if the database's structure changed since.
       */
      designBase?: number | null;
      /** A table rename, so open tabs follow it. */
      renamed?: { from: string; to: string };
      success?: string;
    }) => {
      if (!dbId) throw new Error("No database is open");
      if (design) {
        await getSqlite().applyDesign(
          dbId,
          statements.map((s) => s.sql),
          designBase,
        );
        return 0;
      }
      return getSqlite().transaction(dbId, statements);
    },
    onSuccess: async (_changes, vars) => {
      await invalidate({ schema: vars.schema, renamed: vars.renamed });
      if (vars.success) toast.success(vars.success);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
