# Security policy

## Supported versions

Security fixes go into the latest release only. Please update to the newest version from the
[releases page](https://github.com/adixoo/sequill-desktop/releases) before reporting.

| Version          | Supported |
| ---------------- | --------- |
| Latest (`1.1.x`) | Yes       |
| Older releases   | No        |

## Reporting a vulnerability

**Please don't report security problems in public issues, pull requests or discussions.**

Report them privately through GitHub instead:

1. Go to the repository's [Security tab](https://github.com/adixoo/sequill-desktop/security).
2. Click **Report a vulnerability** and fill in the form
   ([direct link](https://github.com/adixoo/sequill-desktop/security/advisories/new)).

Only the maintainers can see the report. Please include:

- the Sequill version and your operating system;
- what the problem is and what an attacker could do with it;
- the steps to reproduce it, ideally with a small database file, SQL script or MCP call that shows it;
- any idea you have for a fix.

## What happens next

- We'll acknowledge your report within 7 days and keep you updated as we look into it.
- If we confirm the problem, we'll work on a fix, release it, and publish a GitHub security advisory.
  You'll be credited in the advisory unless you'd rather not be.
- If we decide it isn't a vulnerability, we'll explain why.

Please give us a reasonable time to release a fix before you talk about the problem in public.

## Scope

Sequill works with database files on your own computer and runs an MCP server that AI assistants can
call. Examples of what we want to hear about:

- an MCP call that changes data while **Also let it make changes** (`--allow-writes`) is off, or
  that runs while MCP access is turned off;
- an MCP call, query or database file that reads or writes files outside Sequill's data folder (for
  example by getting around the ATTACH block);
- SQL injection through table names, column names, filters or other input the app builds SQL from;
- a crafted database, CSV, TSV or JSON file that runs code or reads other files when opened or
  imported;
- a web page or other process that can reach the app's Tauri commands.

Out of scope:

- attacks that need someone who already controls your user account or computer;
- an assistant you allowed to make changes doing what it was allowed to do;
- bugs in SQLite itself (please report those to [SQLite](https://sqlite.org/src/forum)), unless
  Sequill makes them worse;
- crashes or slowdowns with no security impact (please open a normal issue).
