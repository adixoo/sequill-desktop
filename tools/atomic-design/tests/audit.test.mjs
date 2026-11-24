// Run: node --test tests/audit.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const AUDIT = path.join(here, '..', 'scripts', 'audit.mjs');
const fixture = (name) => path.join(here, 'fixtures', name);

const run = (cwd, args, input) => spawnSync(process.execPath, [AUDIT, ...args], { cwd, input, encoding: 'utf8' });
const violations = (stdout) =>
  stdout.split('\n').map((l) => l.match(/^(.+?):(\d+) {2}(\S+) {2}/)).filter(Boolean).map((m) => `${m[1]}:${m[2]} ${m[3]}`).sort();
const hook = (cwd, filePath) => run(cwd, ['hook'], JSON.stringify({ tool_name: 'Edit', cwd, tool_input: { file_path: filePath } }));

const temps = [];
after(() => temps.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-'));
  temps.push(dir);
  return dir;
}

function copyFixture(name) {
  const dir = tempDir();
  fs.cpSync(fixture(name), dir, { recursive: true });
  return dir;
}

// A throwaway project: config plus { 'relative/path': 'contents' }.
function project(config, files) {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'atomic.config.json'), JSON.stringify(config));
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  return dir;
}
const checkAll = (dir) => violations(run(dir, ['check', '--all']).stdout);

const EXPECTED = {
  js: [
    'src/atoms/Button.tsx:1 duplicate',
    'src/molecules/Button/index.tsx:1 duplicate',
    'src/molecules/SearchBar.tsx:2 import-direction',
    'src/molecules/SearchBar.tsx:5 hardcoded-value',
    'src/molecules/SearchBar.tsx:5 missed-reuse',
    'src/organisms/Header.tsx:4 hardcoded-value',
  ],
  flutter: [
    'lib/ui/molecules/search_bar.dart:2 import-direction',
    'lib/ui/molecules/search_bar.dart:5 hardcoded-value',
    'lib/ui/molecules/search_bar.dart:5 missed-reuse',
    'lib/ui/organisms/header.dart:3 hardcoded-value',
  ],
  compose: [
    'src/ui/molecules/SearchBar.kt:2 import-direction',
    'src/ui/molecules/SearchBar.kt:5 missed-reuse',
    'src/ui/molecules/SearchBar.kt:6 hardcoded-value',
    'src/ui/organisms/Header.kt:2 hardcoded-value',
  ],
  swiftui: [
    'App/UI/Molecules/SearchBar.swift:3 missed-reuse',
    'App/UI/Molecules/SearchBar.swift:4 hardcoded-value',
    'App/UI/Molecules/SearchBar.swift:5 hardcoded-value',
  ],
};

for (const [preset, expected] of Object.entries(EXPECTED)) {
  test(`check finds exactly the planted violations (${preset})`, () => {
    const r = run(fixture(preset), ['check', '--all']);
    assert.equal(r.status, 1, r.stderr);
    assert.deepEqual(violations(r.stdout), [...expected].sort());
  });
}

test('list shows components with usage counts and unused ones', () => {
  const r = run(fixture('js'), ['list']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /atoms\s+Input\s+1\s+src\/atoms\/Input\.tsx/);
  assert.match(r.stdout, /unused: Badge$/m);
});

test('hook blocks a file with violations and passes a clean one', () => {
  const dir = fixture('js');
  const bad = hook(dir, path.join(dir, 'src/molecules/SearchBar.tsx'));
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /3 new violation/);
  assert.match(bad.stderr, /import-direction/);
  assert.equal(hook(dir, path.join(dir, 'src/pages/Home.tsx')).status, 0);
  assert.equal(hook(dir, 'src/molecules/SearchBar.tsx').status, 2, 'relative path resolves against cwd');
});

test('hook ignores non-UI files, ignored files and projects without config', () => {
  const dir = fixture('js');
  assert.equal(hook(dir, path.join(dir, 'atomic.config.json')).status, 0);
  assert.equal(hook(dir, path.join(dir, 'src/organisms/Header.test.tsx')).status, 0);
  const plain = tempDir();
  fs.writeFileSync(path.join(plain, 'App.tsx'), "const c = '#123456';\n");
  assert.equal(hook(plain, path.join(plain, 'App.tsx')).status, 0);
});

test('baseline hides existing violations and still reports new ones', () => {
  const dir = copyFixture('js');
  assert.equal(run(dir, ['baseline']).status, 0);
  assert.equal(run(dir, ['check']).status, 0);
  const file = path.join(dir, 'src/molecules/SearchBar.tsx');
  assert.equal(hook(dir, file).status, 0);
  fs.appendFileSync(file, "export const x = { margin: '12px' };\n");
  const r = hook(dir, file);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /1 new violation/);
  assert.match(r.stderr, /SearchBar\.tsx:7 {2}hardcoded-value/);
});

