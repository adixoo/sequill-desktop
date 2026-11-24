import { Copy } from "@/components/atoms/icons";
import { useState } from "react";
import { toast } from "@/components/atoms/toast";
import { CodeBlock } from "@/components/molecules/pastel/code-block";
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
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { ResponsiveDialog, ResponsiveDialogContent } from "@/components/atoms/responsive-dialog";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { useDbActions } from "@/hooks/use-db-actions";
import { useRunStatements } from "@/hooks/use-db";
import { isDesktop } from "@/lib/platform";
import { errorMessage } from "@/lib/sqlite/errors";
import { sqlLiteral } from "@/lib/sqlite/sql";
import type { DbInfo, SqlStatement } from "@/lib/sqlite/types";

/** Renders statements with parameters inlined, for previews only (execution stays parameterised). */
export function previewSql(statements: SqlStatement[]): string {
  return statements
    .map(({ sql, params }) => {
      let i = 0;
      const text =
        params.length > 0 ? sql.replace(/\?/g, () => sqlLiteral(params[i++] ?? null)) : sql;
      return text.trim().endsWith(";") ? text.trim() : `${text.trim()};`;
    })
    .join("\n");
}

export function SqlPreview({ sql }: { sql: string }) {
  return <CodeBlock fileName="will run" code={sql} className="max-h-60 overflow-y-auto" />;
}

interface Closable {
  onClose(): void;
}

export function ConfirmSqlDialog({
  title,
  description,
  statements,
  confirmLabel,
  success,
  schema,
  design,
  designBase,
  changes,
  notes,
  destructive,
  onDone,
  onClose,
}: Closable & {
  title: string;
  description: string;
  statements: SqlStatement[];
  confirmLabel: string;
  success: string;
  schema?: boolean;
  /** Run as a schema design (see useRunStatements). */
  design?: boolean;
  /** For a design: the structure version it was checked against (see useRunStatements). */
  designBase?: number | null;
  /** What will change, in plain words, shown above the SQL. */
  changes?: string[];
  /** Things to know before confirming, shown above the SQL. */
  notes?: string[];
  destructive?: boolean;
  /** Called after the statements ran successfully. */
  onDone?(): void;
}) {
  const run = useRunStatements();
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent size="lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {changes && changes.length > 0 && (
          <section aria-labelledby="confirm-changes" className="flex flex-col gap-1.5">
            <h3 id="confirm-changes" className="text-sm font-semibold text-ink">
              What changes
            </h3>
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-sm bg-raised px-3 py-2.5 text-sm text-ink-soft">
              {changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          </section>
        )}
        {notes && notes.length > 0 && (
          <ul className="flex flex-col gap-1.5 rounded-sm bg-butter-wash px-3 py-2.5 text-sm text-butter-ink">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
        <SqlPreview sql={previewSql(statements)} />
        {run.error && (
          <p role="alert" className="rounded-sm bg-rose-wash px-3 py-2.5 text-sm text-rose-ink">
            Nothing was saved: {errorMessage(run.error)}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={run.isPending}
            onClick={(e) => {
              e.preventDefault();
              run.mutate(
                { statements, success, schema, design, designBase },
                {
                  onSuccess: () => {
                    onDone?.();
                    onClose();
                  },
                },
              );
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** A single-field form dialog (rename, new database). */
export function NameDialog({
  title,
  description,
  label,
  initial,
  submitLabel,
  preview,
  allowUnchanged = false,
  onSubmit,
  onClose,
}: Closable & {
  title: string;
  description?: string;
  label: string;
  initial: string;
  submitLabel: string;
  /** Lets the initial value be submitted as is (a suggested name rather than a rename). */
  allowUnchanged?: boolean;
  /** Optional SQL preview for the current value. */
  preview?(value: string): string | null;
  onSubmit(value: string): Promise<boolean>;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  let sql: string | null = null;
  let problem: string | null = null;
  try {
    sql = preview && value.trim() ? preview(value) : null;
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
  return (
    <ResponsiveDialog open onOpenChange={(open) => !open && onClose()}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!value.trim() || problem) return;
            setBusy(true);
            const ok = await onSubmit(value.trim());
            setBusy(false);
            if (ok) onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="name-field">{label}</Label>
            <Input
              id="name-field"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="max-md:text-base"
            />
          </div>
          {sql && <SqlPreview sql={sql} />}
          {problem && <p className="text-sm text-rose-ink">{problem}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                busy || !value.trim() || (!allowUnchanged && value.trim() === initial) || !!problem
              }
            >
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

/** Copies `text` to the clipboard and confirms with a toast. */
export function CopyButton({ text, copied }: { text: string; copied: string }) {
  return (
    <Button
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast.success(copied);
        } catch {
          toast.error("The browser blocked clipboard access");
        }
      }}
    >
      <Copy /> Copy
    </Button>
  );
}

export function DdlDialog({ title, sql, onClose }: Closable & { title: string; sql: string }) {
  return (
    <ResponsiveDialog open onOpenChange={(open) => !open && onClose()}>
      <ResponsiveDialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>The SQL that defines this object.</DialogDescription>
        </DialogHeader>
        <CodeBlock fileName={`${title}.sql`} code={sql} className="max-h-[60vh] overflow-y-auto" />
        <DialogFooter>
          <CopyButton text={sql} copied="SQL copied" />
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

export function DeleteDatabaseDialog({ db, onClose }: Closable & { db: DbInfo }) {
  const actions = useDbActions();
  if (db.path) {
    return (
      <AlertDialog open onOpenChange={(open) => !open && onClose()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {db.name} from the list?</AlertDialogTitle>
            <AlertDialogDescription>
              Sequill forgets it, but the file stays where it is: {db.path}. You can open it again
              any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await actions.remove(db);
                onClose();
              }}
            >
              Remove from list
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {db.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            It is removed {isDesktop() ? "from this computer" : "from this browser's storage"} and
            can&apos;t be recovered. Download it first if you need a copy.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="outline" onClick={() => void actions.download(db)}>
            Download first
          </Button>
          <AlertDialogAction
            variant="destructive"
            onClick={async () => {
              await actions.remove(db);
              onClose();
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
