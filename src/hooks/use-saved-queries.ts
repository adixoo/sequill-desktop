import { useMemo } from "react";
import { toast } from "sonner";
import { suggestQueryName } from "@/utils/data/saved-queries";
import { useDialogs } from "@/store/dialogs";
import { useSavedQueries } from "@/store/saved-queries";
import { useWorkspace } from "@/store/workspace";

function queryTab(tabId: string) {
  const tab = useWorkspace.getState().tabs.find((t) => t.id === tabId);
  return tab?.kind === "query" ? tab : undefined;
}

/** Saving, renaming and deleting saved queries, keeping open tabs in step. */
export function useSavedQueryActions() {
  const openDialog = useDialogs((s) => s.open);
  return useMemo(
    () => ({
      /** Updates the tab's saved query, or asks for a name if it hasn't been saved yet. */
      save(tabId: string) {
        const tab = queryTab(tabId);
        if (!tab || !tab.sql.trim()) return;
        const saved = useSavedQueries.getState().queries.find((q) => q.id === tab.savedId);
        if (!saved) {
          openDialog({ kind: "saveQuery", tabId, suggested: suggestQueryName(tab.sql) });
          return;
        }
        if (saved.sql !== tab.sql) useSavedQueries.getState().update(saved.id, tab.sql);
        toast.success(`Saved "${saved.name}"`);
      },

      /** Saves the tab's SQL as a new query and links the tab to it. */
      saveAs(tabId: string, name: string) {
        const tab = queryTab(tabId);
        if (!tab) return;
        const saved = useSavedQueries.getState().add(name, tab.sql);
        useWorkspace.getState().linkQuery(tabId, { id: saved.id, name: saved.name });
        toast.success(`Saved "${saved.name}"`);
      },

      rename(id: string, name: string) {
        useSavedQueries.getState().rename(id, name);
        useWorkspace.getState().syncSavedQuery(id, name.trim());
      },

      /** Deletes at once, with an undo in the toast rather than a confirmation first. */
      remove(id: string) {
        const removed = useSavedQueries.getState().remove(id);
        if (!removed) return;
        useWorkspace.getState().syncSavedQuery(id, null);
        toast(`Deleted "${removed.name}"`, {
          action: {
            label: "Undo",
            onClick: () => {
              useSavedQueries.getState().restore(removed);
              // Tabs that were linked stay unlinked; reopening it from the list links a new one.
            },
          },
        });
      },
    }),
    [openDialog],
  );
}
