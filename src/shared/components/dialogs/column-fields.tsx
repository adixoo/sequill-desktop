import type { ReactNode } from "react";
import { Checkbox } from "@/shared/ui/checkbox";
import { Input } from "@/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { FK_ACTIONS, SQLITE_TYPES } from "@/shared/lib/constants";
import type { ColumnDef, DefaultKind } from "@/shared/lib/sqlite/ddl";
import { cn } from "@/shared/lib/utils";

/** Column definition editor shared by the schema dialogs and the visualizer. */
const NONE = "__none__";

const DEFAULT_KINDS: { value: DefaultKind; label: string }[] = [
  { value: "none", label: "No default" },
  { value: "null", label: "NULL" },
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "expression", label: "Expression" },
];

export function Check({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange(v: boolean): void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn("flex items-center gap-1.5 text-xs text-ink-soft", disabled && "opacity-50")}
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onChange(v === true)}
      />
      {label}
    </label>
  );
}

type Tables = { name: string; columns: string[] }[];
type FieldProps = { col: ColumnDef; set(patch: Partial<ColumnDef>): void; compact: boolean };

/** Editor for one column definition. `mode` hides options SQLite can't add later. */
export function ColumnFields({
  col,
  onChange,
  tables,
  mode,
  actions,
  layout = "compact",
}: {
  col: ColumnDef;
  onChange(col: ColumnDef): void;
  tables: Tables;
  mode: "create" | "add";
  /** Extra controls beside the type (compact layout only). */
  actions?: ReactNode;
  /** "compact": wrapping rows, for lists of columns. "form": labeled rows, for one column. */
  layout?: "compact" | "form";
}) {
  const set = (patch: Partial<ColumnDef>) => onChange({ ...col, ...patch });
  const compact = layout === "compact";
  const field = { col, set, compact };
  const name = (
    <Input
      aria-label="Column name"
      placeholder="column_name"
      value={col.name}
      onChange={(e) => set({ name: e.target.value })}
      className={cn(
        "h-8 bg-surface font-mono text-sm max-md:text-base",
        compact ? "basis-full @sm:min-w-36 @sm:flex-1 @sm:basis-0" : "w-full",
      )}
    />
  );

  if (!compact) {
    return (
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3">
        <FieldLabel>Name</FieldLabel>
        {name}
        <FieldLabel>Type</FieldLabel>
        <TypeSelect {...field} />
        <FieldLabel className="self-start pt-px">Rules</FieldLabel>
        <ConstraintChecks {...field} mode={mode} />
        <FieldLabel>Default</FieldLabel>
        <DefaultFields {...field} />
        {tables.length > 0 && (
          <>
            <FieldLabel>References</FieldLabel>
            <ReferenceTable {...field} tables={tables} />
            {col.references && tables.some((t) => t.name === col.references?.table) && (
              <>
                <FieldLabel>Column</FieldLabel>
                <ReferenceColumn {...field} tables={tables} />
                <FieldLabel>On delete</FieldLabel>
                <OnDelete {...field} />
              </>
            )}
          </>
        )}
      </div>
    );
  }

  // Name and type head the card; every other option sits in a labeled row below them. The card
  // sizes itself by its own width (phone drawers, the designer's panel): narrow cards put each
  // label above its field and give the fields the full width.
  return (
    <div className="@container flex flex-col gap-3 rounded-sm bg-raised p-3 ring-2 ring-hairline ring-inset">
      <div className="flex flex-wrap items-center gap-2">
        {name}
        <TypeSelect {...field} />
        {actions}
      </div>
      <CompactRow label="Rules">
        <ConstraintChecks {...field} mode={mode} />
      </CompactRow>
      <CompactRow label="Default">
        <div className="flex flex-wrap items-center gap-2">
          <DefaultFields {...field} />
        </div>
      </CompactRow>
      {tables.length > 0 && (
        <CompactRow label="References">
          <div className="flex flex-wrap items-center gap-2">
            <ReferenceTable {...field} tables={tables} />
            {col.references && tables.some((t) => t.name === col.references?.table) && (
              <>
                <ReferenceColumn {...field} tables={tables} />
                <OnDelete {...field} />
              </>
            )}
          </div>
        </CompactRow>
      )}
    </div>
  );
}

function FieldLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("text-xs text-ink-muted", className)}>{children}</span>;
}

/** A label beside its field in a wide card, above it in a narrow one. */
function CompactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 @sm:grid-cols-[4.5rem_minmax(0,1fr)] @sm:items-center @sm:gap-x-3">
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  );
}

