# v2.7.0 — lock only the work in progress; resume a stopped task where it was

**Changed**
- Locks are narrower: a task in "doing" or with an active tracker run, and what is under it. The rest of a running
  flow is free to change for the user (wording, arrows, sub-tasks, nodes added or removed), since a task's order is
  checked again when it starts. Still locked at flow level: assignee, draft, delete, Run, a node with work in progress
  under it, the project's repo or archive; another agent still cannot change a running flow's nodes.
- `work.stop` on a task stops that task only; its flow goes on with its other ready tasks (the stopped one is
  shown as waiting for the user). A tracker run doing it is still ended, which pauses the flow it runs.

**New**
- The journal says what an edit changed (title, description, size, labels, arrows, condition, each criterion added,
  removed, renamed, ticked) and when a task moves to another parent. Criteria added as text get readable ids.
- Resume: `task.start` on a task worked on before returns `resume` (branch, criteria done and open, last progress,
  the stop, the user's changes since it); the CLI prints it as RESUME. The changes are given once; a stop lifted by
  the user's word on the flow or by Run is kept for this. The digest lists a stopped task's changes so far.
- Tracker runs are told to resume rather than redo; skill 2.6.0 says the same.
- Web UI: lock icons follow the narrower rule; the stop dialog says what stops and what goes on.
