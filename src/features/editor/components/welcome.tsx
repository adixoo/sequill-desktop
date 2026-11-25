import { Eye, FolderOpen, Plus, Sparkles, SquareTerminal, Table } from "@/components/atoms/icons";
import { relations } from "@/lib/sqlite/introspect";
import { m } from "motion/react";
import { Mark, Note } from "@/components/molecules/pastel/annotation";
import { Button } from "@/components/atoms/button";
import { Kbd } from "@/components/atoms/kbd";
import { useDbActions } from "@/hooks/use-db-actions";
import { useTableCount } from "@/hooks/use-db";
import { enter } from "@/lib/motion";
import type { Schema, RelationInfo } from "@/types/lib/sqlite/types";
import { useDialogs } from "@/store/dialogs";
import { useWorkspace } from "@/store/workspace";
import { formatCount } from "@/utils/data/format";

/** Shown when no database is open. */
export function NoDatabase() {
  const actions = useDbActions();
  const openDialog = useDialogs((s) => s.open);
  return (
    <div
      data-density="comfortable"
      className="flex flex-1 items-center justify-center overflow-y-auto bg-canvas p-6"
    >
      <m.div {...enter()} className="flex max-w-lg flex-col items-start gap-6">
        <h1 className="text-4xl leading-none font-bold tracking-[-0.035em] text-ink md:text-5xl">
          Open a database to begin
        </h1>
        <p className="text-base leading-relaxed text-ink-soft">
          Files stay on this computer. Nothing is uploaded, and it all keeps working offline.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void actions.pickFile()}>
            <FolderOpen /> Open a .sqlite file
          </Button>
          <Button variant="outline" onClick={() => openDialog({ kind: "newDatabase" })}>
            <Plus /> New empty
          </Button>
          <Button variant="ghost" onClick={() => void actions.createSample()}>
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
          <Note delay={1.1} className="translate-y-2.5">
            or drop a file anywhere
          </Note>
        </div>
      </m.div>
    </div>
  );
}

/** How many tables and views the start screen lists; the palette (Ctrl K) reaches the rest. */
const LISTED_RELATIONS = 8;

/** A large start-screen action: an icon in a neutral circle, a title and one line on what it does. */
function ActionCard({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: typeof Table;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 rounded-xl border border-hairline bg-surface p-4 text-left transition-[background-color,border-color,scale] duration-150 outline-none hover:border-strong hover:bg-raised focus-visible:border-ink focus-visible:ring-3 focus-visible:ring-ink/15 active:scale-[0.98]"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-raised text-ink ring-1 ring-hairline">
        <Icon className="size-4.5" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 pt-0.5">
        <span className="text-sm font-semibold text-ink">{title}</span>
        <span className="text-sm text-ink-soft">{description}</span>
      </span>
    </button>
  );
}

/** One table or view on the start screen: icon, name, a hairline leader and its row count. */
function RelationRow({
  dbId,
  relation,
  onOpen,
}: {
  dbId: string;
  relation: RelationInfo;
  onOpen: () => void;
}) {
  // the sidebar asks for the same counts, so this reads its cache
  const count = useTableCount(dbId, relation.name, relation.kind !== "virtual");
  const Icon = relation.kind === "view" ? Eye : Table;
  return (
    <li className="-mx-2">
      <button
        type="button"
        onClick={onOpen}
        className="group flex w-full items-center gap-4 rounded-xl p-2 text-left transition-colors duration-150 outline-none hover:bg-raised focus-visible:bg-raised focus-visible:ring-3 focus-visible:ring-ink/15"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-md border border-hairline text-ink-muted transition-colors duration-150 group-hover:text-ink">
          <Icon className="size-4" />
        </span>
        <span className="truncate text-sm font-medium text-ink">{relation.name}</span>
        <span aria-hidden className="h-px min-w-6 flex-1 bg-hairline" />
        <span className="shrink-0 text-sm text-ink-muted">
          {relation.kind === "view" && "view"}
          {relation.kind === "view" && count.data !== undefined && " · "}
          {count.data !== undefined &&
            `${formatCount(count.data)} ${count.data === 1 ? "row" : "rows"}`}
        </span>
      </button>
    </li>
  );
}

/** Shown when a database is open but no tab is: start actions and the tables to open. */
export function NoTab({ schema }: { schema: Schema | undefined }) {
  const dbId = useWorkspace((s) => s.dbId);
  const openTable = useWorkspace((s) => s.openTable);
  const openQuery = useWorkspace((s) => s.openQuery);
  const openDialog = useDialogs((s) => s.open);
  const all = relations(schema);
  const listed = all.slice(0, LISTED_RELATIONS);
  const hidden = all.length - listed.length;
  return (
    <div data-density="comfortable" className="flex flex-1 overflow-y-auto bg-canvas p-6">
      <m.div {...enter()} className="@container m-auto flex w-full max-w-2xl flex-col gap-10 py-8">
        <h2 className="sr-only">Pick a table, or ask the data a question</h2>
        <div className="grid gap-3 @lg:grid-cols-2">
          <ActionCard
            icon={SquareTerminal}
            title="New query"
            description="Write SQL and run it against this database"
            onClick={() => openQuery()}
          />
          <ActionCard
            icon={Plus}
            title="New table"
            description="Design its columns, keys and defaults"
            onClick={() => openDialog({ kind: "createTable" })}
          />
        </div>

        {dbId && listed.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-ink">Tables</h2>
            <ul className="flex flex-col">
              {listed.map((relation) => (
                <RelationRow
                  key={relation.name}
                  dbId={dbId}
                  relation={relation}
                  onOpen={() => openTable(relation.name)}
                />
              ))}
            </ul>
            {/* A keyboard shortcut: not shown on touch devices, which usually have no keyboard. */}
            <p className="flex items-center gap-2 text-sm text-ink-muted pointer-coarse:hidden">
              <Kbd>Ctrl K</Kbd>
              {hidden > 0
                ? `opens the other ${formatCount(hidden)}, or any action.`
                : "jumps to any table or action."}
            </p>
          </section>
        )}
      </m.div>
    </div>
  );
}
