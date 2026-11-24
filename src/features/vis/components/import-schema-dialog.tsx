import { useRef, useState, type ReactNode } from "react";
import { toast } from "@/components/atoms/toast";
import { Button } from "@/components/atoms/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { FileCode, SquareTerminal, X } from "@/components/atoms/icons";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { ResponsiveDialog, ResponsiveDialogContent } from "@/components/atoms/responsive-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/atoms/tabs";
import { Textarea } from "@/components/atoms/textarea";
import { CodeBlock } from "@/components/molecules/pastel/code-block";
import { DB_FILE_ACCEPT } from "@/constants";
import { isDatabaseFile } from "@/hooks/use-db-actions";
import { useFileDrop } from "@/hooks/use-file-drop";
import { importSchema } from "@/lib/sqlite/desktop";
import { errorMessage } from "@/lib/sqlite/errors";
import type { DbInfo } from "@/lib/sqlite/types";
import { cn } from "@/utils";
import { formatBytes } from "@/utils/data/format";
import { DialectIcon } from "@/components/molecules/dialect-icon";
import {
  IMPORT_DIALECTS,
  SCHEMA_FILE_ACCEPT,
  suggestSchemaName,
  type Dialect,
} from "@/features/vis/lib/dialects";

interface ImportSchemaDialogProps {
  onImported(database: DbInfo, skipped: string[]): void;
  onClose(): void;
}

/**
 * Makes a new database from another database's schema: which database it comes from, then
 * (for someone who hasn't got it yet) the command that prints it, then the schema itself,
 * pasted or as a .sql or SQLite file, and a name. Its tables, data types, enums, functions,
 * triggers and views come in; no rows, and nothing connects to it.
 */
