#!/usr/bin/env node
// atomic-design audit: checks UI files against atomic design rules.
// Usage (run inside a project that has atomic.config.json):
//   audit.mjs hook                 PostToolUse hook: reads the hook JSON on stdin
//   audit.mjs check [--all] [files] audit files (default: whole project); --all includes baselined
//   audit.mjs list                 components by level, with usage counts
//   audit.mjs baseline             accept today's violations so only new ones are reported
import fs from 'node:fs';
import path from 'node:path';
import { PRESETS } from './presets.mjs';

const CONFIG = 'atomic.config.json';
const BASELINE = '.atomic/baseline.json';
const LEVELS = ['atoms', 'molecules', 'organisms', 'templates', 'pages'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt',
  '.svelte-kit', '.output', '.expo', '.turbo', '.vercel', 'storybook-static', '.dart_tool', '.gradle', 'Pods',
  'DerivedData', '.atomic']);

const isInside = (dir, file) => {
  const r = path.relative(dir, file);
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
};
const lineAt = (text, index) => text.slice(0, index).split('\n').length;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Blank out comments, keeping offsets and line numbers.
// shortcut: comment markers inside strings count as comments (can hide a violation, never invents one); use a tokenizer if that bites.
const COMMENTS = /\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|(?<![:'"\w])\/\/.*/g;
const stripComments = (text) => text.replace(COMMENTS, (m) => m.replace(/[^\n]/g, ' '));

function globToRegExp(glob) {
  const src = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '\0')
    .replace(/\*\*/g, '\x01')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\0/g, '(?:.*/)?')
    .replace(/\x01/g, '.*');
  return new RegExp(`^${src}$`);
}

function findRoot(start) {
  for (let dir = path.resolve(start); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, CONFIG))) return dir;
    if (path.dirname(dir) === dir) return null;
  }
}

function loadProject(root) {
  const config = JSON.parse(fs.readFileSync(path.join(root, CONFIG), 'utf8'));
  const preset = PRESETS[config.preset];
  if (!preset) throw new Error(`${CONFIG}: unknown preset "${config.preset}" (use one of: ${Object.keys(PRESETS).join(', ')})`);
  if (typeof config.levels !== 'object' || !config.levels) throw new Error(`${CONFIG}: "levels" must map level names to folders`);
  const unknown = Object.keys(config.levels).filter((l) => !LEVELS.includes(l));
  if (unknown.length) throw new Error(`${CONFIG}: unknown level(s) ${unknown.join(', ')} (use ${LEVELS.join(', ')})`);
  return {
    root,
    preset,
    levels: LEVELS.filter((l) => typeof config.levels[l] === 'string')
      .map((name) => ({ name, rank: LEVELS.indexOf(name), dir: path.resolve(root, config.levels[name]) })),
    tokens: (config.tokens ?? []).map((t) => path.resolve(root, t)),
    ignore: (config.ignore ?? []).map(globToRegExp),
  };
}

const relPath = (project, file) => path.relative(project.root, file).split(path.sep).join('/');

const isAudited = (project, file) => {
  const rel = relPath(project, file);
  return project.preset.extensions.some((e) => file.endsWith(e)) &&
    !rel.split('/').some((s) => SKIP_DIRS.has(s)) &&
    !project.ignore.some((re) => re.test(rel));
};

function walk(dir, project) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return SKIP_DIRS.has(e.name) ? [] : walk(full, project);
    return isAudited(project, full) ? [full] : [];
  });
}

// Deepest level folder that holds the path (levels may be nested, e.g. pages inside src/).
function levelOf(project, file) {
  return project.levels.filter((l) => isInside(l.dir, file))
    .sort((a, b) => b.dir.length - a.dir.length)[0] ?? null;
}

const keyOf = (name) => name.replace(/[-_]/g, '').toLowerCase();

function componentName(file, suffixes) {
  const base = path.basename(file);
  if (!suffixes.some((s) => base.endsWith(s))) return null;
  const name = base.split('.')[0];
  return name === 'index' ? path.basename(path.dirname(file)) : name;
}

// A component's files share a root: its own folder (Button/Button.tsx) or its name next to siblings.
function rootOf(file, name) {
  const dir = path.dirname(file);
  return keyOf(path.basename(dir)) === keyOf(name) ? dir : path.join(dir, keyOf(name));
}

