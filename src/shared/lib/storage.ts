/**
 * localStorage for per-viewer conveniences (layouts, history). It can be empty
 * or throw (private mode, blocked storage), so every access is guarded and
 * callers always get a usable fallback.
 */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Storage full or blocked: the app keeps working, only the convenience is lost.
    console.warn(`Could not save ${key}`, error);
  }
}

export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Same as above: nothing to clean up when storage is unavailable.
  }
}
