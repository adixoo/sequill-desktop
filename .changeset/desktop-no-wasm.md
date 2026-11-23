---
"sqlite-browser-editor": patch
---

The desktop app no longer ships the browser build's SQLite (the WebAssembly engine and its worker, about 1.5 MB); it only ever used its native SQLite.
