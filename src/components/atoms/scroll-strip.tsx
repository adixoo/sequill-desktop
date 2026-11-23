import * as React from "react";
import { cn } from "cn";
import { ChevronLeft, ChevronRight } from "@/components/atoms/icons";

import { Button } from "@/components/atoms/button";
import { useHorizontalScroll } from "@/hooks/use-horizontal-scroll";

/** The bar colour each arrow's fade blends into. */
const FADE = { raised: "from-raised", surface: "from-surface" } as const;

/**
 * A single row that scrolls sideways when its items don't fit: no scrollbar, but the wheel,
 * a mouse drag and touch all slide it, and ‹ › arrows appear while items are hidden.
 */
export function ScrollStrip({
  fade,
  scrollLabel,
  scrollRef,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  /** The background behind the strip, so the arrows fade into it. */
  fade: keyof typeof FADE;
  /** What the arrows scroll, for their names: "tabs" gives "Scroll tabs left". */
  scrollLabel: string;
  /** For callers that also need the scrolling element (to bring an item into view). */
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const ownRef = React.useRef<HTMLDivElement>(null);
  const ref = scrollRef ?? ownRef;
  const { canScrollStart, canScrollEnd, scrollPage } = useHorizontalScroll(ref);
  return (
    <div className="relative flex min-w-0 flex-1">
      {canScrollStart && (
        <ScrollArrow side="start" fade={fade} label={scrollLabel} onClick={() => scrollPage(-1)}>
          <ChevronLeft />
        </ScrollArrow>
      )}
      {canScrollEnd && (
        <ScrollArrow side="end" fade={fade} label={scrollLabel} onClick={() => scrollPage(1)}>
          <ChevronRight />
        </ScrollArrow>
      )}
      <div
        ref={ref}
        className={cn(
          "no-scrollbar flex min-w-0 flex-1 cursor-default overflow-x-auto overflow-y-hidden overscroll-x-contain",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Pages the strip one way. Kept out of the Tab order: focusing an item already scrolls it
 * into view.
 */
function ScrollArrow({
  side,
  fade,
  label,
  onClick,
  children,
}: {
  side: "start" | "end";
  fade: keyof typeof FADE;
  label: string;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-y-0 z-10 flex w-12 items-center from-55% to-transparent",
        FADE[fade],
        side === "start"
          ? "left-0 justify-start bg-linear-to-r pl-0.5"
          : "right-0 justify-end bg-linear-to-l pr-0.5",
      )}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        tabIndex={-1}
        aria-label={`Scroll ${label} ${side === "start" ? "left" : "right"}`}
        className="pointer-events-auto text-ink-muted"
        onClick={onClick}
      >
        {children}
      </Button>
    </div>
  );
}
