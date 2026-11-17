# Nhánh v2.9.0: fewer tokens, no waiting loops

An audit of what agents read from the tracker and of everything that repeats on a timer.

## Agents read less

- `task.done`, `task.block` and `task.release` return **THEN**: the next task of each running flow the agent owns,
  and how many items the user wrote that no agent has picked up. Agents read the digest again only when THEN shows
  inbox items, instead of after every task of a flow.
- The digest prints a task's details once; a task in two sections (inbox and NEXT) is named in one line the second time.
- Write results echo only the task line and its open criteria (`task.start` and `task.get` keep the full detail);
  flow results are one line instead of the whole flow with its reports; other results are compact JSON.
- The skill (2.8.0), the MCP server's instructions and the prompt of tracker runs say: one digest per session or
  turn, `task.start` without a `task.get` first, rules.md once per session, and never poll, sleep or schedule
  wake-ups, loops or cron jobs to wait for the user.

## Fewer repeated requests

- The MCP server checks the tracker and reads its token once per session (again only after a tracker restart),
  instead of two extra requests on every tool call.
- The run log window stops reading once the run has ended, or after a failed read.

Unchanged: the 15 s check of a run that outlived a tracker restart (it ends with that process), the SSE stream of
the web UI and its 2 s reconnect.
