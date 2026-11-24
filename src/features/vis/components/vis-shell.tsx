import { Table } from "@/components/atoms/icons";
import { navigate, ROUTES } from "@/lib/router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "@/components/atoms/toast";
import { AppProviders } from "@/app/app-providers";
import { DatabaseSwitcher } from "@/components/organisms/database-switcher";
import { DialogHost } from "@/components/organisms/dialogs/dialog-host";
import { Loader } from "@/components/molecules/pastel/loader";
import { ThemeToggle } from "@/components/molecules/theme-toggle";
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
import {
  BLANK_DESIGN,
  hasUnsavedDesign,
  useDraftsLoaded,
  writeDraft,
} from "@/features/vis/lib/drafts";
import { EMPTY_DRAFT } from "@/features/vis/lib/model";
import { Designer } from "./designer";
import { ImportSchemaDialog } from "./import-schema-dialog";

/** Somewhere to go that would leave the current design: another database, a blank design, the editor. */
type Leave = { kind: "db"; id: string } | { kind: "blank" } | { kind: "editor" };

function Visualizer() {
  useRestoreLastDatabase();
  const dbId = useWorkspace((s) => s.dbId);
  const setDb = useWorkspace((s) => s.setDb);
  const dbs = useDatabases();
  // Blank mode is tied to the database that was open when it was chosen, so any
  // switch (including creating or opening a database from the menu) leaves it.
  const [blankAt, setBlankAt] = useState<string | null | undefined>(undefined);
  // With no saved databases there is nothing to visualize yet, so start a blank design.
  const blank = blankAt === dbId || dbs.data?.length === 0;
  const activeDb = blank ? null : dbId;
  const schema = useSchema(activeDb);
  const current = dbs.data?.find((d) => d.id === activeDb);
  const storageKey = blank ? BLANK_DESIGN : activeDb;
  const [pending, setPending] = useState<Leave | null>(null);
  const [badgeSlot, setBadgeSlot] = useState<HTMLDivElement | null>(null);
  const [importing, setImporting] = useState(false);
  const queryClient = useQueryClient();

  const go = (to: Leave) => {
    if (to.kind === "editor") navigate(ROUTES.editor);
    else if (to.kind === "blank") setBlankAt(dbId);
    else {
      setBlankAt(undefined);
      setDb(to.id);
    }
  };

  /** The real database only changes on save, so leaving with a design asks what to do with it. */
  const leave = (to: Leave) => {
    const same =
      (to.kind === "db" && to.id === activeDb && !blank) || (to.kind === "blank" && blank);
    if (same) return;
    if (storageKey && hasUnsavedDesign(storageKey)) setPending(to);
    else go(to);
  };

  const draftsLoaded = useDraftsLoaded();
  const ready = draftsLoaded && (blank || (activeDb !== null && schema.data !== undefined));
  const designName = blank ? "the blank design" : (current?.name ?? "this database");

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b-2 border-hairline bg-surface px-3">
        <h1 className="font-semibold tracking-[-0.015em] text-ink">Schema</h1>
        <DatabaseSwitcher
          variant="inline"
          className="ml-2"
          dbId={activeDb}
          onSwitch={(id) => leave({ kind: "db", id })}
          blankDesign={{
            active: blank,
            onSelect: () => leave({ kind: "blank" }),
            hasDraft: hasUnsavedDesign(BLANK_DESIGN),
          }}
          hasDraft={hasUnsavedDesign}
          onImportSchema={isDesktop() ? () => setImporting(true) : undefined}
        />
        {/* The designer shows its save state here: "Unsaved" (click to save), "Saved". */}
        <div ref={setBadgeSlot} className="flex items-center" />
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => leave({ kind: "editor" })}>
            <Table /> <span className="max-sm:sr-only">Editor</span>
          </Button>
          <ThemeToggle />
        </div>
      </header>
      {ready ? (
        <Designer
          key={storageKey!}
          storageKey={storageKey!}
          dbId={activeDb}
          dbName={blank ? "Blank design" : (current?.name ?? "Database")}
          dbPath={blank ? null : (current?.path ?? null)}
          schema={schema.data}
          badgeSlot={badgeSlot}
          onDatabaseCreated={(id) => {
            setBlankAt(undefined);
            setDb(id);
          }}
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
              {blank
                ? "The blank design hasn't been saved as a database yet."
                : `Your design hasn't been saved to ${designName}, so the database is unchanged.`}{" "}
              Keep it as a draft to finish later, or discard it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay here</AlertDialogCancel>
            <Button
              variant="ghost"
              className="text-rose-ink"
              onClick={() => {
                if (storageKey) writeDraft(storageKey, EMPTY_DRAFT);
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