test('a broken config is reported without blocking the edit', () => {
  const dir = copyFixture('js');
  fs.writeFileSync(path.join(dir, 'atomic.config.json'), '{"preset":"cobol","levels":{}}');
  const r = hook(dir, path.join(dir, 'src/pages/Home.tsx'));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown preset "cobol"/);
});

const ROUTES = { preset: 'js', levels: { atoms: 'src/atoms', pages: 'app' } };

test('list survives route file names that are not valid regex', () => {
  const dir = project(ROUTES, {
    'app/blog/[...slug].tsx': 'export default () => null;\n',
    'app/+page.svelte': '<h1>Home</h1>\n',
    'app/$id.tsx': 'export default () => null;\n',
  });
  const r = run(dir, ['list']);
  assert.equal(r.status, 0, r.stderr);
});

test('route files with the same name are not duplicates', () => {
  const dir = project(ROUTES, {
    'app/dashboard/page.tsx': 'export default () => null;\n',
    'app/settings/page.tsx': 'export default () => null;\n',
    'app/+page.svelte': '<h1>Home</h1>\n',
    'app/about/+page.svelte': '<h1>About</h1>\n',
  });
  assert.deepEqual(checkAll(dir), []);
});

test('baseline still reports new copies of a baselined line', () => {
  const bad = "  <div style={{ padding: '24px' }} />\n";
  const dir = project({ preset: 'js', levels: { molecules: 'src/molecules' } },
    { 'src/molecules/Card.tsx': `export const C = () => (<>\n${bad}</>);\n` });
  assert.equal(run(dir, ['baseline']).status, 0);
  fs.writeFileSync(path.join(dir, 'src/molecules/Card.tsx'), `export const C = () => (<>\n${bad}${bad}${bad}</>);\n`);
  const r = hook(dir, path.join(dir, 'src/molecules/Card.tsx'));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /2 new violation/);
});

test('comments are skipped wherever they start; code that looks like one is not', () => {
  const dir = project({ preset: 'js', levels: { molecules: 'src/m' } }, {
    'src/m/Y.tsx': [
      'export const Y = () => (<>',
      '  {/* old: #ff0000 */}',
      '  <a href="#add">add</a>',
      '</>);',
      'const n = 1; // see #123',
      'class A { #cafe = 1; }',
      "const c = '#abc';",
      '/*',
      '  color: #00ff00',
      '*/',
    ].join('\n'),
    'src/m/x.css': '* { margin: 24px; }\n',
  });
  assert.deepEqual(checkAll(dir), ['src/m/Y.tsx:7 hardcoded-value', 'src/m/x.css:1 hardcoded-value']);
});

test('hook skips build output, like check does', () => {
  const dir = project({ preset: 'js', levels: { atoms: 'src/atoms' } }, { 'dist/out.css': '.a { color: #123456 }\n' });
  assert.equal(hook(dir, path.join(dir, 'dist/out.css')).status, 0);
});

test('SwiftUI token colors and zero padding pass; system colors do not', () => {
  const dir = project({ preset: 'swiftui', levels: { molecules: 'A/Molecules' } }, {
    'A/Molecules/Card.swift': [
      'struct Card: View { var body: some View {',
      '  Text("a").foregroundColor(Color.brand).padding(0)',
      '  Text("b").foregroundColor(Color.red)',
      '} }',
    ].join('\n'),
  });
  assert.deepEqual(checkAll(dir), ['A/Molecules/Card.swift:3 hardcoded-value']);
});

test('Flutter zero insets pass; other numbers do not', () => {
  const dir = project({ preset: 'flutter', levels: { molecules: 'lib/m' } }, {
    'lib/m/card.dart': 'final a = EdgeInsets.all(0);\nfinal b = EdgeInsets.all(8);\n',
  });
  assert.deepEqual(checkAll(dir), ['lib/m/card.dart:2 hardcoded-value']);
});

test('check skips named files the preset does not audit', () => {
  const dir = project({ preset: 'js', levels: { atoms: 'src/atoms' } }, { 'README.md': 'color: #123456\n' });
  const r = run(dir, ['check', 'README.md']);
  assert.equal(r.status, 0, r.stdout);
});

test('ignore "**/" matches whole folders only', () => {
  const dir = project({ preset: 'js', levels: { atoms: 'src/atoms' }, ignore: ['src/**/skip.tsx'] }, {
    'src/skip.tsx': "const a = '#123456';\n",
    'src/x/skip.tsx': "const a = '#123456';\n",
    'src/noskip.tsx': "const a = '#123456';\n",
  });
  assert.deepEqual(checkAll(dir), ['src/noskip.tsx:1 hardcoded-value']);
});

test('a broken config exits 2 from check, so CI can tell it from violations', () => {
  const dir = project({ preset: 'cobol', levels: {} }, {});
  assert.equal(run(dir, ['check']).status, 2);
});
