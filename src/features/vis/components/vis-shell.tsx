import { FileUp, Plus } from "@/components/atoms/icons";
import { navigate, ROUTES } from "@/lib/router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "@/components/atoms/toast";
import { AppProviders } from "@/app/app-providers";
import { DatabaseSwitcher } from "@/components/organisms/database-switcher";
import { AppHeader } from "@/components/organisms/app-header";
import { McpButton, McpHistoryButton } from "@/components/organisms/mcp-button";
import { DialogHost } from "@/components/organisms/dialogs/dialog-host";
import { Loader } from "@/components/molecules/pastel/loader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/atoms/alert-dialog";
import { Button } from "@/components/atoms/button";
import { queryKeys, useDatabases, useRestoreLastDatabase, useSchema } from "@/hooks/use-db";
import { isDesktop } from "@/lib/platform";
import { useWorkspace } from "@/store/workspace";
import { hasUnsavedDesign, useDraftsLoaded, writeDraft } from "@/features/vis/lib/drafts";
import { EMPTY_DRAFT } from "@/features/vis/lib/model";
import { Designer } from "./designer";
import { ImportSchemaDialog } from "./import-schema-dialog";
import { NewDatabaseDialog } from "./new-database-dialog";

/** Somewhere to go that would leave the current design: another database, or the editor. */
type Leave = { kind: "db"; id: string } | { kind: "editor" };

function Visualizer() {
  useRestoreLastDatabase("designer");
  const dbId = useWorkspace((s) => s.dbId);
  const setDb = useWorkspace((s) => s.setDb);
  const dbs = useDatabases("designer");
  // A design always belongs to a database: with none saved, the page asks to make one first.
  const activeDb = dbs.data?.length === 0 ? null : dbId;
  const schema = useSchema(activeDb);
  const current = dbs.data?.find((d) => d.id === activeDb);
  const [pending, setPending] = useState<Leave | null>(null);
  const [badgeSlot, setBadgeSlot] = useState<HTMLDivElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [creating, setCreating] = useState(false);
  const queryClient = useQueryClient();

  const go = (to: Leave) => {
    if (to.kind === "editor") navigate(ROUTES.editor);
    else setDb(to.id);
  };

  /** The real database only changes on save, so leaving with a design asks what to do with it. */
  const leave = (to: Leave) => {
    if (to.kind === "db" && to.id === activeDb) return;
    if (activeDb && hasUnsavedDesign(activeDb)) setPending(to);
    else go(to);
  };

  const draftsLoaded = useDraftsLoaded();
  const ready = draftsLoaded && activeDb !== null && schema.data !== undefined;
  const designName = current?.name ?? "this database";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas">
      <AppHeader
        page="schema"
        onPageChange={() => leave({ kind: "editor" })}
        actions={
          <>
            <McpButton />
            <McpHistoryButton />
          </>
        }
      >
        <div className="flex min-w-0 items-center gap-2">
          <DatabaseSwitcher
            variant="inline"
            dbId={activeDb}
            onSwitch={(id) => leave({ kind: "db", id })}
            scope="designer"
            hasDraft={hasUnsavedDesign}
            onImportSchema={isDesktop() ? () => setImporting(true) : undefined}
            onNewDatabase={() => setCreating(true)}
          />
          {/* The designer shows its save state here: "Unsaved" (click to save), "Saved". */}
          <div ref={setBadgeSlot} className="flex items-center" />
        </div>
      </AppHeader>
      {dbs.data?.length === 0 ? (
        <div className="m-auto flex max-w-sm flex-col items-center gap-3 p-6 text-center">
          <p className="text-lg font-semibold text-ink">No database yet</p>
          <p className="text-sm text-ink-soft">
            A design belongs to a database. Make one for the database you want to design, or import
            an existing schema.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => setCreating(true)}>
              <Plus /> New database
            </Button>
            {isDesktop() && (
              <Button variant="outline" onClick={() => setImporting(true)}>
                <FileUp /> Import a schema
              </Button>
            )}
          </div>
        </div>
      ) : ready ? (
        <Designer
          key={activeDb}
          dbId={activeDb}
          dbName={current?.name ?? "Database"}
          dbPath={current?.path ?? null}
          schema={schema.data}
          badgeSlot={badgeSlot}
          onDatabaseCreated={setDb}
        />
      ) : schema.error ? (
        <p role="alert" className="m-auto max-w-md p-6 text-center text-sm text-ink-soft">
          This database could not be opened: {schema.error.message}
        </p>
      ) : (
        <Loader className="m-auto" size="sm" label="Reading the schema" />
      )}

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You have unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              Your design hasn&apos;t been saved to {designName}, so the database is unchanged. Keep
              it as a draft to finish later, or discard it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay here</AlertDialogCancel>
            <Button
              variant="ghost"
              className="text-rose-ink"
              onClick={() => {
                if (activeDb) writeDraft(activeDb, EMPTY_DRAFT);
                const to = pending!;
                setPending(null);
                go(to);
              }}
            >
              Discard changes
            </Button>
            <AlertDialogAction
              onClick={() => {
                const to = pending!;
                setPending(null);
                go(to);
              }}
            >
              Keep as draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {creating && <NewDatabaseDialog onClose={() => setCreating(false)} />}
      {importing && (
        <ImportSchemaDialog
          onClose={() => setImporting(false)}
          onImported={async (database, skipped) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.dbs });
            leave({ kind: "db", id: database.id });
            toast.success(`Imported ${database.name}`, {
              description: skipped.length
                ? `Left out (no SQLite equivalent): ${skipped.join(", ")}`
                : undefined,
            });
          }}
        />
      )}
      <DialogHost />
    </div>
  );
}

export default function VisShell() {
  return (
    <AppProviders>
      <Visualizer />
    </AppProviders>
  );
}
