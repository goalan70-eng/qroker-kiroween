# QRoker repository instructions

QRoker uses Kiro specs, steering rules and command-only hooks for design and verification. At the judging tag `kiroween-2026-final`, the optical spec (`qroker-game`) has 37 tasks with execution history and 36 marked complete. The browser game spec (`qroker-playable-game`) has 58 tasks with execution history and 76 marked complete. For each spec, count distinct task keys in `tasks.meta.json` and checked tasks in `tasks.md`. Consult `docs/kiroween-development-log.md` for the attribution of implementation and verification work.

- Protect `.kiro/**` as read-only during Codex and other non-Kiro follow-up sessions so Kiro's specs, steering files, hooks, and task execution history stay intact.
- Work from this repository root (`D:\Project\QRoker\qroker-kiroween` on the owner's PC). Keep follow-up code, tests, builds, documents, and local artifacts outside `.kiro/`.
- Follow the [workspace instructions](../AGENTS.md) for Kiro file protection, evidence reporting, and keeping Kiro and Codex contribution records distinct. Treat sibling worktrees and historical folders as read-only references unless explicitly directed.
