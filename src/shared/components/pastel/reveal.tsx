import { m } from "motion/react";
import type { ReactNode } from "react";
import { dur, ease } from "@/shared/lib/motion";

/** Rises and fades in once when scrolled into view (ease-enter, staggered by `index`). */
export function Reveal({
  children,
  index = 0,
  className,
  as = "div",
}: {
  children: ReactNode;
  index?: number;
  className?: string;
  as?: "div" | "li" | "section";
}) {
  const Tag = m[as];
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-8% 0px" }}
      transition={{ duration: dur.base, ease: ease.enter, delay: index * dur.staggerRow }}
    >
      {children}
    </Tag>
  );
}
