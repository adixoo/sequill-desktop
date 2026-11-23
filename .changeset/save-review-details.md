---
"sqlite-browser-editor": patch
---

Saving a schema design now lists every change in plain words (new tables and columns, renames, changed and deleted columns and tables) above the SQL. If the save fails, the reason stays in the review ("Nothing was saved: …"), naming the real table, and the design is kept so you can fix it.
