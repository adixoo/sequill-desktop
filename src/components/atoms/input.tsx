import * as React from "react";
import { cn } from "cn";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      // fields are comfortable sm in every density (DESIGN.md, Density)
      data-density="comfortable"
      className={cn(
        "h-(--control-sm) w-full min-w-0 rounded-lg border border-input bg-surface px-(--control-px) py-1 text-base transition-[color,background-color,border-color,box-shadow] duration-150 outline-none file:inline-flex file:h-6 file:border-0 file:bg-surface file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ink focus-visible:ring-3 focus-visible:ring-ink/15 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-raised disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 md:text-(length:--control-fs) dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
