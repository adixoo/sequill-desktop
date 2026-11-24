import { useEffect } from "react";
import { isDesktop } from "@/lib/platform";
import { showTableView, type ShowRequest } from "@/lib/mcp";
import { navigate, ROUTES, usePathname } from "@/lib/router";
import { setUiState, watchShowRequests } from "@/lib/sqlite/desktop";
import { useWorkspace } from "@/store/workspace";
import { newId } from "@/utils";

/** Opens what an assistant asked to see: a page, a table with filters, or a query. */
function show(request: ShowRequest): void {
  const workspace = useWorkspace.getState();
  workspace.setDb(request.databaseId);
  if (request.view === "schema") {
    navigate(ROUTES.vis);
    return;
  }
  navigate(ROUTES.editor);
  if (request.view === "table" && request.table) {
    workspace.openTable(request.table, showTableView(request, newId));
  } else if (request.view === "query") {
    workspace.showAssistantQuery(request.sql ?? "");
  }
}

/**
 * Listens for the MCP server's `show_in_app` requests, and tells it which page and database
 * the window shows (for `app_info`). Mounted once at the app's root, so it keeps working
 * while pages change. Desktop app only; renders nothing.
 */
export function McpRequests() {
  const page = usePathname() === ROUTES.vis ? "schema" : "editor";
  const dbId = useWorkspace((s) => s.dbId);
  useEffect(() => (isDesktop() ? watchShowRequests(show) : undefined), []);
  useEffect(() => {
    if (!isDesktop()) return;
    setUiState(page, dbId).catch((error: unknown) =>
      console.error("Could not save the window's page for assistants", error),
    );
  }, [page, dbId]);
  return null;
}
