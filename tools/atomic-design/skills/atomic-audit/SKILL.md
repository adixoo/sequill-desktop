---
name: atomic-audit
description: Full atomic design audit of this project - rule violations, wrong levels, duplicate or near-duplicate components, missed reuse and unused components. Reports only; changes nothing.
disable-model-invocation: true
---

# Atomic design audit

Report only. Do not edit files. Run from the folder with `atomic.config.json` (if there is none, tell the user to run `/atomic-design:atomic-init`).

1. **Rule check:** `node "${CLAUDE_PLUGIN_ROOT}/scripts/audit.mjs" check --all`
   (`--all` includes baselined violations; drop it to see only new ones.)
2. **Inventory:** `node "${CLAUDE_PLUGIN_ROOT}/scripts/audit.mjs" list`
3. **Review what the script cannot judge.** Read the components and check:
   - **Wrong level:** an "atom" that combines several elements, a molecule holding page state or fetching data, an organism that is really a layout (template).
   - **Near-duplicates:** different names, same job (`PrimaryButton` and `CTAButton`; `UserCard` and `ProfileCard`). Propose which one stays and the prop or variant that absorbs the other.
   - **Missed reuse:** markup or widget trees repeated in 3+ places that should become one component.
   - **Unused:** components from the `unused` line of the inventory; confirm with a search before calling them dead.
   - **SwiftUI only:** check import direction by reading which components each view uses, since the script cannot.
4. **Report**, most important first, grouped as: fix now (violations), merge (duplicates), move (wrong level), extract (repeated code), delete (unused). Give each item: the files, what is wrong, the smallest fix. End with counts per group.

If the user wants accessibility reviewed too, point them to an accessibility audit skill if one is installed; this audit does not cover it.
