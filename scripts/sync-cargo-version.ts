/**
 * Copies package.json's version (bumped by `changeset version`) into Cargo.toml's
 * [workspace.package] and the workspace crates in Cargo.lock. The desktop app reads
 * its version from package.json, so all three stay in step.
 * Run: bun scripts/sync-cargo-version.ts          (writes the files)
 *      bun scripts/sync-cargo-version.ts --check  (exits 1 if they differ; used in CI)
 */
import { join } from "node:path";
import { setLocalLockVersions, setWorkspaceVersion } from "./cargo-version";

const root = join(import.meta.dir, "..");
const check = process.argv.includes("--check");

const { version } = (await Bun.file(join(root, "package.json")).json()) as { version: string };
const files = [
  { name: "Cargo.toml", update: (text: string) => setWorkspaceVersion(text, version) },
  { name: "Cargo.lock", update: (text: string) => setLocalLockVersions(text, version) },
];

const stale: string[] = [];
for (const { name, update } of files) {
  const path = join(root, name);
  const before = await Bun.file(path).text();
  const after = update(before);
  if (after === before) continue;
  stale.push(name);
  if (!check) await Bun.write(path, after);
}

if (check && stale.length > 0) {
  console.error(
    `${stale.join(" and ")} not at version ${version}; run bun scripts/sync-cargo-version.ts`,
  );
  process.exit(1);
}
console.log(
  stale.length === 0 || check
    ? `Rust workspace is at version ${version}`
    : `Set ${stale.join(" and ")} to version ${version}`,
);
