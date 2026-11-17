/**
 * Keeps the Rust workspace on the same version as package.json, which Changesets bumps.
 * Pure text edits on Cargo.toml and Cargo.lock; scripts/sync-cargo-version.ts does the file I/O.
 */

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const VERSION_LINE = /^(version\s*=\s*")[^"]*(")/;

/** Throws unless `version` is a full semver version (what Cargo accepts). */
export function assertSemver(version: string): void {
  if (!SEMVER.test(version)) throw new Error(`"${version}" is not a semver version`);
}

/** Index of the `version = "…"` line inside the `[workspace.package]` table, or -1. */
function workspaceVersionLine(lines: string[]): number {
  const start = lines.findIndex((line) => line.trim() === "[workspace.package]");
  if (start === -1) return -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trimStart().startsWith("[")) return -1;
    if (VERSION_LINE.test(lines[i])) return i;
  }
  return -1;
}

/** The version in Cargo.toml's `[workspace.package]` table. */
export function readWorkspaceVersion(cargoToml: string): string {
  const lines = cargoToml.split("\n");
  const index = workspaceVersionLine(lines);
  if (index === -1) throw new Error("Cargo.toml has no version in [workspace.package]");
  return lines[index].match(/"([^"]*)"/)![1];
}

/** Cargo.toml with `[workspace.package]`'s version set to `version`. */
export function setWorkspaceVersion(cargoToml: string, version: string): string {
  assertSemver(version);
  const lines = cargoToml.split("\n");
  const index = workspaceVersionLine(lines);
  if (index === -1) throw new Error("Cargo.toml has no version in [workspace.package]");
  lines[index] = lines[index].replace(VERSION_LINE, `$1${version}$2`);
  return lines.join("\n");
}

/**
 * Cargo.lock with every workspace crate at `version`. Workspace (path) crates are the
 * `[[package]]` entries without a `source`; registry and git crates are left alone.
 */
export function setLocalLockVersions(cargoLock: string, version: string): string {
  assertSemver(version);
  let changed = 0;
  const blocks = cargoLock.split("\n\n").map((block) => {
    if (!block.startsWith("[[package]]") || /^source\s*=/m.test(block)) return block;
    changed++;
    return block.replace(/^version = "[^"]*"$/m, `version = "${version}"`);
  });
  if (changed === 0) throw new Error("Cargo.lock has no workspace crates");
  return blocks.join("\n\n");
}
