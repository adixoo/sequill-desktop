import { FolderOpen, Plus, Sparkles, SquareTerminal, Table } from "@/components/atoms/icons";
import { m } from "motion/react";
import { Mark, Note } from "@/components/molecules/pastel/annotation";
import { Button } from "@/components/atoms/button";
import { Kbd } from "@/components/atoms/kbd";
import { useDbActions } from "@/hooks/use-db-actions";
import { DB_FILE_ACCEPT } from "@/constants";
import { enter } from "@/lib/motion";
import { isDesktop } from "@/lib/platform";
import type { Schema } from "@/lib/sqlite/types";
import { useDialogs } from "@/store/dialogs";
import { useWorkspace } from "@/store/workspace";

/** Shown when no database is open. */
export function NoDatabase() {
  const actions = useDbActions();
  const openDialog = useDialogs((s) => s.open);
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto bg-canvas p-6">
      <m.div {...enter()} className="flex max-w-lg flex-col items-start gap-6">
        <h1 className="text-4xl leading-none font-bold tracking-[-0.035em] text-ink md:text-5xl">
          Open a database to begin
        </h1>
        <p className="text-base leading-relaxed text-ink-soft">
          Files stay {isDesktop() ? "on this computer" : "in this browser's private storage"}.
          Nothing is uploaded, and it all keeps working offline.
        </p>
        <div className="flex flex-wrap gap-2">
          {isDesktop() ? (
            // The system's file picker: the file is edited where it is, never copied.
            <Button size="lg" onClick={() => actions.pickFile(null)}>
              <FolderOpen /> Open a .sqlite file
            </Button>
          ) : (
            <Button size="lg" asChild>
              <label className="cursor-pointer">
                <FolderOpen /> Open a .sqlite file
                <input
                  type="file"
                  accept={DB_FILE_ACCEPT}
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void actions.openFile(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </Button>
          )}
          <Button size="lg" variant="outline" onClick={() => openDialog({ kind: "newDatabase" })}>
            <Plus /> New empty
          </Button>
          <Button size="lg" variant="ghost" onClick={() => void actions.createSample()}>
            <Sparkles /> Try the sample
          </Button>
        </div>
        {/*
          The arrow rises from the note and points up at "Open a .sqlite file". Dropping
          files is a mouse thing, so touch devices don't get the hint.
        */}
        <div className="relative -mt-4 flex items-end gap-1 pl-6 pointer-coarse:hidden">
          <Mark name="rise" className="w-8 shrink-0" delay={0.5} />
          {/* Lowered so the arrow's tail meets the middle of the text. */}
          <Note delay={1.1} size="sm" className="translate-y-2.5">
            or drop a file anywhere
          </Note>
        </div>
      </m.div>
    </div>
  );
}

/** Shown when a database is open but no tab is. */
export function NoTab({ schema }: { schema: Schema | undefined }) {
  const openTable = useWorkspace((s) => s.openTable);
  const openQuery = useWorkspace((s) => s.openQuery);
  const openDialog = useDialogs((s) => s.open);
  const first = schema?.tables[0] ?? schema?.views[0];
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto bg-canvas p-6">
      <m.div {...enter()} className="flex max-w-md flex-col items-start gap-5">
        <h2 className="text-3xl leading-tight font-semibold tracking-[-0.025em] text-ink">
          Pick a table, or ask the data a question
        </h2>
        <div className="flex flex-wrap gap-2">
          {first && (
            <Button onClick={() => openTable(first.name)}>
              <Table /> Open {first.name}
            </Button>
          )}
          <Button variant="outline" onClick={() => openQuery()}>
            <SquareTerminal /> New query
          </Button>
          <Button variant="ghost" onClick={() => openDialog({ kind: "createTable" })}>
            <Plus /> New table
          </Button>
        </div>
        {/* A keyboard shortcut: not shown on touch devices, which usually have no keyboard. */}
        <p className="flex items-center gap-2 text-sm text-ink-muted pointer-coarse:hidden">
          <Kbd>Ctrl K</Kbd> jumps to any table or action.
        </p>
      </m.div>
    </div>
  );
}
