import {
  Braces,
  CornerDownRight,
  Download,
  KeyRound,
  Trash,
  Upload,
} from "@/components/atoms/icons";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/atoms/button";
import { Checkbox } from "@/components/atoms/checkbox";
import { Label } from "@/components/atoms/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/atoms/sheet";
import { Textarea } from "@/components/atoms/textarea";
import { downloadBlob, safeFileName } from "@/utils/data/export";
import {
  blobImageType,
  formatBytes,
  looksLikeJson,
  textToValue,
  valueToText,
} from "@/utils/data/format";
import { isWritableColumn, visibleColumns } from "@/lib/sqlite/introspect";
import type { CellValue, ColumnInfo, RelationInfo, Row } from "@/lib/sqlite/types";
import { cn } from "@/utils";

/** `id` changes for every opening, so the form starts fresh each time. */
export type InspectorTarget =
  | { kind: "edit"; id: number; row: Row; index: number }
  | { kind: "new"; id: number; initial?: Row };

type FieldState =
  | { mode: "keep" }
  | { mode: "null" }
  | { mode: "text"; text: string }
  | { mode: "blob"; bytes: Uint8Array };

interface RowInspectorProps {
  relation: RelationInfo;
  target: InspectorTarget | null;
  onClose(): void;
  onSave(values: { column: string; value: CellValue }[]): Promise<boolean>;
  onDelete?(): void;
  onFollowForeignKey?(column: string, value: CellValue): void;
}

function BlobPreview({ bytes }: { bytes: Uint8Array }) {
  const type = blobImageType(bytes);
  const url = useMemo(
    () => (type ? URL.createObjectURL(new Blob([bytes as BlobPart], { type })) : null),
    [bytes, type],
  );
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  if (!url) {
    const hex = Array.from(bytes.subarray(0, 48), (b) => b.toString(16).padStart(2, "0")).join(" ");
    return (
      <code className="block font-mono text-[0.6875rem] break-all text-ink-muted">
        {hex}
        {bytes.length > 48 ? " …" : ""}
      </code>
    );
  }
  return (
    <img
      src={url}
      alt="BLOB image preview"
      className="max-h-40 rounded-xs bg-raised object-contain"
    />
  );
}

function initialFields(
  relation: RelationInfo,
  columns: ColumnInfo[],
  target: InspectorTarget,
): Record<string, FieldState> {
  if (target.kind !== "new" || !target.initial) return {};
  const initial = target.initial;
  return Object.fromEntries(
    columns.map((c, i): [string, FieldState] => {
      const v = initial[i];
      // Let SQLite assign a new rowid alias / autoincrement key when duplicating.
      if (!isWritableColumn(c) || (c.pk > 0 && relation.rowidName && c.type === "INTEGER"))
        return [c.name, { mode: "keep" }];
      if (v === null) return [c.name, { mode: "null" }];
      if (v instanceof Uint8Array) return [c.name, { mode: "blob", bytes: v }];
      return [c.name, { mode: "text", text: valueToText(v) }];
    }),
  );
}

export function RowInspector({ target, onClose, ...props }: RowInspectorProps) {
  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 bg-surface p-0 sm:max-w-lg">
        {target && <InspectorForm key={target.id} target={target} onClose={onClose} {...props} />}
      </SheetContent>
    </Sheet>
  );
}

