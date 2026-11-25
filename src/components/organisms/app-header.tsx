import type { ReactNode } from "react";
import { Button } from "@/components/atoms/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/atoms/dropdown-menu";
import { ChevronsUpDown, Network, Table } from "@/components/atoms/icons";
import { SettingsMenu } from "@/components/organisms/settings-menu";
import { APP_NAME } from "@/constants";
import { navigate, ROUTES } from "@/lib/router";
import { cn } from "@/utils";
import type { AppPage } from "@/types/components/organisms/app-header";

const PAGES = [
  { value: "editor", label: "Editor", icon: Table, href: ROUTES.editor },
  { value: "schema", label: "Schema", icon: Network, href: ROUTES.vis },
] as const;

interface AppHeaderProps {
  /** The page shown, picked in the "Sequill / page" switcher. */
  page: AppPage;
  /** Goes to another page; by default straight there. The schema page asks first if a design is unsaved. */
  onPageChange?(page: AppPage): void;
  /** Shown before the title, such as the button that opens the sidebar on phones. */
  leading?: ReactNode;
  /** Fills the middle of the bar at full height, such as the database switcher (centre it). */
  children?: ReactNode;
  /** Shown at the right end of the bar, before the settings. */
  actions?: ReactNode;
  className?: string;
}

/** The one bar across the top of every app page: "Sequill / page" switcher, the page's own controls, actions and settings. */
export function AppHeader({
  page,
  onPageChange = (p) => navigate(PAGES.find((x) => x.value === p)!.href),
  leading,
  children,
  actions,
  className,
}: AppHeaderProps) {
  const current = PAGES.find((p) => p.value === page)!;
  return (
    <header
      className={cn(
        "flex h-12 shrink-0 items-stretch gap-2 border-b-2 border-hairline bg-surface px-2",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-1">
        {leading}
        <img src="/logo.svg" alt={APP_NAME} className="mx-1 size-6 max-md:sr-only" />
        <span aria-hidden className="text-ink-muted max-md:hidden">
          /
        </span>
        <h1 className="sr-only">{current.label}</h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-1.5" aria-label={`Page: ${current.label}`}>
              <current.icon />
              <span className="font-semibold tracking-[-0.015em] text-ink">{current.label}</span>
              <ChevronsUpDown className="text-ink-muted" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuRadioGroup
              value={page}
              onValueChange={(v) => v !== page && onPageChange(v as AppPage)}
            >
              {PAGES.map((p) => (
                <DropdownMenuRadioItem key={p.value} value={p.value}>
                  <p.icon /> {p.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex min-w-0 flex-1 items-stretch">{children}</div>
      <div className="flex shrink-0 items-center gap-1">
        {actions}
        <SettingsMenu />
      </div>
    </header>
  );
}
