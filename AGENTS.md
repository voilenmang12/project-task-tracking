# Project instructions

This repository is the Nhanh tracker: a local API, a CLI and a web UI where one person follows the work of
autonomous agents (plan, progress, proof, what waits for the user).

- `shared/model.js` is the data model (pure functions, used by the server and the UI). `server/actions.js` holds
  every action; nothing else changes the data. `src/` is the web UI (React, Vite). The CLI lives in
  `skills/nhanh-project-tracking/scripts/nhanh.mjs` so the skill works on its own.
- A new behaviour is an action with a description an agent can act on, a test in `tests/`, and a line in the
  skill's `SKILL.md` or `references/rules.md` when agents must know about it.
- Run `npm test` and `npm run build` before each merge. Code is written to be read: no dense one-liners.
- Keep the user's data: `.local/` is never committed and never edited by hand; a change of the stored format
  needs a migration in `server/migrate.js` with a test, and keeps the old file.
- The service is loopback only. Never deploy it or expose it on a network.
- The UI is for the person: it has no AI chat. It starts an agent only when the user presses Run on a task or a flow:
  `server/runner.js` runs `claude -p` in the project's repository with that repository's own permissions (never
  wider), one run per repository at a time, and records what it printed. Agents never start runs. An agent runs a
  flow in its own chat session only with the user's words (`flow.update userSaid`), which the journal keeps. Its wording is Vietnamese; code, comments
  and the skill are English.
- Agents using the tracker for another project follow the skill, not this file.
