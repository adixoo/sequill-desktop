/**
 * Copies the SQLite WASM build into public/sqlite so the worker can load it at runtime.
 * Bundling it breaks: the package spawns its own workers from dynamic URLs.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// Only the module and the wasm: we use the opfs-sahpool VFS, which needs neither
// the Worker1 API script nor the "opfs" VFS async proxy.
const FILES = ["index.mjs", "sqlite3.wasm"];

const pkgDir = dirname(require.resolve("@sqlite.org/sqlite-wasm/package.json"));
const source = join(pkgDir, "dist");
const target = join(import.meta.dir, "..", "public", "sqlite");

mkdirSync(target, { recursive: true });
for (const file of FILES) copyFileSync(join(source, file), join(target, file));
console.log(`Copied SQLite WASM (${FILES.length} files) to public/sqlite`);
