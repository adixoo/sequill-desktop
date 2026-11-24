---
name: atomic-design
description: Plan and build UI with atomic design (atoms, molecules, organisms, templates, pages) and reuse existing components before writing new ones. Use for UI work - creating or changing components, screens, pages, layouts or styles - in a project that has an atomic.config.json, or when the user asks for atomic design. Works with React, Next.js, React Native, Expo, Vue, Nuxt, Svelte, Angular, Flutter, Jetpack Compose and SwiftUI.
---

# Atomic design

Goal: every screen is built from components that already exist. A new component is written only when nothing existing fits, and then at the right level.

## Levels

| Level | Is | May use |
|---|---|---|
| atoms | One UI element wrapping a platform widget: Button, Input, Icon, Text, Avatar | other atoms, tokens |
| molecules | A small group of atoms with one job: SearchField, FormRow, MenuItem | atoms, molecules |
| organisms | A distinct section of a screen: Header, ProductCard grid, LoginForm | atoms, molecules, organisms |
| templates | Page layout with slots, no real data | anything below |
| pages | A template filled with real data, routing and state | anything below |

A level never imports a level above it. Styling values (colors, spacing, radii, font sizes, shadows) come from the design tokens, never literals.

## Before writing UI code

1. If the project has no `atomic.config.json`, the user asked for atomic design without setting it up: suggest `/atomic-design:atomic-init` once, then follow the rules above.
2. List what exists: `node "${CLAUDE_PLUGIN_ROOT}/scripts/audit.mjs" list` (run from the project folder). It prints every component with its level, file and how many files use it.
3. Break the requested UI into a short table, top level first: piece | level | **reuse** (existing component), **extend** (existing component + a new prop or variant) or **new**. Show it to the user before coding when more than two pieces are new.
4. Prefer, in order: reuse as-is → extend with a prop or variant → compose existing pieces → new component. Never copy a component to change one detail.

## Writing a new component

- Put it in the folder for its level from `atomic.config.json`. Name it for what it is (`PriceTag`), not where it is used (`CheckoutPriceThing`).
- Props for what varies; no hard-coded text, data or ids. Keep data fetching and app state in pages (or organisms when the project already does that).
- Only atoms use raw platform widgets (`<button>`, `Pressable`, `ElevatedButton`, `Button(`). Everything above uses the atoms.
- Keep accessibility: labels, focus, roles - the atom carries them so every user of it gets them.

## The audit

A hook audits every UI file Claude edits. When it reports violations, fix them in the same turn:

- `import-direction` - move the shared part down a level, or move this component up.
- `hardcoded-value` - replace with the matching token; add a token only if none fits, and say so.
- `missed-reuse` - use the named atom instead of the platform widget.
- `duplicate` - delete the new copy and reuse or extend the existing component.

If a violation is truly intentional (a third-party wrapper, a brand asset), ask the user before adding the file to `ignore` in `atomic.config.json`.

For a full review, the user runs `/atomic-design:atomic-audit`.
