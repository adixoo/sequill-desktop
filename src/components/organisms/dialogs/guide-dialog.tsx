import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/atoms/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { ResponsiveDialog, ResponsiveDialogContent } from "@/components/atoms/responsive-dialog";
import { StepNumber } from "@/components/molecules/step-number";
import { APP_NAME, STORAGE_KEYS } from "@/constants";
import { isDesktop, storagePlace } from "@/lib/platform";
import { readJson, writeJson } from "@/lib/storage";
import { useDialogs } from "@/store/dialogs";

/** Opens the guide the first time the app starts here (once per browser or install). */
export function useFirstRunGuide(): void {
  const open = useDialogs((s) => s.open);
  useEffect(() => {
    if (!readJson(STORAGE_KEYS.guideSeen, false)) open({ kind: "guide" });
  }, [open]);
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <StepNumber n={n} size="md" />
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <p className="text-sm leading-relaxed text-ink-soft">{children}</p>
      </div>
    </li>
  );
}

/** What the app does and how its parts fit together; shown on first start and from the palette. */
export function GuideDialog({ onClose }: { onClose(): void }) {
  const desktop = isDesktop();
  const openDialog = useDialogs((s) => s.open);
  useEffect(() => writeJson(STORAGE_KEYS.guideSeen, true), []);

  return (
    <ResponsiveDialog open onOpenChange={(open) => !open && onClose()}>
      <ResponsiveDialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Welcome to {APP_NAME}</DialogTitle>
          <DialogDescription>
            A SQLite editor and schema designer. Everything stays {storagePlace()} and works
            offline.
          </DialogDescription>
        </DialogHeader>
        <ol className="flex flex-col gap-4">
          <Step n={1} title="Open or create a database">
            {desktop
              ? "Open a .sqlite file and it's edited where it is, start an empty database, or try the sample shop."
              : "Open a .sqlite file (a copy is kept in this browser), start an empty database, or try the sample shop."}
          </Step>
          <Step n={2} title="Browse and edit data">
            The editor shows each table as a grid: filter, sort, edit cells, import CSV or JSON, and
            run SQL in the console.
          </Step>
          <Step n={3} title="Design the schema">
            Schema in the top bar draws your tables as a diagram you can edit. Changes stay a draft
            you can compare with the saved schema; nothing touches the database until you review the
            SQL and save.
            {desktop &&
              " Import a schema from PostgreSQL, MySQL, SQL Server and others, or export yours for them."}
          </Step>
          {desktop && (
            <Step n={4} title="Work with an AI assistant">
              Connect Claude, Cursor and others with the MCP button. They can read your databases,
              change them when you allow it, and draft schema designs for you to review.
            </Step>
          )}
        </ol>
        <DialogFooter>
          {desktop && (
            <Button variant="ghost" onClick={() => openDialog({ kind: "mcp" })}>
              Connect an assistant
            </Button>
          )}
          <Button autoFocus onClick={onClose}>
            Get started
          </Button>
        </DialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
