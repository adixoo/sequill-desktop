import { useId, type ReactNode } from "react";
import { Checkbox } from "@/components/atoms/checkbox";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import { FK_ACTIONS } from "@/constants";
import type { ColumnDef, DefaultKind } from "@/types/lib/sqlite/ddl";
import { cn } from "@/utils";
import { TypePicker } from "./type-picker";
import type { TypeChoices } from "@/types/components/organisms/dialogs/type-picker";

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
type FieldProps = {
  col: ColumnDef;
  set(patch: Partial<ColumnDef>): void;
  compact: boolean;
  /** Prefix for the control ids the row labels point at. */
  id: string;
};

/** Editor for one column definition. `mode` hides options SQLite can't add later. */
export function ColumnFields({
  col,
  onChange,
  tables,
  mode,
  actions,
  layout = "compact",
  types,
}: {
  col: ColumnDef;
  onChange(col: ColumnDef): void;
  tables: Tables;
  mode: "create" | "add";
  /** Extra controls beside the type (compact layout only). */
  actions?: ReactNode;
  /** "compact": wrapping rows, for lists of columns. "form": labeled rows, for one column. */
  layout?: "compact" | "form";
  /** Types to choose from for another database's schema; SQLite's own types when omitted. */
  types?: TypeChoices;
}) {
  const set = (patch: Partial<ColumnDef>) => onChange({ ...col, ...patch });
  const compact = layout === "compact";
  const id = useId();
  const field = { col, set, compact, id };
  const name = (
    <Input
      id={`${id}-name`}
      aria-label={compact ? "Column name" : undefined}
      placeholder="column_name"
      value={col.name}
      onChange={(e) => set({ name: e.target.value })}
      className={compact ? "basis-full @sm:min-w-36 @sm:flex-1 @sm:basis-0" : "w-full"}
    />
  );

  if (!compact) {
    return (
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3">
        <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
        {name}
        <FieldLabel htmlFor={`${id}-type`}>Type</FieldLabel>
        <TypePicker
          id={`${id}-type`}
          value={col.type}
          onChange={(type) => set({ type })}
          choices={types}
          aria-label={compact ? "Type" : undefined}
          className={compact ? "min-w-0 flex-1 @sm:w-36 @sm:flex-none" : "w-full"}
        />
        <RulesLabel id={id} className="self-start pt-px" />
        <ConstraintChecks {...field} mode={mode} />
        <FieldLabel htmlFor={`${id}-default`}>Default</FieldLabel>
        <DefaultFields {...field} />
        {tables.length > 0 && (
          <>
            <FieldLabel htmlFor={`${id}-references`}>References</FieldLabel>
            <ReferenceTable {...field} tables={tables} />
            {col.references && tables.some((t) => t.name === col.references?.table) && (
              <>
                <FieldLabel htmlFor={`${id}-ref-column`}>Column</FieldLabel>
                <ReferenceColumn {...field} tables={tables} />
                <FieldLabel htmlFor={`${id}-on-delete`}>On delete</FieldLabel>
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
        <TypePicker
          id={`${id}-type`}
          value={col.type}
          onChange={(type) => set({ type })}
          choices={types}
          aria-label={compact ? "Type" : undefined}
          className={compact ? "min-w-0 flex-1 @sm:w-36 @sm:flex-none" : "w-full"}
        />
        {actions}
      </div>
      <CompactRow label={<RulesLabel id={id} />}>
        <ConstraintChecks {...field} mode={mode} />
      </CompactRow>
      <CompactRow label={<FieldLabel htmlFor={`${id}-default`}>Default</FieldLabel>}>
        <div className="flex flex-wrap items-center gap-2">
          <DefaultFields {...field} />
        </div>
      </CompactRow>
      {tables.length > 0 && (
        <CompactRow label={<FieldLabel htmlFor={`${id}-references`}>References</FieldLabel>}>
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

const LABEL = "text-xs text-ink-muted";

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <Label htmlFor={htmlFor} className={LABEL}>
      {children}
    </Label>
  );
}

/** Names the group of rule checkboxes, which has no single control for a label to point at. */
function RulesLabel({ id, className }: { id: string; className?: string }) {
  return (
    <span id={`${id}-rules`} className={cn(LABEL, "font-medium", className)}>
      Rules
    </span>
  );
}

/** A label beside its field in a wide card, above it in a narrow one. */
function CompactRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 @sm:grid-cols-[4.5rem_minmax(0,1fr)] @sm:items-center @sm:gap-x-3">
      {label}
      {children}
    </div>
  );
}

function ConstraintChecks({
  col,
  set,
  compact,
  id,
  mode,
}: FieldProps & { mode: "create" | "add" }) {
  return (
    <div
      role="group"
      aria-labelledby={`${id}-rules`}
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
function DefaultFields({ col, set, compact, id }: FieldProps) {
  const needsValue =
    col.defaultKind === "text" || col.defaultKind === "number" || col.defaultKind === "expression";
  const kind = (
    <Select value={col.defaultKind} onValueChange={(v) => set({ defaultKind: v as DefaultKind })}>
      <SelectTrigger id={`${id}-default`} className={compact ? "w-full @sm:w-36" : "w-full"}>
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
      className={compact ? "min-w-32 flex-1" : "w-full"}
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

function ReferenceTable({ col, set, compact, id, tables }: FieldProps & { tables: Tables }) {
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
      <SelectTrigger id={`${id}-references`} className={compact ? "w-full @sm:w-36" : "w-full"}>
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
function ReferenceColumn({ col, set, compact, id, tables }: FieldProps & { tables: Tables }) {
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
        id={`${id}-ref-column`}
        className={compact ? "w-full @sm:w-32" : "w-full"}
        aria-label={compact ? "Referenced column" : undefined}
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
function OnDelete({ col, set, compact, id }: FieldProps) {
  const references = col.references;
  if (!references) return null;
  return (
    <Select
      value={references.onDelete}
      onValueChange={(onDelete) => set({ references: { ...references, onDelete } })}
    >
      <SelectTrigger
        id={`${id}-on-delete`}
        className={compact ? "w-full @sm:w-44" : "w-full"}
        aria-label={compact ? "On delete" : undefined}
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