function listComponents(project) {
  const byRoot = new Map();
  for (const level of project.levels) {
    for (const file of walk(level.dir, project)) {
      if (levelOf(project, file) !== level) continue;
      const name = componentName(file, project.preset.componentSuffixes);
      if (!name) continue;
      const root = rootOf(file, name);
      const c = byRoot.get(root) ?? { name, key: keyOf(name), level: level.name, root, files: [] };
      c.files.push(file);
      byRoot.set(root, c);
    }
  }
  const comps = [...byRoot.values()];
  for (const c of comps) c.file = c.files.sort((a, b) => path.basename(a).length - path.basename(b).length)[0];
  return comps.sort((a, b) => a.name.length - b.name.length);
}

function importLevel(project, file, spec) {
  const { dotImports, bareRelative } = project.preset;
  if (spec.startsWith('.') || (bareRelative && !spec.includes(':'))) {
    return levelOf(project, path.resolve(path.dirname(file), spec));
  }
  // shortcut: non-relative imports are matched by level folder name, so an alias or package
  // segment with the same name is misread; add an alias map to the config if that happens.
  const segs = (dotImports ? spec.replace(/\./g, '/') : spec).split(/[/:]/);
  let best = null;
  for (const l of project.levels) {
    const i = segs.lastIndexOf(path.basename(l.dir));
    if (i >= 0 && (!best || i > best.i)) best = { i, l };
  }
  return best?.l ?? null;
}

function auditFile(project, file, components) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const code = stripComments(text);
  const level = levelOf(project, file);
  const out = [];
  const add = (line, rule, message, key = lines[line - 1].trim()) =>
    out.push({ file: relPath(project, file), line, rule, message, key });

  if (level && project.preset.imports) {
    for (const m of code.matchAll(project.preset.imports)) {
      const target = importLevel(project, file, m[1]);
      if (target && target.rank > level.rank) {
        add(lineAt(code, code.indexOf(m[1], m.index)), 'import-direction',
          `${level.name} must not import ${target.name} ("${m[1]}"): move the shared part down a level or this component up`);
      }
    }
  }

  const isToken = project.tokens.some((t) => isInside(t, file));
  const atoms = components.filter((c) => c.level === 'atoms');
  code.split(/\r?\n/).forEach((line, i) => {
    if (!isToken) {
      const hit = project.preset.hardcoded.map((re) => line.match(re)).find(Boolean);
      if (hit) add(i + 1, 'hardcoded-value', `"${hit[0]}" is hard-coded: use a design token`);
    }
    if (level?.name === 'atoms') return; // atoms are where platform widgets get wrapped
    for (const n of project.preset.natives) {
      const m = line.match(n.pattern);
      const atom = m && atoms.find((a) => a.name !== m[1] && n.atom.some((s) => a.key.endsWith(s)));
      if (atom) add(i + 1, 'missed-reuse', `use the ${atom.name} atom (${relPath(project, atom.file)}) instead of ${m[1]}`);
    }
  });

  // Pages are named by their route (page.tsx, +page.svelte, [id].vue), so they never count as duplicates.
  const name = level && level.name !== 'pages' && componentName(file, project.preset.componentSuffixes);
  if (name) {
    const root = rootOf(file, name);
    const others = components.filter((c) => c.level !== 'pages' && c.key === keyOf(name) && c.root !== root);
    if (others.length) {
      add(1, 'duplicate', `${name} already exists (${others.map((o) => `${o.level}: ${relPath(project, o.file)}`).join(', ')}): reuse or extend it`, name);
    }
  }
  return out;
}

// Key -> how many times it was baselined; a key is listed once per copy of the violation.
function loadBaseline(root) {
  try {
    const counts = new Map();
    for (const k of JSON.parse(fs.readFileSync(path.join(root, BASELINE), 'utf8'))) counts.set(k, (counts.get(k) ?? 0) + 1);
    return counts;
  } catch (e) {
    if (e.code === 'ENOENT') return new Map();
    throw new Error(`${BASELINE} is unreadable (${e.message}); delete it and run baseline again`);
  }
}

const baselineKey = (v) => `${v.file}::${v.rule}::${v.key}`;

// Each baselined copy hides one violation; copies beyond the baselined count are new.
const notBaselined = (found, baseline) => found.filter((v) => {
  const k = baselineKey(v);
  const n = baseline.get(k) ?? 0;
  baseline.set(k, n - 1);
  return n <= 0;
});
const format = (v) => `${v.file}:${v.line}  ${v.rule}  ${v.message}`;

