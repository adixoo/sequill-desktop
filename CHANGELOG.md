# sqlite-browser-editor

## 0.2.2

### Patch Changes

- The installed app and a browser tab no longer lock each other out. A window in the background lets go of your databases and takes them back when it's shown; opening the app in another window hands them over, and the window that let go offers "Use here". "Try again" on the loading error now really retries. The footer also links to more apps by adibitz.

## 0.2.1

### Patch Changes

- The "or drop a file anywhere" hint on the editor's welcome screen now has its arrow pointing up at "Open a .sqlite file", and handwritten notes no longer cut off their last letters. Touch screens no longer show the drop hint.

## 0.2.0

### Minor Changes

- b552847: First release: an offline SQLite browser and editor running SQLite WASM in the browser (OPFS storage), with a table grid, inline editing, SQL console, schema editor, CSV/JSON import and export, installable PWA, light and dark themes, and a landing page.

### Patch Changes

- Faster first load: the fonts now download only the weights the app uses (fonts preloaded on every page drop from 152 KB to 117 KB). The offline service worker is built with Serwist's Next.js integration and keeps the exported pages, chunks, fonts and the SQLite runtime cached, revisioning pages by their content so they are re-downloaded only when they change.
