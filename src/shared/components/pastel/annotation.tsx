import { m } from "motion/react";
import type { ReactNode } from "react";
import { dur, ease } from "@/shared/lib/motion";
import { cn } from "@/shared/lib/utils";
import { MARKS, type MarkName } from "./marks";

interface MarkProps {
  name: MarkName;
  className?: string;
  /** Seconds before the pen starts. */
  delay?: number;
  flip?: boolean;
  strokeWidth?: number;
}

/** A single hand-drawn stroke that draws on when it scrolls into view. */
export function Mark({ name, className, delay = 0, flip = false, strokeWidth = 6 }: MarkProps) {
  const mark = MARKS[name];
  return (
    <svg
      viewBox={mark.viewBox}
      aria-hidden
      className={cn("pn-stroke overflow-visible", flip && "-scale-x-100", className)}
      style={{ strokeWidth }}
    >
      {mark.paths.map((d, i) => (
        <m.path
          key={d}
          d={d}
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, margin: "-10% 0px" }}
          transition={{
            duration: i === 0 ? dur.draw : dur.quick,
            ease: ease.draw,
            delay: delay + (i === 0 ? 0 : dur.draw),
          }}
        />
      ))}
    </svg>
  );
}

interface NoteProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  size?: "sm" | "md" | "lg";
}

/** Caveat note that writes itself left to right. Only ever used beside a Mark. */
export function Note({ children, className, delay = 0, size = "md" }: NoteProps) {
  return (
    <m.span
      className={cn(
        "pn-hand inline-block leading-none lowercase",
        size === "sm" && "text-xl",
        size === "md" && "text-2xl md:text-3xl",
        size === "lg" && "text-3xl md:text-4xl",
        className,
      )}
      // Handwriting overhangs its box (slanted ends, descenders), so the revealed area
      // reaches past it on the right, top and bottom instead of clipping those strokes.
      initial={{ clipPath: "inset(-40% 100% -40% 0)" }}
      whileInView={{ clipPath: "inset(-40% -10% -40% 0)" }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: dur.write, ease: "linear", delay }}
    >
      {children}
    </m.span>
  );
}
