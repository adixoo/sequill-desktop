import { m } from "motion/react";
import type { ReactNode } from "react";
import { dur, ease } from "@/lib/motion";
import { cn } from "@/utils";
import { MARKS } from "./marks";
import type { MarkName } from "@/types/components/molecules/pastel/marks";

interface MarkProps {
  name: MarkName;
  className?: string;
  /** Seconds before the pen starts. */
  delay?: number;
}

/** A single hand-drawn stroke that draws on when it scrolls into view. */
export function Mark({ name, className, delay = 0 }: MarkProps) {
  const mark = MARKS[name];
  return (
    <svg
      viewBox={mark.viewBox}
      aria-hidden
      className={cn("pn-stroke overflow-visible", className)}
      style={{ strokeWidth: 6 }}
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
}

/** Caveat note that writes itself left to right. Only ever used beside a Mark. */
export function Note({ children, className, delay = 0 }: NoteProps) {
  return (
    <m.span
      className={cn("pn-hand inline-block text-xl leading-none lowercase", className)}
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