function TypeSelect({ col, set, compact }: FieldProps) {
  return (
    <Select
      value={col.type || NONE}
      onValueChange={(type) => set({ type: type === NONE ? "" : type })}
    >
      <SelectTrigger
        size="sm"
        className={cn(
          "bg-surface font-mono",
          compact ? "min-w-0 flex-1 @sm:w-32 @sm:flex-none" : "w-full",
        )}
        aria-label="Type"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SQLITE_TYPES.map((t) => (
          <SelectItem key={t} value={t} className="font-mono">
            {t}
          </SelectItem>
        ))}
        <SelectItem value={NONE} className="font-mono">
          (none)
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

function ConstraintChecks({ col, set, compact, mode }: FieldProps & { mode: "create" | "add" }) {
  return (
    <div
      className={
        compact
          ? "grid grid-cols-2 gap-x-3 gap-y-2 @sm:flex @sm:flex-wrap @sm:items-center @sm:gap-x-4"
          : "grid grid-cols-2 gap-x-3 gap-y-2"
      }
    >
      {mode === "create" && (
        <Check
          label="Primary key"
          checked={col.primaryKey}
          onChange={(primaryKey) =>
            set({ primaryKey, autoincrement: primaryKey && col.autoincrement })
          }
        />
      )}
      {mode === "create" && (
        <Check
          label="Autoincrement"
          checked={col.autoincrement}
          disabled={!col.primaryKey || col.type !== "INTEGER"}
          onChange={(autoincrement) => set({ autoincrement })}
        />
      )}
      <Check label="Not null" checked={col.notNull} onChange={(notNull) => set({ notNull })} />
      {mode === "create" && (
        <Check
          label="Unique"
          checked={col.unique}
          disabled={col.primaryKey}
          onChange={(unique) => set({ unique })}
        />
      )}
    </div>
  );
}

/** The default's kind, plus a value field when the kind needs one. */
function DefaultFields({ col, set, compact }: FieldProps) {
  const needsValue =
    col.defaultKind === "text" || col.defaultKind === "number" || col.defaultKind === "expression";
  const kind = (
    <Select value={col.defaultKind} onValueChange={(v) => set({ defaultKind: v as DefaultKind })}>
      <SelectTrigger
        size="sm"
        className={cn("bg-surface", compact ? "w-full @sm:w-36" : "w-full")}
        aria-label="Default value kind"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DEFAULT_KINDS.map((d) => (
          <SelectItem key={d.value} value={d.value}>
            {d.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const value = needsValue && (
    <Input
      aria-label="Default value"
      placeholder={col.defaultKind === "expression" ? "datetime('now')" : "value"}
      value={col.defaultValue}
      onChange={(e) => set({ defaultValue: e.target.value })}
      className={cn(
        "h-8 bg-surface font-mono text-sm max-md:text-base",
        compact ? "min-w-32 flex-1" : "w-full",
      )}
    />
  );
  if (compact) {
    return (
      <>
        {kind}
        {value}
      </>
    );
  }
  return (
    <div className={cn("grid gap-2", needsValue && "grid-cols-2")}>
      {kind}
      {value}
    </div>
  );
}

function ReferenceTable({ col, set, compact, tables }: FieldProps & { tables: Tables }) {
  return (
    <Select
      value={col.references?.table ?? NONE}
      onValueChange={(table) =>
        set({
          references:
            table === NONE
              ? null
              : { table, column: "", onDelete: col.references?.onDelete ?? "NO ACTION" },
        })
      }
    >
      <SelectTrigger
        size="sm"
        className={cn("bg-surface", compact ? "w-full @sm:w-36" : "w-full")}
        aria-label="Referenced table"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Nothing</SelectItem>
        {tables.map((t) => (
          <SelectItem key={t.name} value={t.name}>
            {t.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The referenced column (blank means the table's primary key). */
function ReferenceColumn({ col, set, compact, tables }: FieldProps & { tables: Tables }) {
  const references = col.references;
  const refTable = tables.find((t) => t.name === references?.table);
  if (!references || !refTable) return null;
  return (
    <Select
      value={references.column || NONE}
      onValueChange={(column) =>
        set({ references: { ...references, column: column === NONE ? "" : column } })
      }
    >
      <SelectTrigger
        size="sm"
        className={cn("bg-surface", compact ? "w-full @sm:w-32" : "w-full")}
        aria-label="Referenced column"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Primary key</SelectItem>
        {refTable.columns.map((c) => (
          <SelectItem key={c} value={c}>
            {c}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** What happens to this row when the referenced row is deleted. */
function OnDelete({ col, set, compact }: FieldProps) {
  const references = col.references;
  if (!references) return null;
  return (
    <Select
      value={references.onDelete}
      onValueChange={(onDelete) => set({ references: { ...references, onDelete } })}
    >
      <SelectTrigger
        size="sm"
        className={cn("bg-surface", compact ? "w-full @sm:w-44" : "w-full")}
        aria-label="On delete"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {FK_ACTIONS.map((a) => (
          <SelectItem key={a} value={a}>
            {/* The form layout labels the row "On delete" already. */}
            {compact ? `on delete ${a.toLowerCase()}` : a.toLowerCase()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
