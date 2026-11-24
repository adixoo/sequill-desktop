---
name: atomic-init
description: Set up atomic design in this project - detect the framework, map the atoms/molecules/organisms/templates/pages folders, write atomic.config.json and baseline existing violations.
disable-model-invocation: true
---

# Set up atomic design

Do these steps in the project folder the user is working in. Change no source files.

1. **Framework → preset.** Read the manifests and pick one:
   - `js`: `package.json` with React, Next.js, React Native, Expo, Vue, Nuxt, Svelte or Angular (also Electron and Tauri front ends)
   - `flutter`: `pubspec.yaml`
   - `compose`: `build.gradle(.kts)` using Jetpack Compose or Compose Multiplatform
   - `swiftui`: `Package.swift` or an `.xcodeproj` using SwiftUI

   If more than one app is found (a monorepo), ask which one, and write the config in that app's folder.

2. **Level folders.** Find existing folders for atoms, molecules, organisms, templates and pages (they may have other names, e.g. `ui/`, `widgets/`, `screens/`). If there are none, propose the defaults below and create them only after the user agrees. Leave out levels the project does not use.

3. **Tokens.** Find the files that define colors, spacing and type (CSS variables, Tailwind config, theme files, `ThemeData`, `Color.kt`, asset catalogs). List them under `tokens`. If none exist, say so: the hard-coded value check will then flag every literal.

4. **Write `atomic.config.json`** at the app root. Example for a React app:

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

   Flutter defaults: `lib/ui/atoms` … `lib/ui/pages`. Compose: `app/src/main/java/<package>/ui/atoms` …. SwiftUI: `<App>/UI/Atoms` ….

5. **Baseline.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/audit.mjs" baseline` from the app root. Existing violations are saved to `.atomic/baseline.json`, so the edit hook only reports new ones. Suggest committing both files.

6. **Report.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/audit.mjs" list` and tell the user: the preset, the folders, how many components per level, and how many violations were baselined. Suggest `/atomic-design:atomic-audit` to work through the baselined ones.
