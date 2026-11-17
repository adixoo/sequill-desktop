import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { queryKeys } from "@/shared/hooks/use-db";
import { getSqlite } from "@/shared/lib/sqlite/client";
import { errorMessage } from "@/shared/lib/sqlite/errors";

/** Waits for edits to pause before checking, so typing a name doesn't run SQLite per key. */
const CHECK_DELAY_MS = 300;

/**
 * Runs the design's SQL on a copy of the database's structure (no rows) as the person edits,
 * so SQLite's own errors show up before anything touches the database. `dbId` null checks a
 * blank design (a new, empty database). Returns why saving would fail, or null.
 */
export function useDesignCheck(dbId: string | null, statements: string[]): string | null {
  const [settled, setSettled] = useState(statements);
  useEffect(() => {
    const t = setTimeout(() => setSettled(statements), CHECK_DELAY_MS);
    return () => clearTimeout(t);
  }, [statements]);

  const check = useQuery({
    queryKey: queryKeys.designCheck(dbId, settled),
    queryFn: () => getSqlite().previewDesign(dbId, settled),
    enabled: settled.length > 0,
    placeholderData: keepPreviousData,
  });
  if (statements.length === 0) return null;
  if (check.error) return errorMessage(check.error);
  return check.data?.error ?? null;
}
