import { Filter as FilterIcon, Plus, X } from "@/components/atoms/icons";
import { useState } from "react";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/atoms/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/atoms/toggle-group";
import { FILTER_OPS, type Filter, type FilterMatch, type FilterOp } from "@/lib/sqlite/sql";

interface FilterBuilderProps {
  columns: string[];
  filters: Filter[];
  match: FilterMatch;
  onChange(filters: Filter[], match: FilterMatch): void;
  open?: boolean;
  onOpenChange?(open: boolean): void;
}

const newFilter = (column: string): Filter => ({
  id: Math.random().toString(36).slice(2, 9),
  column,
  op: "contains",
  value: "",
});

/** Popover that edits the table's filters; changes apply on "Apply" so typing doesn't run queries. */
export function FilterBuilder({
  columns,
  filters,
  match,
  onChange,
  open,
  onOpenChange,
}: FilterBuilderProps) {
  const [draft, setDraft] = useState<Filter[]>(filters);
  const [draftMatch, setDraftMatch] = useState<FilterMatch>(match);

  const handleOpen = (next: boolean) => {
    if (next) {
      setDraft(filters.length > 0 ? filters : [newFilter(columns[0])]);
      setDraftMatch(match);
    }
    onOpenChange?.(next);
  };

  const update = (id: string, patch: Partial<Filter>) =>
    setDraft((d) => d.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const apply = () => {
    onChange(
      draft.filter((f) => FILTER_OPS[f.op].arity === 0 || (f.value ?? "").trim() !== ""),
      draftMatch,
    );
    onOpenChange?.(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant={filters.length > 0 ? "secondary" : "ghost"} aria-label="Filters">
          <FilterIcon />
          <span>Filter</span>
          {filters.length > 0 && (
            <span className="q-num rounded-full bg-sky px-1.5 font-mono text-[0.6875rem] text-on-accent">
              {filters.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(36rem,calc(100vw-2rem))] p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
          className="flex flex-col gap-3"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="q-label text-ink-muted">Filters</p>
            {draft.length > 1 && (
              <ToggleGroup
                type="single"
                size="sm"
                variant="outline"
                value={draftMatch}
                onValueChange={(v) => v && setDraftMatch(v as FilterMatch)}
                aria-label="Combine filters with"
              >
                <ToggleGroupItem value="and">All match</ToggleGroupItem>
                <ToggleGroupItem value="or">Any match</ToggleGroupItem>
              </ToggleGroup>
            )}
          </div>
          <ul className="flex flex-col gap-2">
            {draft.map((f) => {
              const arity = FILTER_OPS[f.op].arity;
              return (
                <li
                  key={f.id}
                  className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[9rem_9rem_1fr_auto]"
                >
                  <Select value={f.column} onValueChange={(column) => update(f.id, { column })}>
                    <SelectTrigger className="w-full" aria-label="Column">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {columns.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="sm:order-last"
                    aria-label="Remove filter"
                    onClick={() => setDraft((d) => d.filter((x) => x.id !== f.id))}
                  >
                    <X />
                  </Button>
                  <Select value={f.op} onValueChange={(op) => update(f.id, { op: op as FilterOp })}>
                    <SelectTrigger className="w-full" aria-label="Condition">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(FILTER_OPS) as FilterOp[]).map((op) => (
                        <SelectItem key={op} value={op}>
                          {FILTER_OPS[op].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2 max-sm:col-span-2">
                    {arity >= 1 && (
                      <Input
                        value={f.value ?? ""}
                        onChange={(e) => update(f.id, { value: e.target.value })}
                        placeholder={f.op === "in" ? "a, b, c" : "Value"}
                        aria-label="Value"
                      />
                    )}
                    {arity === 2 && (
                      <Input
                        value={f.value2 ?? ""}
                        onChange={(e) => update(f.id, { value2: e.target.value })}
                        placeholder="and"
                        aria-label="Second value"
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDraft((d) => [...d, newFilter(columns[0])])}
            >
              <Plus /> Add filter
            </Button>
            <div className="flex gap-2">
              {filters.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    onChange([], match);
                    onOpenChange?.(false);
                  }}
                >
                  Clear all
                </Button>
              )}
              <Button type="submit">Apply</Button>
            </div>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
