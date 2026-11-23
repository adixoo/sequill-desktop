import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/atoms/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { Check, ChevronRight, Copy } from "@/components/atoms/icons";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { ResponsiveDialog, ResponsiveDialogContent } from "@/components/atoms/responsive-dialog";
import { Textarea } from "@/components/atoms/textarea";
import { DB_FILE_ACCEPT } from "@/constants";
import { useCopy } from "@/hooks/use-copy";
import { isDatabaseFile } from "@/hooks/use-db-actions";
import { importSchema } from "@/lib/sqlite/desktop";
import { errorMessage } from "@/lib/sqlite/errors";
import type { DbInfo } from "@/lib/sqlite/types";
import { IMPORT_DIALECTS, SCHEMA_FILE_ACCEPT, type Dialect } from "@/features/vis/lib/dialects";

interface ImportSchemaDialogProps {
  onImported(database: DbInfo, skipped: string[]): void;
  onClose(): void;
}

/**
 * Makes a new database from another database's schema, in two steps: which database it
 * comes from, then its schema (pasted, or a .sql or SQLite file). Its tables, data types,
 * enums, functions, triggers and views come in; no rows, and nothing connects to it.
 */
export function ImportSchemaDialog({ onImported, onClose }: ImportSchemaDialogProps) {
  const [dialect, setDialect] = useState<Dialect | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <ResponsiveDialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <ResponsiveDialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
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
            <ul aria-label="Database types" className="flex flex-col gap-1.5">
              {IMPORT_DIALECTS.map((d) => (
                <li key={d.value}>
                  <button
                    type="button"
                    onClick={() => setDialect(d)}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left ring-2 ring-hairline outline-none hover:bg-zebra focus-visible:ring-ring"
                  >
                    <span className="flex-1 text-sm font-medium text-ink">{d.label}</span>
                    <ChevronRight className="size-4 text-ink-muted" />
                  </button>
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            </DialogFooter>
          </>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

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
  const [pasted, setPasted] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const { copied, copy } = useCopy();
  // Pasted SQL wins over a picked file.
  const usePasted = pasted.trim() !== "";
  const ready = (usePasted || file !== null) && name.trim() !== "";
  const sqliteFile = !usePasted && file !== null && isDatabaseFile(file);

  const submit = async () => {
    setBusy(true);
    try {
      const bytes = usePasted
        ? new TextEncoder().encode(pasted)
        : new Uint8Array(await file!.arrayBuffer());
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

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) void submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Import a {dialect.label} schema</DialogTitle>
        <DialogDescription>{dialect.howTo}</DialogDescription>
      </DialogHeader>
      {dialect.command && (
        <div className="flex items-center gap-2 rounded-sm bg-raised py-1.5 pr-1.5 pl-3">
          <code className="min-w-0 flex-1 overflow-x-auto font-mono text-xs whitespace-nowrap text-ink">
            {dialect.command}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={copied ? "Copied" : "Copy the command"}
            onClick={() => void copy(dialect.command!)}
          >
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="schema-sql">Paste the schema</Label>
        <Textarea
          id="schema-sql"
          value={pasted}
          onChange={(e) => {
            setPasted(e.target.value);
            if (!name.trim()) setName(`${dialect.label} schema`);
          }}
          placeholder="CREATE TABLE …"
          spellCheck={false}
          className="h-40 font-mono text-xs max-md:text-base"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="schema-file">Or pick a file</Label>
        <Input
          id="schema-file"
          type="file"
          accept={`${SCHEMA_FILE_ACCEPT},${DB_FILE_ACCEPT}`}
          onChange={(e) => {
            const picked = e.target.files?.[0] ?? null;
            setFile(picked);
            if (picked && !name.trim()) setName(picked.name.replace(/\.[^.]+$/, ""));
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="schema-name">Database name</Label>
        <Input
          id="schema-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-md:text-base"
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button type="submit" disabled={busy || !ready}>
          {busy ? "Importing…" : "Import"}
        </Button>
      </DialogFooter>
    </form>
  );
}
