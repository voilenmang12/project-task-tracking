# v2.6.0 — work in progress is locked until the user stops it

**New**
- Locks: a task in "doing", a task with an active tracker run, and everything inside a running flow (its nodes and
  what is under them; a flow whose tasks are all done holds nothing) are changed only by the session doing the
  work. Anyone else, the user included, gets 423 with `{live: {kind, taskId, flowId, runId, owner, verb}}`. The
  widest lock comes first (flow, then run, then task).
- Refused while live: `task.update` (any field, arrows included), `task.move` (the item, its old and new parent),
  `task.add` under a live item, `task.drop` and `task.delete` (the item or anything under it), `task.done` and
  `task.start` by someone else, `task.reopen` of an item live work runs after, `run.start` into another session's
  work, `plan.apply` changing or adding under live items or adding nodes to a running flow, `flow.update` changing a
  running flow's nodes, assignee, or sending it to draft, `flow.delete`, `project.update` of the repo folder or
  archive while a run or flow is going. Still free: node positions, a flow's title, answers, unblocks, approvals,
  reports.
- `work.stop` (user only): for a task, its flow and run too; for a flow, its run and its tasks in work. The flow is
  paused, runs end, tasks go back to "todo" marked `stopped`. An agent's writes to a stopped task get 409; it starts
  it again only with `task.start userSaid`, its flow with `flow.update userSaid`, or the user's Run. Stopped tasks
  and tasks of paused flows are not offered as NEXT.
- Web UI: a refused change opens "Đang chạy, cần dừng trước" with what runs and what stopping does; "Dừng rồi làm
  tiếp" stops it and makes the change again. Lock icon on live rows, a "Dừng" box in the item panel, "bạn đã dừng"
  tags, Run hidden on locked tasks, and the flow board's pause is now a real stop.
- CLI marks STOPPED tasks. Skill 2.5.0: what to do on 423 and on a stopped task.

**Data**: no migration (`stopped` on tasks is optional).
