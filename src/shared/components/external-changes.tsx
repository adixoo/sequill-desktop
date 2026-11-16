import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { queryKeys } from "@/shared/hooks/use-db";
import { watchExternalChanges } from "@/shared/lib/sqlite/client";
import { useSavedQueries } from "@/shared/lib/store/saved-queries";

/**
 * Refreshes lists, grids, schemas and saved queries when something outside the app (an AI assistant
 * over MCP) changes the databases. Desktop app only; renders nothing.
 */
export function ExternalChanges() {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      watchExternalChanges(({ catalog, database }) => {
        if (catalog) {
          // The catalog holds the database list and the saved queries.
          void queryClient.invalidateQueries({ queryKey: queryKeys.dbs });
          void useSavedQueries.getState().reload();
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
