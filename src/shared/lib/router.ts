/**
 * Client-side routing for the app's pages on the History API. Two pages don't need a
 * routing library: this keeps one page loaded (no reload, the engine stays booted)
 * when moving between the editor and the schema designer.
 */
import { useSyncExternalStore } from "react";

/** The app's pages. */
export const ROUTES = { editor: "/", vis: "/vis" } as const;

const NAVIGATE_EVENT = "sequill:navigate";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(NAVIGATE_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(NAVIGATE_EVENT, onChange);
  };
}

/** The current path, such as "/" or "/vis". */
export function usePathname(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    () => ROUTES.editor,
  );
}

/** Goes to an in-app `href` (a path, optionally with `?query`) without reloading. */
export function navigate(href: string): void {
  if (href === window.location.pathname + window.location.search) return;
  window.history.pushState(null, "", href);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}

/** The editor, optionally opening one table (read once by the editor when it starts). */
export function editorHref(table?: string): string {
  return table ? `${ROUTES.editor}?table=${encodeURIComponent(table)}` : ROUTES.editor;
}

/** Whether a click should navigate inside the app (plain left click, no new tab or window). */
export function isInAppClick(e: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}): boolean {
  return (
    !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
  );
}
