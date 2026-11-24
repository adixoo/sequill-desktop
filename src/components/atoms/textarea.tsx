import * as React from "react";
import { cn } from "cn";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      data-density="comfortable"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-surface px-2.5 py-2 text-base transition-[color,background-color,border-color,box-shadow] duration-150 outline-none placeholder:text-muted-foreground focus-visible:border-ink focus-visible:ring-3 focus-visible:ring-ink/15 disabled:cursor-not-allowed disabled:bg-raised disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 md:text-(length:--control-fs) dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
