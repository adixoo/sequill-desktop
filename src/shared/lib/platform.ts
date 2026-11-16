/** Which build is running: the website / installed PWA, or the Tauri desktop app. */
import { isTauri } from "@tauri-apps/api/core";

/** True inside the desktop app (false while prerendering and in browsers). */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && isTauri();
}

/** Where databases are kept, for copy: "in this browser" or "on this computer". */
export function storagePlace(): string {
  return isDesktop() ? "on this computer" : "in this browser";
}