function InspectorForm({
  relation,
  target,
  onClose,
  onSave,
  onDelete,
  onFollowForeignKey,
}: RowInspectorProps & { target: InspectorTarget }) {
  const columns = useMemo(() => visibleColumns(relation), [relation]);
  const [fields, setFields] = useState<Record<string, FieldState>>(() =>
    initialFields(relation, columns, target),
  );
  const [saving, setSaving] = useState(false);

  const current = (i: number): CellValue =>
    target.kind === "edit" ? (target.row[i] ?? null) : null;

  const changed = columns.flatMap((c) => {
    const f = fields[c.name];
    if (!f || f.mode === "keep") return [];
    const value =
      f.mode === "null" ? null : f.mode === "blob" ? f.bytes : textToValue(f.text, c.type);
    return [{ column: c.name, value }];
  });

  const save = async () => {
    setSaving(true);
    const ok = await onSave(changed);
    setSaving(false);
    if (ok) onClose();
  };

  const isNew = target.kind === "new";
  return (
    <>
      <SheetHeader className="border-b-2 border-hairline">
        <SheetTitle>
          {target.kind === "new" ? `New row in ${relation.name}` : `Row ${target.index + 1}`}
        </SheetTitle>
        <SheetDescription>
          {isNew
            ? "Leave a field on its default to let SQLite fill it in."
            : relation.editable
              ? "Changes are saved together when you press Save."
              : "This relation is read-only."}
        </SheetDescription>
      </SheetHeader>
      <form
        id="row-inspector"
        className="flex-1 overflow-y-auto px-4 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <ul className="flex flex-col gap-5">
          {columns.map((c, i) => {
            const original = current(i);
            const f = fields[c.name] ?? { mode: "keep" };
            const writable = relation.editable && isWritableColumn(c);
            const fk = relation.foreignKeys.find((k) => k.from === c.name);
            const shown: CellValue =
              f.mode === "keep"
                ? original
                : f.mode === "null"
                  ? null
                  : f.mode === "blob"
                    ? f.bytes
                    : f.text;
            const isNull = f.mode === "null" || (f.mode === "keep" && !isNew && original === null);
            const isBlob = shown instanceof Uint8Array;
            const text =
              f.mode === "text" ? f.text : f.mode === "keep" && !isNew ? valueToText(original) : "";
            const id = `field-${i}`;
            return (
              <li key={c.name} className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {c.pk > 0 && (
                    <KeyRound className="size-3.5 text-butter-ink" aria-label="Primary key" />
                  )}
                  <Label htmlFor={id} className="font-semibold text-ink">
                    {c.name}
                  </Label>
                  <span className="font-mono text-[0.6875rem] text-ink-muted uppercase">
                    {c.type || "any"}
                  </span>
                  {c.notNull && <span className="pn-table-head">not null</span>}
                  {c.hidden >= 2 && <span className="pn-table-head">generated</span>}
                  {fk && shown !== null && onFollowForeignKey && (
                    <Button
                      type="button"
                      variant="link"
                      size="xs"
                      className="ml-auto h-auto p-0 text-sky-ink"
                      onClick={() => onFollowForeignKey(c.name, shown)}
                    >
                      <CornerDownRight /> {fk.table}
                    </Button>
                  )}
                </div>
                {isBlob ? (
                  <div className="flex flex-col gap-2 rounded-sm bg-raised p-3">
                    <BlobPreview bytes={shown as Uint8Array} />
                    <p className="font-mono text-xs text-ink-muted">
                      {formatBytes((shown as Uint8Array).byteLength)}
                    </p>
                  </div>
                ) : (
                  <Textarea
                    id={id}
                    value={text}
                    readOnly={!writable}
                    disabled={isNull && !isNew}
                    placeholder={
                      isNew && f.mode === "keep"
                        ? c.defaultValue !== null
                          ? `Default: ${c.defaultValue}`
                          : c.pk > 0
                            ? "Assigned automatically"
                            : "NULL"
                        : isNull
                          ? "NULL"
                          : ""
                    }
                    onChange={(e) =>
                      setFields((s) => ({ ...s, [c.name]: { mode: "text", text: e.target.value } }))
                    }
                    rows={Math.min(8, Math.max(1, text.split("\n").length))}
                    className={cn(
                      "min-h-9 resize-y font-mono text-[0.8125rem] max-md:text-base",
                      isNull && "italic",
                    )}
                  />
                )}
                {writable && (
                  <div className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
                    <label className="flex items-center gap-1.5">
                      <Checkbox
                        checked={isNull}
                        onCheckedChange={(v) =>
                          setFields((s) => ({
                            ...s,
                            [c.name]: v ? { mode: "null" } : { mode: "text", text: "" },
                          }))
                        }
                      />
                      NULL
                    </label>
                    {isNew && f.mode !== "keep" && (
                      <button
                        type="button"
                        className="underline-offset-2 hover:underline"
                        onClick={() => setFields((s) => ({ ...s, [c.name]: { mode: "keep" } }))}
                      >
                        Use default
                      </button>
                    )}
                    {!isBlob && looksLikeJson(text) && (
                      <button
                        type="button"
                        className="flex items-center gap-1 underline-offset-2 hover:underline"
                        onClick={() =>
                          setFields((s) => ({
                            ...s,
                            [c.name]: {
                              mode: "text",
                              text: JSON.stringify(JSON.parse(text), null, 2),
                            },
                          }))
                        }
                      >
                        <Braces className="size-3" /> Format JSON
                      </button>
                    )}
                    <label className="flex cursor-pointer items-center gap-1 underline-offset-2 hover:underline">
                      <Upload className="size-3" /> Upload file
                      <input
                        type="file"
                        className="sr-only"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const bytes = new Uint8Array(await file.arrayBuffer());
                            setFields((s) => ({ ...s, [c.name]: { mode: "blob", bytes } }));
                          }
                        }}
                      />
                    </label>
                    {isBlob && (
                      <button
                        type="button"
                        className="flex items-center gap-1 underline-offset-2 hover:underline"
                        onClick={() =>
                          downloadBlob(
                            shown as BlobPart,
                            `${safeFileName(`${relation.name}-${c.name}`)}.bin`,
                            blobImageType(shown as Uint8Array) ?? "application/octet-stream",
                          )
                        }
                      >
                        <Download className="size-3" /> Download
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </form>
      {relation.editable && (
        <SheetFooter className="flex-row items-center border-t-2 border-hairline">
          {!isNew && onDelete && (
            <Button type="button" variant="destructive" onClick={onDelete}>
              <Trash /> Delete
            </Button>
          )}
          <span className="ml-auto text-xs text-ink-muted">
            {changed.length > 0
              ? `${changed.length} changed`
              : isNew
                ? "All defaults"
                : "No changes"}
          </span>
          <Button
            type="submit"
            form="row-inspector"
            disabled={saving || (!isNew && changed.length === 0)}
          >
            {isNew ? "Insert row" : "Save"}
          </Button>
        </SheetFooter>
      )}
    </>
  );
}
