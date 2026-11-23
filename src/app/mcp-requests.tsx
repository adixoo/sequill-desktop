import { useEffect } from "react";
import { isDesktop } from "@/lib/platform";
import { showTableView, type ShowRequest } from "@/lib/mcp";
import { navigate, ROUTES } from "@/lib/router";
import { watchShowRequests } from "@/lib/sqlite/desktop";
import { useWorkspace } from "@/store/workspace";
import { newId } from "@/utils";

/** Opens what an assistant asked to see: a table with filters, a query, or the schema. */
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
 * Listens for the MCP server's `show_in_app` requests. Mounted once at the app's root, so it
 * keeps listening while pages change. Desktop app only; renders nothing.
 */
export function McpRequests() {
  useEffect(() => (isDesktop() ? watchShowRequests(show) : undefined), []);
  return null;
}
