import { ChevronRight } from "@/components/atoms/icons";
import { Fragment } from "react";
import { cn } from "@/utils";
import { ACCENT_CLASSES, STEP_ACCENTS } from "./accent";

interface Step {
  title: string;
  body: string;
}

/** 2–4 numbered steps joined by chevron connectors; stacks vertically on small screens. */
export function StepFlow({ steps, className }: { steps: Step[]; className?: string }) {
  return (
    <ol className={cn("flex flex-col items-stretch gap-3 lg:flex-row lg:items-center", className)}>
      {steps.map((step, i) => (
        <Fragment key={step.title}>
          {i > 0 && (
            <li aria-hidden className="flex justify-center text-strong">
              <ChevronRight className="size-6 rotate-90 lg:rotate-0" strokeWidth={2.5} />
            </li>
          )}
          <li className="flex-1 rounded-md bg-surface p-6 ring-2 ring-hairline ring-inset">
            <span
              className={cn(
                "inline-flex size-9 items-center justify-center rounded-full font-mono text-sm font-medium text-on-accent",
                ACCENT_CLASSES[STEP_ACCENTS[i % STEP_ACCENTS.length]].solid,
              )}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-4 text-xl font-semibold tracking-[-0.015em] text-ink">
              {step.title}
            </h3>
            <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-soft">{step.body}</p>
          </li>
        </Fragment>
      ))}
    </ol>
  );
}
