# v2.1.0 — the user plans with the agents

The plan is no longer only what agents write: the user builds it, orders it and approves what agents propose.

**New**
- Review: a project setting (`review`) under which every item an agent adds with `plan.apply` or `task.add` waits
  for the user's approval. `task.start` refuses a proposal (409), `digest` lists them as `awaitingReview`,
  `attention` as `review`, and the new action `task.approve` (user only) approves an item with what is under it and
  the groups above it. A rejected proposal is dropped with the user's reason. Projects made in the web UI start
  with review on; projects made through the API keep it off unless `review: true` is passed.
- Web UI, adding work: one box adds a task or a milestone, with an optional form for its place in the tree, size,
  description, criteria and labels; "+" on a row adds inside it.
- Web UI, ordering: drag a row to reorder it or move it to another milestone (drop in the middle of a row to put
  it inside), Alt+↑/↓ on a focused row, and in the item panel a place selector with up and down buttons.
- Web UI, review: "chờ duyệt" rows with approve and reject buttons, a banner with "Duyệt tất cả", a "Chờ duyệt"
  filter, and a review section in Cần bạn.
- Web UI: criteria and labels are edited in place; every browser prompt and confirm became an in-app dialog.
- CLI: the digest prints an `AWAITING REVIEW` section. Skill 2.1.0 tells agents not to start proposals.

**Data**
- No migration: a project without `review` has review off, a task without `review` is not a proposal.
