import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/molecules/theme-toggle";
import { cn } from "@/utils";

interface AppHeaderProps {
  /** The page's name, its h1. */
  title: string;
  /** The link or button to the app's other page. */
  nav: ReactNode;
  /** Shown before the title, such as the button that opens the sidebar on phones. */
  leading?: ReactNode;
  /** Fills the middle of the bar at full height, such as the database switcher (centre it). */
  children?: ReactNode;
  /** Shown at the right end of the bar. */
  actions?: ReactNode;
  className?: string;
}

/** The one bar across the top of every app page: title and the page's own controls, then page switch, theme and actions. */
export function AppHeader({ title, nav, leading, children, actions, className }: AppHeaderProps) {
  return (
    <header
      className={cn(
        "flex h-12 shrink-0 items-stretch gap-2 border-b-2 border-hairline bg-surface px-2",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-1">
        {leading}
        <h1 className="px-1 font-semibold tracking-[-0.015em] text-ink max-md:sr-only">{title}</h1>
      </div>
      <div className="flex min-w-0 flex-1 items-stretch">{children}</div>
      <div className="flex shrink-0 items-center gap-1">
        {nav}
        <ThemeToggle />
        {actions}
      </div>
    </header>
  );
}
