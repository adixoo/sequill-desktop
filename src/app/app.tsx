import { useEffect, type ComponentType } from "react";
import { EditorPage } from "@/pages/editor-page";
import { VisPage } from "@/pages/vis-page";
import { ComponentsPage } from "@/pages/components-page";
import { McpRequests } from "./mcp-requests";
import { APP_NAME } from "@/constants";
import { ROUTES, usePathname } from "@/lib/router";

const PAGES: Record<string, { title: string; Page: ComponentType }> = {
  [ROUTES.editor]: { title: "Editor", Page: EditorPage },
  [ROUTES.vis]: { title: "Schema", Page: VisPage },
  [ROUTES.components]: { title: "Components", Page: ComponentsPage },
};

/** Shows the page for the current path; unknown paths show the editor. */
export function App() {
  const pathname = usePathname();
  const { title, Page } = PAGES[pathname] ?? PAGES[ROUTES.editor];
  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`;
  }, [title]);
  return (
    <>
      <Page />
      <McpRequests />
    </>
  );
}
