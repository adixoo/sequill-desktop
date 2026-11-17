---
"sqlite-browser-editor": patch
---

Opened database files are now edited where they are instead of being copied into the app's data folder. Removing one from the list never deletes the file. The schema designer checks each edit on a structure-only copy of the database and always asks before saving to the database itself.
