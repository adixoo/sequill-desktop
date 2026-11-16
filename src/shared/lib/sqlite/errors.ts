/** Readable text for an error from SQLite, the worker or anywhere else. */
export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // oo1 prefixes messages with the result-code name; keep the readable part.
  return message.replace(/^SQLITE_[A-Z_]+:\s*(sqlite3 result code \d+:\s*)?/, "");
}
