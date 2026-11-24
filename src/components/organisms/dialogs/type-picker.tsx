import { useState, type ComponentType } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/atoms/command";
import {
  Binary,
  Braces,
  Brackets,
  Calendar,
  ChevronDown,
  Clock,
  Fingerprint,
  Hash,
  ListBullet,
  Minus,
  Network,
  SquareSlash,
  TextFont,
  ToggleOn,
  type IconProps,
} from "@/components/atoms/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/atoms/popover";
import { SELECT_TRIGGER_CLASS } from "@/components/atoms/select";
import { DATA_TYPES, matchDataType, type DataType } from "@/constants/data-types";
import { cn } from "@/utils";
import { typeKind, type TypeKind } from "@/utils/data/format";

/** The types a column can take: a database's own types, and the enums its schema defines. */
export interface TypeChoices {
  /** The database's name, for the group heading ("PostgreSQL"). */
  label: string;
  types: readonly DataType[];
  enums: readonly string[];
}

const SQLITE_CHOICES: TypeChoices = { label: "SQLite", types: DATA_TYPES.sqlite, enums: [] };

const KIND_ICONS: Record<TypeKind, ComponentType<IconProps>> = {
  number: Hash,
  text: TextFont,
  boolean: ToggleOn,
  date: Calendar,
  time: Clock,
  json: Braces,
  binary: Binary,
  uuid: Fingerprint,
  network: Network,
  array: Brackets,
  other: SquareSlash,
};

function TypeIcon({ kind }: { kind: TypeKind | "enum" | "none" }) {
  if (kind === "none") return <Minus className="text-ink-muted" />;
  if (kind === "enum") return <ListBullet className="text-lilac-ink" />;
  const Icon = KIND_ICONS[kind];
  return <Icon className="text-ink-muted" />;
}

/** The catalog's kind for a type, or a guess from its name when the catalog doesn't know it. */
const kindOf = (types: readonly DataType[], type: string) =>
  matchDataType(types, type)?.type.kind ?? typeKind(type);

/** A searchable list of column types, with the schema's enums apart; any other type can be typed. */
export function TypePicker({
  value,
  onChange,
  choices = SQLITE_CHOICES,
  id,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange(type: string): void;
  choices?: TypeChoices;
  id?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const isEnum = choices.enums.includes(value);
  const match = value && !isEnum ? matchDataType(choices.types, value) : undefined;
  // A type the catalog doesn't name exactly (another length, a type it doesn't list) stays
  // choosable as its own row; one it names under an alias checks that entry instead.
  const own: DataType | undefined =
    value && !isEnum && !match?.exact
      ? {
          name: value,
          kind: match?.type.kind ?? typeKind(value),
          description: match?.type.description ?? "This column's type",
        }
      : undefined;
  const current = match?.exact ? match.type : own;
  const types = own ? [own, ...choices.types] : choices.types;
  const typed = search.trim();
  const known =
    !!matchDataType(types, typed)?.exact ||
    choices.enums.some((e) => e.toLowerCase() === typed.toLowerCase());

  const pick = (type: string) => {
    onChange(type);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          // A field, so comfortable sm in every density (DESIGN.md, Density).
          data-size="default"
          data-density="comfortable"
          data-placeholder={value ? undefined : ""}
          className={cn(SELECT_TRIGGER_CLASS, className)}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <TypeIcon kind={!value ? "none" : isEnum ? "enum" : (current?.kind ?? "other")} />
            {/* Types read in lowercase, as on the table cards; the stored spelling is unchanged. */}
            <span className={cn("truncate", value && "lowercase")}>{value || "No type"}</span>
          </span>
          <ChevronDown className="pointer-events-none size-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-80 p-0">
        <Command>
          <CommandInput placeholder="Search types…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>No type matches.</CommandEmpty>
            {typed && !known && (
              <CommandGroup heading="Custom">
                <CommandItem value={typed} onSelect={() => pick(typed)}>
                  <TypeIcon kind={kindOf(choices.types, typed)} />
                  <span className="truncate">Use {typed}</span>
                </CommandItem>
              </CommandGroup>
            )}
            {choices.enums.length > 0 && (
              <CommandGroup heading="Enums">
                {choices.enums.map((name) => (
                  <CommandItem
                    key={name}
                    value={name}
                    // Searching "enum" lists every enum.
                    keywords={["enum"]}
                    data-checked={name === value}
                    onSelect={() => pick(name)}
                  >
                    <TypeIcon kind="enum" />
                    <span className="truncate">{name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading={`${choices.label} types`}>
              {types.map((type) => (
                <CommandItem
                  key={type.name}
                  value={type.name}
                  keywords={[...(type.aliases ?? []), type.kind]}
                  data-checked={type === current}
                  onSelect={() => pick(type.name)}
                >
                  <TypeIcon kind={type.kind} />
                  <span className="shrink-0">{type.name}</span>
                  <span className="min-w-0 truncate text-ink-muted">{type.description}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
