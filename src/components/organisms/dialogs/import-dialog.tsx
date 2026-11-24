import { ClipboardPaste, FileUp } from "@/components/atoms/icons";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/atoms/toast";
import { Loader } from "@/components/molecules/pastel/loader";
import { Button } from "@/components/atoms/button";
import { Checkbox } from "@/components/atoms/checkbox";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { ResponsiveDialog, ResponsiveDialogContent } from "@/components/atoms/responsive-dialog";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { Textarea } from "@/components/atoms/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/atoms/toggle-group";
import { useInvalidate, useSchema } from "@/hooks/use-db";
import { IMPORT_PREVIEW_ROWS } from "@/constants";
import { cellPreview, formatCount, textToValue } from "@/utils/data/format";
import {
  coerceCell,
  inferTypes,
  normalizeHeader,
  parseImportText,
  type ImportType,
  type ParsedImport,
} from "@/utils/data/import";
import { getSqlite } from "@/lib/sqlite/client";
import { buildCreateTable, buildDrop, emptyColumn } from "@/lib/sqlite/ddl";
import { errorMessage } from "@/lib/sqlite/errors";
import { buildInsertMany } from "@/lib/sqlite/sql";
import type { CellValue } from "@/lib/sqlite/types";
import { useWorkspace } from "@/store/workspace";
import { cn } from "@/utils";
import { SqlPreview } from "./simple-dialogs";

const SKIP = "__skip__";
const IMPORT_TYPES: ImportType[] = ["INTEGER", "REAL", "TEXT"];

/** A table name from a file name: "Sales 2024.csv" gives "sales_2024". */
const tableNameFor = (fileName: string) =>
  fileName
    .replace(/\.[^.]+$/, "")
    .replace(/\W+/g, "_")
    .toLowerCase();

