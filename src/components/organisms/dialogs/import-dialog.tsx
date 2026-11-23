import Papa from "papaparse";
import { FileUp } from "@/components/atoms/icons";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
  inferJsonTypes,
  inferTypes,
  jsonToTable,
  normalizeHeader,
  type ImportType,
} from "@/utils/data/import";
import { getSqlite } from "@/lib/sqlite/client";
import { buildCreateTable, buildDrop, emptyColumn } from "@/lib/sqlite/ddl";
import { errorMessage } from "@/lib/sqlite/errors";
import { buildInsertMany } from "@/lib/sqlite/sql";
import type { CellValue } from "@/lib/sqlite/types";
import { useWorkspace } from "@/store/workspace";
import { SqlPreview } from "./simple-dialogs";

const SKIP = "__skip__";
const IMPORT_TYPES: ImportType[] = ["INTEGER", "REAL", "TEXT"];

type Parsed =
  | { kind: "text"; rows: string[][] }
  | { kind: "json"; columns: string[]; rows: CellValue[][]; types: ImportType[] };

async function parseFile(file: File): Promise<Parsed> {
  const text = await file.text();
  if (/\.json$/i.test(file.name) || /^\s*\[/.test(text)) {
    const table = jsonToTable(JSON.parse(text));
    return { kind: "json", ...table, types: inferJsonTypes(table) };
  }
  const result = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
  if (result.errors.length > 0 && result.data.length === 0)
    throw new Error(result.errors[0].message);
  return { kind: "text", rows: result.data };
}

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

  const [file, setFile] = useState<File | undefined>(initialFile);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
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
    parseFile(file).then(
      (p) => {
        if (cancelled) return;
        setParsed(p);
        setParseError(null);
        setNewName(
          (n) =>
            n ||
            file.name
              .replace(/\.[^.]+$/, "")
              .replace(/\W+/g, "_")
              .toLowerCase(),
        );
      },
      (error) => !cancelled && setParseError(errorMessage(error)),
    );
    return () => {
      cancelled = true;
    };
  }, [file]);

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
            <label className="flex cursor-pointer items-center gap-3 rounded-sm border-2 border-dashed border-strong bg-raised px-4 py-3 text-sm hover:bg-zebra">
              <FileUp className="size-5 text-ink-muted" />
              <span className="flex-1 truncate text-ink-soft">
                {file ? file.name : "Choose a .csv, .tsv or .json file"}
              </span>
              <span className="text-sky-ink">{file ? "Change" : "Browse"}</span>
              <input
                type="file"
                accept=".csv,.tsv,.txt,.json"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setFile(f);
                    setParsed(null);
                    setTypeOverrides({});
                    setMapping({});
                  }
                }}
              />
            </label>
            {parseError && (
              <p role="alert" className="text-sm text-rose-ink">
                Could not read the file: {parseError}
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
                      <SelectTrigger size="sm" className="w-56" aria-label="Target table">
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
