import * as React from "react";
import { m } from "motion/react";
import { cn } from "cn";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { pill } from "@/lib/motion";

const PillGroupContext = React.createContext({ value: "", pillId: "" });

type PillGroupProps = Omit<
  React.ComponentProps<typeof ToggleGroupPrimitive.Root>,
  "type" | "value" | "defaultValue" | "onValueChange"
> & {
  value: string;
  onValueChange(value: string): void;
};

/** Picks one value from a few options; a pill slides to the selected one. */
function PillGroup({ className, value, onValueChange, ...props }: PillGroupProps) {
  const pillId = React.useId();
  return (
    <PillGroupContext.Provider value={{ value, pillId }}>
      <ToggleGroupPrimitive.Root
        data-slot="pill-group"
        type="single"
        value={value}
        // Radix clears the value when the selected item is clicked again; one must stay picked.
        onValueChange={(v) => v && onValueChange(v)}
        className={cn(
          "inline-grid h-(--control) auto-cols-fr grid-flow-col rounded-lg border border-hairline bg-canvas p-[3px] text-ink-muted",
          className,
        )}
        {...props}
      />
    </PillGroupContext.Provider>
  );
}

function PillGroupItem({
  className,
  children,
  value,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  const group = React.useContext(PillGroupContext);
  return (
    <ToggleGroupPrimitive.Item
      data-slot="pill-group-item"
      value={value}
      className={cn(
        "relative inline-flex items-center justify-center rounded-md px-2 text-sm font-medium whitespace-nowrap text-ink-muted transition-colors duration-150 outline-none hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:text-ink [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-(--icon)",
        className,
      )}
      {...props}
    >
      {group.value === value && (
        <m.span
          aria-hidden
          layoutId={group.pillId}
          transition={pill}
          className="absolute inset-0 rounded-md border border-hairline bg-raised shadow-sm"
        />
      )}
      <span className="relative inline-flex items-center gap-1.5">{children}</span>
    </ToggleGroupPrimitive.Item>
  );
}

export { PillGroup, PillGroupItem };