export function ImportSchemaDialog({ onImported, onClose }: ImportSchemaDialogProps) {
  const [dialect, setDialect] = useState<Dialect | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <ResponsiveDialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <ResponsiveDialogContent className="max-h-[92dvh] overflow-y-auto md:flex md:h-[min(36rem,92dvh)] md:max-w-3xl md:flex-col md:gap-6 md:p-6">
        {dialect ? (
          <SchemaStep
            dialect={dialect}
            busy={busy}
            setBusy={setBusy}
            onBack={() => setDialect(null)}
            onImported={(database, skipped) => {
              onImported(database, skipped);
              onClose();
            }}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Import a schema</DialogTitle>
              <DialogDescription>
                Which database is the schema from? Its tables, data types, enums, functions,
                triggers and views come in as a new design. Nothing connects to your database.
              </DialogDescription>
            </DialogHeader>
            <DialectTiles onPick={setDialect} className="md:flex-1 md:content-center" />
          </>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

/** The databases to choose from, as large tiles in wrapping rows. */
export function DialectTiles({
  onPick,
  className,
}: {
  onPick(dialect: Dialect): void;
  className?: string;
}) {
  return (
    // Wrapping rows, centred, so a short last row sits in the middle instead of the left.
    <ul
      aria-label="Database types"
      className={cn("flex flex-wrap justify-center gap-2 md:gap-3", className)}
    >
      {IMPORT_DIALECTS.map((d) => (
        <li
          key={d.value}
          className="basis-[calc((100%-0.5rem)/2)] sm:basis-[calc((100%-1rem)/3)] md:basis-[calc((100%-1.5rem)/3)]"
        >
          <Tile
            icon={<DialectIcon dialect={d.value} className="size-9 md:size-12" />}
            label={d.label}
            onClick={() => onPick(d)}
          />
        </li>
      ))}
    </ul>
  );
}

/** A large choice: an icon over its label, and an optional line saying what it leads to. */
function Tile({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex size-full flex-col items-center justify-center gap-3 rounded-lg px-3 py-5 text-center ring-1 ring-hairline transition-colors duration-150 outline-none hover:bg-active hover:ring-strong focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none md:py-8"
    >
      <span className="text-ink-soft transition-colors duration-150 group-hover:text-ink group-focus-visible:text-ink motion-reduce:transition-none">
        {icon}
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-sm font-medium text-ink">{label}</span>
        {hint && <span className="text-xs text-ink-muted">{hint}</span>}
      </span>
    </button>
  );
}

function TerminalCommand({ command }: { command: string }) {
  return (
    <CodeBlock fileName="terminal command" code={command} language="bash" copyable bare wrap />
  );
}

type Stage = "choose" | "command" | "schema";

function SchemaStep({
  dialect,
  busy,
  setBusy,
  onBack,
  onImported,
}: {
  dialect: Dialect;
  busy: boolean;
  setBusy(busy: boolean): void;
  onBack(): void;
  onImported(database: DbInfo, skipped: string[]): void;
}) {
  // Someone with the schema goes straight to it; someone without gets the command first.
  const [stage, setStage] = useState<Stage>(dialect.command ? "choose" : "schema");
  const [viaCommand, setViaCommand] = useState(false);
  const [pasted, setPasted] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  // Until the name is typed in, it follows the schema.
  const [nameTyped, setNameTyped] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const sqliteFile = file !== null && isDatabaseFile(file);
  const hasSchema = file !== null || pasted.trim() !== "";
  const ready = hasSchema && name.trim() !== "";

  const suggest = (sql: string, fileName?: string) => {
    if (!nameTyped) setName(suggestSchemaName(dialect, sql, fileName));
  };
  const pickFile = (picked: File) => {
    setFile(picked);
    setPasted("");
    setStage("schema");
    if (isDatabaseFile(picked)) suggest("", picked.name);
    else
      void picked.text().then(
        (sql) => suggest(sql, picked.name),
        () => suggest("", picked.name),
      );
  };
  const drop = useFileDrop(pickFile);

  const submit = async () => {
    setBusy(true);
    try {
      const bytes = file
        ? new Uint8Array(await file.arrayBuffer())
        : new TextEncoder().encode(pasted);
      const { database, skipped } = await importSchema(
        name.trim(),
        sqliteFile ? "sqlite" : dialect.value,
        bytes,
      );
      onImported(database, skipped);
    } catch (error) {
      toast.error(`Nothing was imported: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    if (stage === "schema" && viaCommand) setStage("command");
    else if (stage !== "choose" && dialect.command) setStage("choose");
    else onBack();
  };

  return (
    <form
      className="flex flex-col gap-4 md:min-h-0 md:flex-1"
      {...drop.props}
      onSubmit={(e) => {
        e.preventDefault();
        if (stage === "schema" && ready) void submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Import a {dialect.label} schema</DialogTitle>
        <DialogDescription>
          {stage === "choose" && "Do you already have the schema, as SQL or a file?"}
          {stage === "command" &&
            (dialect.query
              ? "Run one of these where you can reach your database, then bring back what it prints."
              : dialect.howTo)}
          {stage === "schema" && "Paste the schema, or drop its file here."}
        </DialogDescription>
      </DialogHeader>

      {stage === "choose" && (
        <div className="grid grid-cols-2 gap-2 md:flex-1 md:content-center md:gap-3">
          <Tile
            icon={<FileCode className="size-7 md:size-10" />}
            label="I have the schema"
            hint="Paste it or drop the file"
            onClick={() => {
              setViaCommand(false);
              setStage("schema");
            }}
          />
          <Tile
            icon={<SquareTerminal className="size-7 md:size-10" />}
            label="Get the schema"
            hint="One command prints it"
            onClick={() => {
              setViaCommand(true);
              setStage("command");
            }}
          />
        </div>
      )}

      {stage === "command" && dialect.command && !dialect.query && (
        <TerminalCommand command={dialect.command} />
      )}
      {stage === "command" && dialect.command && dialect.query && (
        // SQL editors (Supabase, pgAdmin…) can't run a terminal command, so the query comes first.
        <Tabs defaultValue="editor" className="min-w-0 gap-3 md:min-h-0 md:flex-1">
          <TabsList className="w-full">
            <TabsTrigger value="editor">In a SQL editor</TabsTrigger>
            <TabsTrigger value="terminal">In a terminal</TabsTrigger>
          </TabsList>
          <TabsContent value="editor" className="flex min-h-0 min-w-0 flex-col gap-2.5">
            <p className="text-sm text-ink-soft">
              Run this query in Supabase, pgAdmin, DBeaver or psql. It only reads; copy the one cell
              it returns.
            </p>
            <CodeBlock
              fileName="schema-query.sql"
              code={dialect.query}
              copyable
              wrap
              className="max-h-56 overflow-y-auto md:max-h-none md:min-h-0 md:flex-1 [&>figcaption]:sticky [&>figcaption]:top-0 [&>figcaption]:z-10"
            />
          </TabsContent>
          <TabsContent value="terminal" className="flex flex-col gap-2.5">
            <p className="text-sm text-ink-soft">{dialect.howTo}</p>
            <TerminalCommand command={dialect.command} />
          </TabsContent>
        </Tabs>
      )}

      {stage === "schema" && (
        <>
          <div className="flex flex-col gap-2 md:min-h-0 md:flex-1">
            <Label htmlFor={file ? undefined : "schema-sql"}>
              {file ? "Schema file" : "Paste the schema"}
            </Label>
            {file ? (
              <div
                className={cn(
                  "flex items-center gap-3 rounded-md py-2.5 pr-2 pl-3 ring-1 ring-hairline",
                  drop.over && "bg-active ring-2 ring-ring",
                )}
              >
                <FileCode className="size-5 shrink-0 text-ink-soft" aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-ink">{file.name}</span>
                  <span className="text-xs text-ink-muted">{formatBytes(file.size)}</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove the file"
                  disabled={busy}
                  onClick={() => setFile(null)}
                >
                  <X />
                </Button>
              </div>
            ) : (
              <div className="relative md:min-h-0 md:flex-1">
                <Textarea
                  id="schema-sql"
                  value={pasted}
                  onChange={(e) => {
                    setPasted(e.target.value);
                    suggest(e.target.value);
                  }}
                  placeholder="CREATE TABLE …"
                  spellCheck={false}
                  className={cn(
                    "h-44 font-mono text-xs max-md:text-base md:h-full md:resize-none",
                    drop.over && "ring-2 ring-ring",
                  )}
                />
                {drop.over && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-popover/90 text-sm font-medium text-ink">
                    Drop the file to use it
                  </div>
                )}
              </div>
            )}
            {!file && (
              <p className="text-sm text-ink-soft">
                Or drop a file here, or{" "}
                <button
                  type="button"
                  className="font-medium text-ink underline underline-offset-2 outline-none hover:text-ink-soft focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => fileInput.current?.click()}
                >
                  choose one
                </button>
                .
              </p>
            )}
            <input
              ref={fileInput}
              type="file"
              hidden
              accept={`${SCHEMA_FILE_ACCEPT},${DB_FILE_ACCEPT}`}
              aria-label="Schema file"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) pickFile(picked);
                e.target.value = "";
              }}
            />
          </div>
          {hasSchema && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="schema-name">Database name</Label>
              <Input
                id="schema-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameTyped(true);
                }}
              />
            </div>
          )}
        </>
      )}

      {/* Pinned to the bottom edge; the margins match the dialog's wider desktop padding. */}
      <DialogFooter className="md:-mx-6 md:mt-auto md:-mb-6 md:px-6">
        <Button type="button" variant="ghost" onClick={back} disabled={busy}>
          Back
        </Button>
        {stage === "command" && (
          <Button type="button" onClick={() => setStage("schema")}>
            Next
          </Button>
        )}
        {stage === "schema" && (
          <Button type="submit" disabled={busy || !ready}>
            {busy ? "Importing…" : "Import"}
          </Button>
        )}
      </DialogFooter>
    </form>
  );
}
