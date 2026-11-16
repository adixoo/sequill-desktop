import { Ban, Check, Pipette } from "@/shared/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { cn } from "@/shared/lib/utils";
import {
  colorFill,
  colorInk,
  colorLabel,
  PRESET_COLORS,
  type TableColor,
} from "@/features/vis/lib/colors";

interface ColorSwatchesProps {
  value: TableColor | null;
  onChange(color: TableColor | null): void;
  /** Accessible name of the group, e.g. "Color for orders". */
  label: string;
}

const swatch =
  "relative flex size-7 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

/** Preset pastels, "none" and a custom color input, as one radio group. */
export function ColorSwatches({ value, onChange, label }: ColorSwatchesProps) {
  const custom = value !== null && value.startsWith("#") ? value : null;
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        aria-label="No color"
        title="No color"
        onClick={() => onChange(null)}
        className={cn(
          swatch,
          "text-ink-muted ring-2 ring-hairline ring-inset",
          value === null && "ring-ink-soft",
        )}
      >
        <Ban className="size-3.5" aria-hidden />
      </button>
      {PRESET_COLORS.map((c) => {
        const selected = value === c.value;
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={c.label}
            title={c.label}
            onClick={() => onChange(c.value)}
            className={cn(swatch, selected && "ring-2 ring-ink ring-offset-2 ring-offset-surface")}
            style={{ background: colorFill(c.value) }}
          >
            {selected && <Check className="size-3.5 text-on-accent" strokeWidth={3} aria-hidden />}
          </button>
        );
      })}
      <label
        title="Custom color"
        className={cn(
          swatch,
          "cursor-pointer focus-within:ring-2 focus-within:ring-ring",
          custom
            ? "ring-2 ring-ink ring-offset-2 ring-offset-surface"
            : "ring-2 ring-hairline ring-inset",
        )}
        style={
          custom
            ? { background: custom }
            : {
                background:
                  "conic-gradient(var(--peach), var(--butter), var(--mint), var(--sky), var(--lilac), var(--rose), var(--peach))",
              }
        }
      >
        <input
          type="color"
          role="radio"
          aria-checked={!!custom}
          aria-label="Custom color"
          value={custom ?? "#a6e3c4"}
          onChange={(e) => onChange(e.target.value.toLowerCase() as TableColor)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
        {custom ? (
          <span
            aria-hidden
            className="flex size-4 items-center justify-center rounded-full bg-surface"
          >
            <Check className="size-3 text-ink" strokeWidth={3} />
          </span>
        ) : (
          <Pipette className="size-3.5 text-on-accent" aria-hidden />
        )}
      </label>
    </div>
  );
}

/** Small dot showing a table's color; opens the swatches in a popover. */
export function ColorDot({
  value,
  onChange,
  tableName,
}: {
  value: TableColor | null;
  onChange(color: TableColor | null): void;
  tableName: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Color for ${tableName}: ${value ? colorLabel(value) : "none"}`}
          title="Change color"
          className="flex size-6 shrink-0 items-center justify-center rounded-xs outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            aria-hidden
            className={cn("size-2.5 rounded-full", !value && "ring-2 ring-strong ring-inset")}
            style={value ? { background: colorInk(value) } : undefined}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <p className="pn-eyebrow mb-2.5 text-ink-muted">{tableName}</p>
        <ColorSwatches value={value} onChange={onChange} label={`Color for ${tableName}`} />
      </PopoverContent>
    </Popover>
  );
}