export function ImportDialog({
  file: initialFile,
  table: initialTable,
  onClose,
}: {
  file?: File;
  table?: string;
  onClose(): void;
}) {
  const dbId = useWorkspace((s) => s.dbId);
  const openTable = useWorkspace((s) => s.openTable);
  const schema = useSchema(dbId);
  const invalidate = useInvalidate();
  const tables = (schema.data?.tables ?? []).filter(
    (t) => t.editable && t.name !== "sqlite_sequence",
  );

  const [mode, setMode] = useState<"file" | "paste">("file");
  const [file, setFile] = useState<File | undefined>(initialFile);
  const [pasted, setPasted] = useState("");
  // Re-parse pasted text once typing settles, not on every key.
  const pastedText = useDeferredValue(pasted);
  const [dragOver, setDragOver] = useState(false);
  const [fileParsed, setFileParsed] = useState<ParsedImport | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [header, setHeader] = useState(true);
  const [emptyAsNull, setEmptyAsNull] = useState(true);
  const [target, setTarget] = useState<"new" | "existing">(initialTable ? "existing" : "new");
  const [newName, setNewName] = useState("");
  const [existing, setExisting] = useState(initialTable ?? "");
  const [typeOverrides, setTypeOverrides] = useState<Record<number, ImportType>>({});
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    file.text().then(
      (text) => {
        if (cancelled) return;
        try {
          setFileParsed(parseImportText(text, /\.json$/i.test(file.name)));
          setFileError(null);
          setNewName((n) => n || tableNameFor(file.name));
        } catch (error) {
          setFileError(errorMessage(error));
        }
      },
      (error) => !cancelled && setFileError(errorMessage(error)),
    );
    return () => {
      cancelled = true;
    };
  }, [file]);

  const pastedParse = useMemo(() => {
    if (!pastedText.trim()) return null;
    try {
      return { parsed: parseImportText(pastedText), error: null };
    } catch (error) {
      return { parsed: null, error: errorMessage(error) };
    }
  }, [pastedText]);
  const parsed = mode === "paste" ? (pastedParse?.parsed ?? null) : fileParsed;
  const parseError = mode === "paste" ? (pastedParse?.error ?? null) : fileError;

  // Column types and mapping are per source column, so a new source starts them over.
  const resetColumns = () => {
    setTypeOverrides({});
    setMapping({});
  };
  const chooseFile = (next: File) => {
    setFile(next);
    setFileParsed(null);
    setFileError(null);
    resetColumns();
  };

  const source = useMemo(() => {
    if (!parsed) return null;
    if (parsed.kind === "json")
      return { columns: parsed.columns, rows: parsed.rows, types: parsed.types };
    const width = Math.max(0, ...parsed.rows.map((r) => r.length));
    const body = header ? parsed.rows.slice(1) : parsed.rows;
    const columns = normalizeHeader(
      Array.from({ length: width }, (_, i) =>
        header ? (parsed.rows[0]?.[i] ?? "") : `column_${i + 1}`,
      ),
    );
    return { columns, rows: body as CellValue[][], types: inferTypes(body, width) };
  }, [parsed, header]);

  const types = source?.types.map((t, i) => typeOverrides[i] ?? t) ?? [];
  const targetTable = tables.find((t) => t.name === existing);
  const mapped = (i: number): string | null => {
    if (target === "new") return source!.columns[i];
    const explicit = mapping[i];
    if (explicit !== undefined) return explicit === SKIP ? null : explicit;
    const match = targetTable?.columns.find(
      (c) => c.name.toLowerCase() === source!.columns[i].toLowerCase(),
    );
    return match?.name ?? null;
  };

  let createSql: string | null = null;
  let problem: string | null = null;
  if (source && target === "new") {
    try {
      createSql = buildCreateTable({
        name: newName,
        columns: source.columns.map((name, i) => ({ ...emptyColumn(name), type: types[i] })),
        withoutRowid: false,
        strict: false,
      });
    } catch (error) {
      problem = errorMessage(error);
    }
  }
  const targetColumns = source ? source.columns.map((_, i) => mapped(i)) : [];
  const usedColumns = targetColumns.filter((c): c is string => !!c);
  if (source && target === "existing" && !targetTable) problem = "Pick a table to import into";
  else if (source && usedColumns.length === 0) problem = "Map at least one column";
  else if (new Set(usedColumns).size !== usedColumns.length)
    problem = "Two source columns map to the same table column";

  const runImport = async () => {
    if (!source || !dbId || problem) return;
    const tableName = target === "new" ? newName.trim() : existing;
    const indexes = targetColumns.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
    const declared = (column: string) =>
      targetTable?.columns.find((c) => c.name === column)?.type ?? "";
    const rows = source.rows.map((row) =>
      indexes.map((i) => {
        const v = row[i];
        if (parsed?.kind === "json") return v === undefined ? null : v;
        const text = v as string | undefined;
        if (target === "new") return coerceCell(text, types[i], emptyAsNull);
        if (text === undefined || (emptyAsNull && text.trim() === "")) return null;
        return textToValue(text, declared(targetColumns[i]!));
      }),
    );
    setBusy(true);
    const api = getSqlite();
    try {
      if (createSql) await api.transaction(dbId, [{ sql: createSql, params: [] }]);
      try {
        await api.insertMany(
          dbId,
          buildInsertMany(
            tableName,
            indexes.map((i) => targetColumns[i]!),
          ),
          rows,
        );
      } catch (error) {
        // Undo the table we just created so a failed import leaves nothing behind.
        if (createSql)
          await api.transaction(dbId, [{ sql: buildDrop("table", tableName), params: [] }]);
        throw error;
      }
      await invalidate({ schema: true });
      toast.success(`Imported ${formatCount(rows.length)} rows into ${tableName}`);
      onClose();
      openTable(tableName, { mode: "data", page: 0 });
    } catch (error) {
      toast.error(`Import failed, nothing was imported: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const preview = source?.rows.slice(0, IMPORT_PREVIEW_ROWS) ?? [];

  return (
    <ResponsiveDialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <ResponsiveDialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import data</DialogTitle>
          <DialogDescription>
            CSV, TSV or a JSON array of objects. Rows are inserted in one transaction, so a failure
            changes nothing.
          </DialogDescription>
        </DialogHeader>

        {busy ? (
          <Loader
            className="py-10"
            label={`Importing ${formatCount(source?.rows.length ?? 0)} rows`}
          />
        ) : (
          <div className="flex flex-col gap-5">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={mode}
              onValueChange={(v) => {
                if (!v) return;
                setMode(v as typeof mode);
                resetColumns();
              }}
              aria-label="Import from"
              className="self-start"
            >
              <ToggleGroupItem value="file">
                <FileUp /> File
              </ToggleGroupItem>
              <ToggleGroupItem value="paste">
                <ClipboardPaste /> Paste
              </ToggleGroupItem>
            </ToggleGroup>

            {mode === "file" ? (
              <label
                data-testid="import-drop-zone"
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes("Files")) return;
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  // Keep the editor's window-wide drop from opening another import.
                  e.stopPropagation();
                  setDragOver(false);
                  const dropped = e.dataTransfer.files[0];
                  if (dropped) chooseFile(dropped);
                }}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm transition-colors duration-150",
                  dragOver
                    ? "border-sky-ink bg-sky-wash"
                    : "border-strong bg-raised hover:bg-active",
                )}
              >
                {/* Children ignore the pointer so moving over them doesn't end the drag-over. */}
                <FileUp className="pointer-events-none size-6 text-ink-muted" />
                <span className="pointer-events-none max-w-full truncate font-medium text-ink">
                  {file ? file.name : "Drop a .csv, .tsv or .json file here"}
                </span>
                <span className="pointer-events-none text-ink-muted">
                  or <span className="text-sky-ink">{file ? "choose another" : "browse"}</span>
                </span>
                <input
                  type="file"
                  accept=".csv,.tsv,.txt,.json"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) chooseFile(f);
                  }}
                />
              </label>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="import-paste">Data</Label>
                <Textarea
                  id="import-paste"
                  value={pasted}
                  onChange={(e) => {
                    setPasted(e.target.value);
                    resetColumns();
                    setNewName((n) => n || "pasted_data");
                  }}
                  placeholder={
                    "Paste CSV, TSV (from a spreadsheet) or a JSON array\nid,name\n1,Asha"
                  }
                  spellCheck={false}
                  className="max-h-72 min-h-40 font-mono"
                />
              </div>
            )}
            {parseError && (
              <p role="alert" className="text-sm text-rose-ink">
                Could not read the {mode === "file" ? "file" : "pasted data"}: {parseError}
              </p>
            )}

            {source && (
              <>
                <div className="flex flex-wrap items-end gap-4">
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    value={target}
                    onValueChange={(v) => v && setTarget(v as typeof target)}
                    aria-label="Import into"
                  >
                    <ToggleGroupItem value="new">New table</ToggleGroupItem>
                    <ToggleGroupItem value="existing" disabled={tables.length === 0}>
                      Existing table
                    </ToggleGroupItem>
                  </ToggleGroup>
                  {target === "new" ? (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="import-name">Table name</Label>
                      <Input
                        id="import-name"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="h-8 w-56 font-mono max-md:text-base"
                      />
                    </div>
                  ) : (
                    <Select
                      value={existing}
                      onValueChange={(v) => {
                        setExisting(v);
                        setMapping({});
                      }}
                    >
                      <SelectTrigger className="w-56" aria-label="Target table">
                        <SelectValue placeholder="Pick a table" />
                      </SelectTrigger>
                      <SelectContent>
                        {tables.map((t) => (
                          <SelectItem key={t.name} value={t.name}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {parsed?.kind === "text" && (
                    <label className="flex items-center gap-2 text-sm text-ink-soft">
                      <Checkbox checked={header} onCheckedChange={(v) => setHeader(v === true)} />{" "}
                      First row is a header
                    </label>
                  )}
                  {parsed?.kind === "text" && (
                    <label className="flex items-center gap-2 text-sm text-ink-soft">
                      <Checkbox
                        checked={emptyAsNull}
                        onCheckedChange={(v) => setEmptyAsNull(v === true)}
                      />{" "}
                      Empty cells become NULL
                    </label>
                  )}
                </div>

                <div className="overflow-x-auto rounded-sm ring-2 ring-hairline ring-inset">
                  <table className="w-max min-w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-raised">
                        {source.columns.map((c, i) => (
                          <th
                            key={i}
                            className="border-r border-b-2 border-hairline p-2 text-left align-top"
                          >
                            <div className="flex min-w-32 flex-col gap-1.5">
                              <span className="font-mono text-[0.6875rem] text-ink-muted">{c}</span>
                              {target === "new" ? (
                                <Select
                                  value={types[i]}
                                  onValueChange={(t) =>
                                    setTypeOverrides((s) => ({ ...s, [i]: t as ImportType }))
                                  }
                                >
                                  <SelectTrigger
                                    size="sm"
                                    className="h-7 bg-surface font-mono text-xs"
                                    aria-label={`Type for ${c}`}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {IMPORT_TYPES.map((t) => (
                                      <SelectItem key={t} value={t} className="font-mono">
                                        {t}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Select
                                  value={mapped(i) ?? SKIP}
                                  onValueChange={(t) => setMapping((s) => ({ ...s, [i]: t }))}
                                >
                                  <SelectTrigger
                                    size="sm"
                                    className="h-7 bg-surface text-xs"
                                    aria-label={`Target column for ${c}`}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={SKIP}>Skip</SelectItem>
                                    {targetTable?.columns.map((col) => (
                                      <SelectItem key={col.name} value={col.name}>
                                        → {col.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, r) => (
                        <tr key={r} className="bg-surface">
                          {source.columns.map((_, i) => (
                            <td
                              key={i}
                              className="max-w-56 truncate border-r border-b border-hairline px-2 py-1 text-ink-soft"
                            >
                              {cellPreview((row[i] ?? null) as CellValue)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-ink-muted">
                  {formatCount(source.rows.length)} rows · showing the first{" "}
                  {Math.min(IMPORT_PREVIEW_ROWS, source.rows.length)}
                </p>
                {createSql && <SqlPreview sql={createSql} />}
                {problem && <p className="text-sm text-ink-muted">{problem}</p>}
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => void runImport()}
            disabled={!source || !!problem || busy || source.rows.length === 0}
          >
            Import {source ? formatCount(source.rows.length) : ""} rows
          </Button>
        </DialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
