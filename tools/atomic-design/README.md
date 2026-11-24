# atomic-design

A Claude Code plugin that makes Claude build UI the [atomic design](https://atomicdesign.bradfrost.com/) way: plan the pieces first, reuse the components you already have, and check every UI file it edits.

Works for web and app projects:

| Preset | Frameworks |
|---|---|
| `js` | React, Next.js, React Native, Expo, Vue, Nuxt, Svelte, Angular, Electron and Tauri front ends |
| `flutter` | Flutter |
| `compose` | Jetpack Compose, Compose Multiplatform |
| `swiftui` | SwiftUI |

## What it does

**1. Plans before building.** When you ask for UI work, Claude splits it into levels and marks each piece before writing code:

| Piece | Level | Plan |
|---|---|---|
| Price tag | atom | reuse `Text` + `Badge` |
| Product card | molecule | extend `Card` with an `image` slot |
| Product grid | organism | new |

**2. Reuses what exists.** Claude lists your components (with how many files use each) and prefers: reuse → extend with a prop → compose → new. It never copies a component to change one detail.

**3. Audits every UI edit.** After each `Edit` or `Write` on a UI file, a hook checks it. New problems go straight back to Claude, which fixes them in the same turn:

| Rule | Catches |
|---|---|
| `import-direction` | A lower level importing a higher one, e.g. a molecule importing an organism |
| `hardcoded-value` | Literals that belong in design tokens: `#333`, `rgb(…)`, `24px`, `Color(0xFF…)`, `Colors.red`, `16.dp`, `.padding(12)` |
| `missed-reuse` | A platform widget above the atom level when an atom exists: `<button>`, `Pressable`, `ElevatedButton`, `Button(` |
| `duplicate` | Two components with the same name, e.g. `atoms/Button` and `molecules/Button`. Pages are exempt: routes share file names like `page.tsx` or `+page.svelte`. |

**4. Full audit on demand.** `/atomic-design:atomic-audit` runs every rule on the whole project, then reviews what a script can't judge: components at the wrong level, near-duplicates with different names, repeated markup that should be a component, and unused components. It reports only and changes nothing.

## Levels

| Level | Is | May use |
|---|---|---|
| atoms | One element wrapping a platform widget: Button, Input, Icon | atoms, tokens |
| molecules | A few atoms with one job: SearchField, FormRow | atoms, molecules |
| organisms | A section of a screen: Header, LoginForm | atoms, molecules, organisms |
| templates | Page layout with slots, no real data | anything below |
| pages | A template filled with data, routing and state | anything below |

A level never imports a level above it. Leave out levels your project doesn't use.

## Install

Requires [Claude Code](https://code.claude.com) and **Node.js 18+** (the audit script runs on Node, also in Flutter, Android and iOS projects).

### From GitHub (recommended)

Inside Claude Code:

```
/plugin marketplace add adibitz/atomic-design
/plugin install atomic-design@atomic-design
```

Or from a terminal:

```
claude plugin marketplace add adibitz/atomic-design
claude plugin install atomic-design@atomic-design
```

Restart Claude Code (or run `/reload-plugins`) so the skills and hook load. `claude plugin list` should show `atomic-design`.

### From a local clone (to try or change it)

```
git clone https://github.com/adibitz/atomic-design.git
claude --plugin-dir ./atomic-design
```

`--plugin-dir` loads the plugin for that session only.

### Update and remove

```
claude plugin marketplace update atomic-design
claude plugin update atomic-design@atomic-design
claude plugin uninstall atomic-design@atomic-design
```

## Set up a project

Open Claude Code in your app's folder and run:

```
/atomic-design:atomic-init
```

Claude will:

1. Detect the framework from `package.json`, `pubspec.yaml`, `build.gradle(.kts)` or `Package.swift` / `.xcodeproj`. In a monorepo it asks which app.
2. Find your atoms / molecules / organisms / templates / pages folders (also under other names like `ui/`, `widgets/`, `screens/`). If there are none, it proposes folders and creates them only after you agree.
3. Find your design token files (CSS variables, Tailwind config, `ThemeData`, `Color.kt`, asset catalogs).
4. Write `atomic.config.json` at the app root.
5. Save existing violations to `.atomic/baseline.json`, so old code doesn't block new work. Only **new** violations are reported.
6. Show the component list and what it found.

Commit `atomic.config.json` and `.atomic/baseline.json` so your team shares them.

### `atomic.config.json`

```json
{
  "preset": "js",
  "levels": {
    "atoms": "src/components/atoms",
    "molecules": "src/components/molecules",
    "organisms": "src/components/organisms",
    "templates": "src/components/templates",
    "pages": "src/pages"
  },
  "tokens": ["src/styles/tokens.css", "tailwind.config.js"],
  "ignore": ["**/*.test.*", "**/*.spec.*", "**/*.stories.*", "**/__generated__/**"]
}
```

| Key | Meaning |
|---|---|
| `preset` | `js`, `flutter`, `compose` or `swiftui` |
| `levels` | Folder for each level, relative to this file. Any subset of the five. |
| `tokens` | Files or folders that define design values. The `hardcoded-value` rule skips them. |
| `ignore` | Glob patterns (`*`, `**`, `?`) the audit skips entirely |

Folder examples for apps:

| Preset | Atoms folder |
|---|---|
| `flutter` | `lib/ui/atoms` |
| `compose` | `app/src/main/java/com/yourapp/ui/atoms` |
| `swiftui` | `YourApp/UI/Atoms` |

## Daily use

Work as usual: "build a checkout page", "add a filter bar to the product list". In a project with `atomic.config.json`, the `atomic-design` skill loads on its own for UI work, plans the pieces, and the hook keeps every edit in line. Nothing to run by hand.

| Command | When |
|---|---|
| `/atomic-design:atomic-init` | Once per project |
| `/atomic-design:atomic-audit` | Before a release, or to work through the baselined debt |

The script also runs on its own, e.g. in CI. Run it from the folder with `atomic.config.json` (`<plugin>` is the plugin folder; installed plugins live under `~/.claude/plugins/cache/atomic-design/`):

```
node <plugin>/scripts/audit.mjs check            # new violations; exit code 1 if any, 2 on a config error
node <plugin>/scripts/audit.mjs check --all      # include baselined ones
node <plugin>/scripts/audit.mjs check src/a.tsx  # only these files
node <plugin>/scripts/audit.mjs list             # components, usage counts, unused
node <plugin>/scripts/audit.mjs baseline         # accept current violations
```

## Exceptions

- A file that legitimately breaks a rule (a third-party wrapper, a brand asset): add it to `ignore`. Claude asks you before doing this.
- A codebase full of old violations: run `baseline` again after a cleanup to shrink the list.

## Limits

- The checks match code patterns line by line, not a full parser. Unusual formatting can slip through; `/atomic-design:atomic-audit` reviews the rest.
- Comments are skipped. A comment marker inside a string (`'**/*.ts'`) can hide a violation on that line.
- SwiftUI has no import-direction check: files in one Swift module don't import each other. The full audit reviews it instead.
- Non-relative imports are matched by folder name, so an alias or package folder named like a level (e.g. `pages`) can be misread.
- Without Node, the hook shows an error after each edit but never blocks it.

## Troubleshooting

| Problem | Fix |
|---|---|
| Hook never reports anything | Check `atomic.config.json` exists in the app folder or a parent, and the file's extension belongs to the preset. Run `/hooks` to see the hook is loaded. |
| `unknown preset` error | `preset` must be one of `js`, `flutter`, `compose`, `swiftui`. |
| Everything is flagged after setup | Run `node <plugin>/scripts/audit.mjs baseline` from the app root. |
| `node: command not found` | Install Node.js 18+ and restart Claude Code. |

## Contributing

Add a framework: add an entry to [`scripts/presets.mjs`](scripts/presets.mjs) and a small sample project with planted violations under `tests/fixtures/`, then list them in `tests/audit.test.mjs`.

```
node --test tests/audit.test.mjs
claude plugin validate .
```

Layout:

```
.claude-plugin/    plugin.json, marketplace.json
hooks/hooks.json   PostToolUse hook → scripts/audit.mjs hook
scripts/           audit.mjs (rules engine), presets.mjs (per framework)
skills/            atomic-design (auto), atomic-init, atomic-audit (commands)
tests/             test suite and fixture projects
```
