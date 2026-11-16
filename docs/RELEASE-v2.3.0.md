# v2.3.0 — the plan and the flow side by side

**New**
- Web UI, tab Luồng: the screen is split in two, the plan tree on the left (add, filter, reorder as in Kế hoạch)
  and the flow board on the right, with a divider the user drags (its width is remembered in the browser).
- A tree row dragged onto the board becomes a node where it is dropped. An item already on the board is not
  added twice: the board says so and flashes the existing node. Dropping a task whose group is already on the
  board adds it with a note. Rows already on the open board carry a "trong luồng" tag.
- The flow is picked, renamed and created from the board's toolbar; the separate item list beside the board is
  gone. The item panel opens over the board instead of narrowing it.

No change to the API, the data or the skill.
