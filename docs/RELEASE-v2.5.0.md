# v2.5.0 — the work loop: plan in chat, review a flow, run, report

The tracker becomes the place where a plan made in chat is reviewed and run (instead of plan mode).

**New**
- `plan.apply` takes `after`/`afterMode` on each node and `flow: {id, title, nodes?}`: one call writes the tasks,
  their order and a flow laid out by arrow depth. A flow an agent makes (`plan.apply`, `flow.create`, or a change to
  an idle flow) is a proposal (`review: "pending"`).
- Starting a flow: `flow.approve` (the user, in the UI); Run in the UI; or, in chat, `flow.update status=running
  userSaid="<the user's words>"`: an agent cannot set a flow running without them, and the journal keeps the quote.
  Each approves the flow and its proposed items.
- `flow.report`: the overall report of a flow (Markdown, last 10 kept), in the journal and in the digest. A tracker
  run's final message becomes the report when the session wrote none.
- `activity` and `summary.sessions`: chat sessions holding work now.
- Digest and CLI: every flow with its state (proposed, approved, running, paused, finished), what to do with it,
  and its last report.
- Web UI: "chờ duyệt" banner with Duyệt on a proposed flow; "Luồng agent đề xuất" in Cần bạn with a link that
  opens the flow (`#/p/<id>/f/<flowId>`); a Báo cáo window (overall report, counts, each task with summary, proof,
  block or question, the flow's runs); chat sessions at the top of a project and on Đang chạy; the sidebar count
  includes them. Run is hidden while a flow is already running.
- Skill 2.4.0: "The work loop with the user", plan + flow example, report example.

**Data**: no migration (`review` and `reports` on flows are optional).