function auditAll(project, files) {
  const components = listComponents(project);
  return files.flatMap((f) => auditFile(project, f, components));
}

// Name spellings a component is used by: AppButton, app-button, app_button.
function nameVariants(name) {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[\s_-]+/).filter(Boolean);
  const lower = words.map((w) => w.toLowerCase());
  const pascal = lower.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  return [...new Set(words.length > 1 ? [name, pascal, lower.join('-'), lower.join('_')] : [name, pascal])];
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

async function hook() {
  const input = JSON.parse(await readStdin());
  const filePath = input.tool_input?.file_path;
  if (!filePath) return 0;
  const file = path.resolve(input.cwd ?? process.cwd(), filePath);
  const root = findRoot(path.dirname(file));
  if (!root) return 0; // not an atomic-design project
  const project = loadProject(root);
  if (!isAudited(project, file) || !fs.existsSync(file)) return 0;
  const baseline = loadBaseline(root);
  const fresh = notBaselined(auditAll(project, [file]), baseline);
  if (!fresh.length) return 0;
  console.error(`atomic-design audit: ${fresh.length} new violation(s). Fix them now; if one is intentional, add the file to "ignore" in ${CONFIG}.\n${fresh.map(format).join('\n')}`);
  return 2;
}

function projectOrThrow() {
  const root = findRoot(process.cwd());
  if (!root) throw new Error(`no ${CONFIG} here or in a parent folder; run /atomic-design:atomic-init first`);
  return loadProject(root);
}

function check(args) {
  const project = projectOrThrow();
  const all = args.includes('--all');
  const named = args.filter((a) => a !== '--all').map((a) => path.resolve(a));
  const files = named.length ? named.filter((f) => isAudited(project, f)) : walk(project.root, project);
  const baseline = all ? new Map() : loadBaseline(project.root);
  const found = notBaselined(auditAll(project, files), baseline);
  console.log(found.length ? found.map(format).join('\n') : 'atomic-design audit: no violations');
  return found.length ? 1 : 0;
}

function list() {
  const project = projectOrThrow();
  const components = listComponents(project);
  // shortcut: reads every project file once per run; fine for thousands of files, cache if it gets slow.
  const sources = walk(project.root, project).map((f) => ({ f, text: fs.readFileSync(f, 'utf8') }));
  for (const c of components) {
    const re = new RegExp(`\\b(?:${nameVariants(c.name).map(escapeRe).join('|')})\\b`);
    c.uses = sources.filter(({ f, text }) => !c.files.includes(f) && re.test(text)).length;
  }
  const rows = components.sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || a.name.localeCompare(b.name));
  console.log(['level'.padEnd(10) + 'component'.padEnd(28) + 'uses'.padEnd(6) + 'file',
    ...rows.map((c) => c.level.padEnd(10) + c.name.padEnd(28) + String(c.uses).padEnd(6) + relPath(project, c.file))].join('\n'));
  const unused = rows.filter((c) => c.uses === 0 && c.level !== 'pages');
  if (unused.length) console.log(`\nunused: ${unused.map((c) => c.name).join(', ')}`);
  return 0;
}

function baseline() {
  const project = projectOrThrow();
  const keys = auditAll(project, walk(project.root, project)).map(baselineKey).sort();
  fs.mkdirSync(path.join(project.root, '.atomic'), { recursive: true });
  fs.writeFileSync(path.join(project.root, BASELINE), JSON.stringify(keys, null, 2) + '\n');
  console.log(`atomic-design: baselined ${keys.length} existing violation(s) in ${BASELINE}`);
  return 0;
}

const COMMANDS = { hook, check, list, baseline };
const [cmd, ...args] = process.argv.slice(2);
try {
  if (!COMMANDS[cmd]) throw new Error(`unknown command "${cmd ?? ''}" (use ${Object.keys(COMMANDS).join(', ')})`);
  process.exitCode = await COMMANDS[cmd](args);
} catch (e) {
  console.error(`atomic-design: ${e.message}`);
  // 1 = violations from check; errors get 2 so CI can tell them apart. The hook keeps 1:
  // a hook exit of 2 would hand the error to Claude as violations to fix.
  process.exitCode = cmd === 'hook' ? 1 : 2;
}
