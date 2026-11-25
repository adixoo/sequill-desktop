/** Whether the code runs in the Tauri desktop app, or in tests or the browser dev server. */
import { isTauri } from "@tauri-apps/api/core";

/** True inside the desktop app (false while prerendering and in browsers). */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && isTauri();
}
