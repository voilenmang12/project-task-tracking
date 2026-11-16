# v2.2.0 — flows: order arrows and a board to run them

**New**
- Order arrows: every task or group may run `after` other items of its project, with `afterMode` "all" (default)
  or "any". An arrow from a group waits for the whole group; the tasks in a group wait on the group's arrows; a
  dropped item holds nobody up. `task.update` sets them and refuses arrows that make a loop (409).
  `task.start` refuses an agent a task whose predecessors are not finished (409), and NEXT leaves those out.
- Flows (`flow.create`, `flow.update`, `flow.delete`): a board of tasks and groups with their places, an assignee
  and a status (draft, running, paused; done when every task is). The digest lists running and paused flows; for
  the assigned actor (or any actor when none is set) it gives the next ready tasks in arrow order, then top to
  bottom and left to right; other agents are told to leave the flow's tasks alone and NEXT does not offer them.
  The tracker still runs no agent: the agent picks the flow up at the start of its session.
- Web UI, tab Luồng: flow list, palette of items to drag on the board, nodes with status, "kế tiếp" and "chờ N"
  badges, arrows drawn from a node's right port, all/any switch per node, arrow delete, auto layout, assignee and
  Run/Pause. Tree rows show "chờ N việc trước"; the item panel has a "Chạy sau" section.
- CLI digest prints each flow with NEXT, doing and then lines. Skill 2.2.0.

**Data**
- 2.0/2.1 data gets an empty `flows` list on first read; the original file is kept as `workspace.v2.0.json`.
