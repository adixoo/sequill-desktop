import { Braces, CornerDownRight, Download, KeyRound, Trash } from "@/components/atoms/icons";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/atoms/button";
import { Label } from "@/components/atoms/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/atoms/sheet";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupTextarea,
} from "@/components/atoms/input-group";
import { downloadBlob, safeFileName } from "@/utils/data/export";
import {
  blobImageType,
  formatBytes,
  looksLikeJson,
  textToValue,
  valueToText,
} from "@/utils/data/format";
import { defaultValueText, isWritableColumn, visibleColumns } from "@/lib/sqlite/introspect";
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

/** Past this many characters a value reads better in a textarea than a one-line input. */
const LONG_TEXT = 60;

const needsTextarea = (text: string) =>
  text.length > LONG_TEXT || text.includes("\n") || looksLikeJson(text);

/** A new row's fields filled from the columns' defaults, where the form can show the value. */
function defaultFields(columns: ColumnInfo[]): Record<string, string> {
  const now = new Date();
  return Object.fromEntries(
    columns.flatMap((c) => {
      const text = isWritableColumn(c) ? defaultValueText(c.defaultValue, now) : null;
      return text === null ? [] : [[c.name, text]];
    }),
  );
}

function initialFields(
  relation: RelationInfo,
  columns: ColumnInfo[],
  target: InspectorTarget,
  defaults: Record<string, string>,
): Record<string, FieldState> {
  if (target.kind !== "new") return {};
  if (!target.initial)
    return Object.fromEntries(
      Object.entries(defaults).map(([name, text]): [string, FieldState] => [
        name,
        { mode: "text", text },
      ]),
    );
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
  // Fixed for this opening, so a filled-in default doesn't count as the user's change.
  const [defaults] = useState(() => (target.kind === "new" ? defaultFields(columns) : {}));
  const [fields, setFields] = useState<Record<string, FieldState>>(() =>
    initialFields(relation, columns, target, defaults),
  );
  // Long, multi-line or JSON values get a textarea; picked once so a field never swaps while typed in.
  const [multiline] = useState(() => {
    const start = target.kind === "edit" ? target.row : target.initial;
    return new Set(
      columns
        .filter((_, i) => {
          const v = start?.[i];
          return typeof v === "string" && needsTextarea(v);
        })
        .map((c) => c.name),
    );
  });
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
  const isDefault = (column: string) => {
    const f = fields[column];
    return f?.mode === "text" && f.text === defaults[column];
  };
  const edited = changed.filter((c) => !isDefault(c.column)).length;

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
        className="flex-1 overflow-y-auto p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <ul className="flex flex-col gap-4">
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
              <li
                key={c.name}
                className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[7.5rem_minmax(0,1fr)]"
              >
                {/* Label on the left, aligned with the first line of the field. */}
                <div className="flex min-w-0 flex-col gap-1 sm:pt-1.5">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {c.pk > 0 && (
                      <KeyRound
                        className="size-3.5 shrink-0 text-butter-ink"
                        aria-label="Primary key"
                      />
                    )}
                    <Label htmlFor={id} className="min-w-0 font-semibold break-all text-ink">
                      {c.name}
                    </Label>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-mono text-[0.6875rem] text-ink-muted lowercase">
                      {c.type || "any"}
                    </span>
                    {c.notNull && <span className="q-table-head">not null</span>}
                    {c.hidden >= 2 && <span className="q-table-head">generated</span>}
                  </div>
                  {fk && shown !== null && onFollowForeignKey && (
                    <Button
                      type="button"
                      variant="link"
                      size="xs"
                      className="h-auto self-start p-0 text-sky-ink"
                      onClick={() => onFollowForeignKey(c.name, shown)}
                    >
                      <CornerDownRight /> {fk.table}
                    </Button>
                  )}
                </div>
                <div className="flex min-w-0 flex-col">
                  {(() => {
                    const set = (next: FieldState) => setFields((s) => ({ ...s, [c.name]: next }));
                    const placeholder =
                      isNew && f.mode === "keep"
                        ? c.defaultValue !== null
                          ? `Default: ${c.defaultValue}`
                          : c.pk > 0
                            ? "Assigned automatically"
                            : c.notNull
                              ? "Required"
                              : "NULL"
                        : isNull
                          ? "NULL"
                          : "";
                    // Small actions sit inside the field, so the form stays one control per row.
                    const actions = writable && (
                      <>
                        {isNew && f.mode !== "keep" && !isDefault(c.name) && (
                          <InputGroupButton onClick={() => set({ mode: "keep" })}>
                            Use default
                          </InputGroupButton>
                        )}
                        {!isBlob && looksLikeJson(text) && (
                          <InputGroupButton
                            onClick={() =>
                              set({ mode: "text", text: JSON.stringify(JSON.parse(text), null, 2) })
                            }
                          >
                            <Braces /> Format JSON
                          </InputGroupButton>
                        )}
                        {!c.notNull && !isNull && (
                          <InputGroupButton
                            aria-label={`Set ${c.name} to NULL`}
                            className="font-mono"
                            onClick={() => set({ mode: "null" })}
                          >
                            NULL
                          </InputGroupButton>
                        )}
                      </>
                    );
                    const valueClass = cn(
                      "font-mono text-[0.8125rem] max-md:text-base",
                      isNull && "placeholder:italic",
                    );
                    if (isBlob)
                      return (
                        <div className="flex flex-col gap-2 rounded-lg border border-input bg-raised p-3">
                          <BlobPreview bytes={shown as Uint8Array} />
                          <div className="flex items-center gap-1">
                            <p className="mr-auto font-mono text-xs text-ink-muted">
                              {formatBytes((shown as Uint8Array).byteLength)}
                            </p>
                            <InputGroupButton
                              onClick={() =>
                                downloadBlob(
                                  shown as BlobPart,
                                  `${safeFileName(`${relation.name}-${c.name}`)}.bin`,
                                  blobImageType(shown as Uint8Array) ?? "application/octet-stream",
                                )
                              }
                            >
                              <Download /> Download
                            </InputGroupButton>
                            {actions}
                          </div>
                        </div>
                      );
                    return multiline.has(c.name) ? (
                      <InputGroup>
                        <InputGroupTextarea
                          id={id}
                          value={text}
                          readOnly={!writable}
                          placeholder={placeholder}
                          onChange={(e) => set({ mode: "text", text: e.target.value })}
                          rows={Math.min(10, Math.max(3, text.split("\n").length))}
                          className={valueClass}
                        />
                        {writable && (
                          <InputGroupAddon align="block-end" className="justify-end gap-1">
                            {actions}
                          </InputGroupAddon>
                        )}
                      </InputGroup>
                    ) : (
                      <InputGroup>
                        <InputGroupInput
                          id={id}
                          value={text}
                          readOnly={!writable}
                          placeholder={placeholder}
                          onChange={(e) => set({ mode: "text", text: e.target.value })}
                          className={valueClass}
                        />
                        {writable && (
                          <InputGroupAddon align="inline-end" className="gap-1">
                            {actions}
                          </InputGroupAddon>
                        )}
                      </InputGroup>
                    );
                  })()}
                </div>
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
            {edited > 0 ? `${edited} changed` : isNew ? "All defaults" : "No changes"}
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
