---
"sqlite-browser-editor": patch
---

An assistant's write that was saved is no longer reported as failed when Sequill is busy with a long write of its own. Before, the assistant saw "database is locked", retried, and added the rows twice.
