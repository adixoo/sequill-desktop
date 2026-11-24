/**
 * Light and dark themes. Pastel Noir is dark-first, with a derived light theme. The choice
 * is a class on <html> (`.dark` holds the dark tokens) and is remembered in localStorage;
 * index.html applies it before the first paint.
 */
import type { ThemeName } from "@/types/lib/theme";
import { useSyncExternalStore } from "react";

export const THEMES = ["dark", "light"] as const;
/** Storage key; index.html reads the same one. */
export const THEME_STORAGE_KEY = "theme";

/** A stored value as a theme; anything else (earlier versions stored "system") is the default. */
export function parseTheme(value: string | null | undefined): ThemeName {
  return THEMES.find((t) => t === value) ?? THEMES[0];
}

function readStored(): ThemeName {
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return THEMES[0];
  }
}

let current: ThemeName = typeof window === "undefined" ? THEMES[0] : readStored();
const listeners = new Set<() => void>();

/** Switches the page's classes without animating every color on the way. */
function apply(theme: ThemeName): void {
  const pause = document.createElement("style");
  pause.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.appendChild(pause);
  const root = document.documentElement;
  root.classList.remove(...THEMES);
  root.classList.add(theme);
  root.style.colorScheme = theme;
  void getComputedStyle(document.body).opacity; // flush styles before transitions return
  setTimeout(() => pause.remove(), 1);
}

function update(theme: ThemeName): void {
  if (theme === current) return;
  current = theme;
  apply(theme);
  for (const listener of listeners) listener();
}

export function setTheme(theme: ThemeName): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be blocked; the theme still changes for this visit.
  }
  update(theme);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another window changed it.
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) update(parseTheme(e.newValue));
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The current theme and a way to change it. */
export function useTheme(): { theme: ThemeName; setTheme: (theme: ThemeName) => void } {
  const theme = useSyncExternalStore(
    subscribe,
    () => current,
    () => THEMES[0],
  );
  return { theme, setTheme };
}
