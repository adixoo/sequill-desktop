import { useEffect, type ComponentType } from "react";
import { EditorBoot } from "@/features/editor/editor-boot";
import { VisBoot } from "@/features/vis/vis-boot";
import { McpRequests } from "@/shared/components/mcp-requests";
import { APP_NAME } from "@/shared/lib/constants";
import { ROUTES, usePathname } from "@/shared/lib/router";

const PAGES: Record<string, { title: string; Page: ComponentType }> = {
  [ROUTES.editor]: { title: "Editor", Page: EditorBoot },
  [ROUTES.vis]: { title: "Schema", Page: VisBoot },
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
