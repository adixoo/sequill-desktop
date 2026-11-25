import * as React from "react";
import { m } from "motion/react";
import { cn } from "cn";
import { Tabs as TabsPrimitive } from "radix-ui";
import { pill } from "@/lib/motion";

/** The selected value and the pill's shared layout id, so the pill slides between triggers. */
const TabsContext = React.createContext<{ value: string | undefined; pillId: string }>({
  value: undefined,
  pillId: "",
});

function Tabs({
  className,
  orientation = "horizontal",
  value: valueProp,
  defaultValue,
  onValueChange,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const value = valueProp ?? uncontrolled;
  const pillId = React.useId();
  return (
    <TabsContext.Provider value={{ value, pillId }}>
      <TabsPrimitive.Root
        data-slot="tabs"
        data-orientation={orientation}
        orientation={orientation}
        value={value}
        onValueChange={(v) => {
          setUncontrolled(v);
          onValueChange?.(v);
        }}
        className={cn("group/tabs flex gap-2 data-horizontal:flex-col", className)}
        {...props}
      />
    </TabsContext.Provider>
  );
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex w-fit items-center justify-center rounded-lg border border-hairline bg-canvas p-[3px] text-ink-muted group-data-horizontal/tabs:h-(--control) group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  children,
  value,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const tabs = React.useContext(TabsContext);
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      value={value}
      className={cn(
        "relative inline-flex h-full flex-1 items-center justify-center rounded-md px-2 text-sm font-medium whitespace-nowrap text-ink-muted transition-colors duration-150 outline-none group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-active:text-ink [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-(--icon)",
        className,
      )}
      {...props}
    >
      {tabs.value === value && (
        <m.span
          aria-hidden
          layoutId={tabs.pillId}
          transition={pill}
          className="absolute inset-0 rounded-md border border-hairline bg-raised shadow-sm"
        />
      )}
      <span className="relative inline-flex items-center gap-1.5">{children}</span>
    </TabsPrimitive.Trigger>
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
