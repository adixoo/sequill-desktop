import { FileDown } from "@/shared/ui/icons";
import { AnimatePresence, m } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppProviders } from "@/shared/components/app-providers";
import { lazyComponent } from "@/shared/components/lazy-component";
import { Loader } from "@/shared/components/pastel/loader";
import { Sheet, SheetContent, SheetTitle } from "@/shared/ui/sheet";
import { isDataFile, isDatabaseFile, useDbActions } from "@/shared/hooks/use-db-actions";
import { useDatabases, useRestoreLastDatabase, useSchema } from "@/shared/hooks/use-db";
import { quick } from "@/shared/lib/motion";
import { useDialogs } from "@/shared/lib/store/dialogs";
import { useWorkspace } from "@/shared/lib/store/workspace";
import { DialogHost } from "@/shared/components/dialogs/dialog-host";
import { Sidebar } from "./sidebar";
import { TabBar } from "./tab-bar";
import { TableView } from "./table/table-view";
import { NoDatabase, NoTab } from "./welcome";

const chunkLoader = () => <Loader className="m-auto" size="sm" label="Loading" />;
// CodeMirror and the palette only download when first used.
const QueryConsole = lazyComponent(
  () => import("./query/query-console").then((m) => m.default),
  chunkLoader(),
);
const CommandPalette = lazyComponent(() => import("./command-palette").then((m) => m.default));

function Workspace() {
  const { dbId, tabs, activeTabId, openTable } = useWorkspace();
  const openDialog = useDialogs((s) => s.open);
  const dbs = useDatabases();
  const schema = useSchema(dbId);
  const actions = useDbActions();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteLoaded, setPaletteLoaded] = useState(false);
  const [dragging, setDragging] = useState(false);

  useRestoreLastDatabase();

  // "/app?table=orders" (links from the visualizer) opens that table once the schema is known.
  useEffect(() => {
    const table = new URLSearchParams(window.location.search).get("table");
    if (!table || !schema.data) return;
    if ([...schema.data.tables, ...schema.data.views].some((t) => t.name === table)) {
      openTable(table, { mode: "data" });
    }
    window.history.replaceState(null, "", window.location.pathname);
  }, [schema.data, openTable]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteLoaded(true);
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Drop a database file anywhere to open it; drop CSV/JSON to import it.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files") ?? false;
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (!file) return;
      if (isDatabaseFile(file)) void actions.openFile(file);
      else if (isDataFile(file)) {
        if (useWorkspace.getState().dbId) openDialog({ kind: "import", file });
        else toast.error("Open or create a database first, then drop the file to import it.");
      } else void actions.openFile(file); // unknown extension: let SQLite decide
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [actions, openDialog]);

  const active = tabs.find((t) => t.id === activeTabId);
  const relation =
    active?.kind === "table"
      ? [...(schema.data?.tables ?? []), ...(schema.data?.views ?? [])].find(
          (r) => r.name === active.table,
        )
      : undefined;

  let content;
  if (!dbId) content = dbs.isLoading ? chunkLoader() : <NoDatabase />;
  else if (schema.error)
    content = (
      <div role="alert" className="m-auto max-w-md p-6 text-center">
        <p className="text-lg font-semibold text-ink">This database could not be opened</p>
        <p className="mt-2 text-sm text-ink-soft">{schema.error.message}</p>
      </div>
    );
  else if (!active) content = <NoTab schema={schema.data} />;
  else if (active.kind === "query")
    content = (
      <QueryConsole key={active.id} tabId={active.id} sql={active.sql} schema={schema.data} />
    );
  else if (!schema.data) content = chunkLoader();
  else if (!relation)
    content = (
      <p className="m-auto p-6 text-sm text-ink-muted">“{active.table}” no longer exists.</p>
    );
  else
    content = (
      <TableView
        key={active.id}
        dbId={dbId}
        tabId={active.id}
        relation={relation}
        schema={schema.data}
        view={active.view}
      />
    );

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <Sidebar
        dbId={dbId}
        schema={schema.data}
        className="w-72 shrink-0 border-r-2 border-hairline max-md:hidden"
      />
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        {/* No close button: it would sit on the sidebar's theme toggle. Tap outside or Esc closes. */}
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-[min(20rem,88vw)] p-0"
          aria-describedby={undefined}
        >
          <SheetTitle className="sr-only">Database navigation</SheetTitle>
          <Sidebar dbId={dbId} schema={schema.data} onNavigate={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>
      <main className="flex min-w-0 flex-1 flex-col">
        <TabBar
          schema={schema.data}
          onOpenSidebar={() => setSidebarOpen(true)}
          onOpenPalette={() => {
            setPaletteLoaded(true);
            setPaletteOpen(true);
          }}
        />
        {content}
      </main>
      <DialogHost />
      {paletteLoaded && (
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} schema={schema.data} />
      )}
      <AnimatePresence>
        {dragging && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={quick}
            className="pointer-events-none fixed inset-3 z-50 flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed border-sky-ink bg-canvas/85 backdrop-blur-sm"
          >
            <FileDown className="size-10 text-sky-ink" aria-hidden />
            <p className="text-lg font-semibold text-ink">Drop to open</p>
            <p className="text-sm text-ink-soft">
              .sqlite / .db files open as databases · CSV and JSON import into tables
            </p>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function EditorShell() {
  return (
    <AppProviders>
      <Workspace />
    </AppProviders>
  );
}
