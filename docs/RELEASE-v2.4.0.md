# v2.4.0 — run a task or a flow with Claude Code

**New**
- Agent runs: Run on a task or a flow starts `claude -p` in the project's repository (`server/runner.js`). The
  session leads the run as actor `run-<n>`: branch, `task.start`, sub-tasks for its subagents, reports, done with
  evidence; for a flow, its NEXT tasks in order. The user may add a note. One run per repository at a time; the
  others wait. Permissions are the repository's own settings; nothing widens them.
- Actions `run.start`, `run.stop` (user only), `runs.list`, and `run.report` (the supervisor only). An ended run
  hands back the tasks it left in progress and pauses its flow.
- `GET /api/run-log`: a readable log of each run (assistant text, tools, subagents, errors, the end), kept in
  `.local/runs/<id>.log`.
- Web UI: "Đang chạy" page and sidebar count, running runs at the top of a project, "Nhánh #n đang chạy" on task
  rows, a run count on overview cards, ▶ on task rows, a run section in the item panel, "Chạy bằng agent" on flows
  (the earlier assign-only switch is now "Mở cho agent ngoài"), and a live log window with Stop.
- The run gets a clean environment (no variables of a Claude Code session that started the tracker) and, when the
  CLI is not signed in or the folder is not trusted, the log and the error say how to fix it.
- After a tracker restart, a run whose session is gone is "interrupted"; one still running is watched until it ends.
- Skill 2.3.0: what a session started by the tracker does.

**Data**
- 2.2/2.3 data gets an empty `runs` list on first read; the original file is kept as `workspace.v2.2.json`.

**Principle changed**: the tracker now starts agents, but only when the user presses Run (AGENTS.md).
