import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/atoms/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { Textarea } from "@/components/atoms/textarea";
import { ResponsiveDialog, ResponsiveDialogContent } from "@/components/atoms/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import { DB_FILE_ACCEPT } from "@/constants";
import { isDatabaseFile } from "@/hooks/use-db-actions";
import { importSchema } from "@/lib/sqlite/desktop";
import { errorMessage } from "@/lib/sqlite/errors";
import type { DbInfo } from "@/lib/sqlite/types";
import { IMPORT_DIALECTS, SCHEMA_FILE_ACCEPT } from "@/features/vis/lib/dialects";

interface ImportSchemaDialogProps {
  onImported(database: DbInfo, skipped: string[]): void;
  onClose(): void;
}

/**
 * Makes a new database from another database's schema: a SQLite file or a SQL script for
 * PostgreSQL, MySQL and others. Only the structure comes in, and the new database isn't
 * linked to the file.
 */
export function ImportSchemaDialog({ onImported, onClose }: ImportSchemaDialogProps) {
  const [pasted, setPasted] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [dialect, setDialect] = useState<string>(IMPORT_DIALECTS[0].value);
  const [busy, setBusy] = useState(false);
  // Pasted SQL wins over a picked file.
  const usePasted = pasted.trim() !== "";
  const sqliteFile = !usePasted && file !== null && isDatabaseFile(file);
  const ready = (usePasted || file !== null) && name.trim() !== "";

  const submit = async () => {
    setBusy(true);
    try {
      const bytes = usePasted
        ? new TextEncoder().encode(pasted)
        : new Uint8Array(await file!.arrayBuffer());
      const { database, skipped } = await importSchema(name.trim(), dialect, bytes);
      onImported(database, skipped);
      onClose();
    } catch (error) {
      toast.error(`Nothing was imported: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveDialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <ResponsiveDialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>Import a schema</DialogTitle>
            <DialogDescription>
              Paste the schema of a PostgreSQL, MySQL, MariaDB, SQL Server, DuckDB or SQLite
              database (its CREATE TABLE statements), or pick a .sql or SQLite file. Its tables,
              columns, keys and indexes become a new database with no rows, kept as the saved schema
              you design on. Nothing connects to your database.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="schema-sql">Paste the schema</Label>
            <Textarea
              id="schema-sql"
              value={pasted}
              onChange={(e) => {
                setPasted(e.target.value);
                if (!name.trim()) setName("Imported schema");
              }}
              placeholder={
                "CREATE TABLE customer (\n  id SERIAL PRIMARY KEY,\n  email TEXT NOT NULL\n);"
              }
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
          {(usePasted || file) && !sqliteFile && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="schema-dialect">Written for</Label>
              <Select value={dialect} onValueChange={setDialect}>
                <SelectTrigger id="schema-dialect" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMPORT_DIALECTS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !ready}>
              {busy ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
