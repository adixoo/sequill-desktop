import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { queryKeys } from "@/hooks/use-db";
import { watchExternalChanges } from "@/lib/sqlite/client";
import { useSavedQueries } from "@/store/saved-queries";
import { reloadDrafts } from "@/features/vis/lib/drafts";

/**
 * Refreshes lists, grids, schemas, saved queries and schema designs when something outside the app (an AI assistant
 * over MCP) changes the databases. Desktop app only; renders nothing.
 */
export function ExternalChanges() {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      watchExternalChanges(({ catalog, database }) => {
        if (catalog) {
          // The catalog holds the database list, saved queries, schema designs and MCP history.
          void queryClient.invalidateQueries({ queryKey: queryKeys.dbs });
          void queryClient.invalidateQueries({ queryKey: queryKeys.mcpActivity });
          void useSavedQueries.getState().reload();
          void reloadDrafts();
        }
        if (database) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.schema(database) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.data(database) });
        }
      }),
    [queryClient],
  );
  return null;
}
