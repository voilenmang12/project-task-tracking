# v2.0.0 — a control room for autonomous agents

A rewrite from the idea up. Version 1 was a personal to-do tree with an API added; version 2 is built for one
person following several agents.

**New**
- Web UI: Tổng quan (all projects), Cần bạn (questions, blocked work, requests not picked up), per project the
  plan tree with status, size, owner and criteria, a journal with evidence, and notes. Live updates.
- Model: groups (milestones) and tasks; sizes S/M/L; acceptance criteria; owner, specialist and branch; summary
  and evidence; questions to the user; origin of each item (plan, user, agent with a reason); weighted progress.
- Actions that follow the work: `digest`, `plan.apply`, `task.start`, `task.progress`, `task.add`, `task.ask`,
  `task.answer`, `task.ack`, `task.block`, `task.unblock`, `task.done`, `task.release`, `task.reopen`,
  `task.drop`, `project.log`. `task.done` refuses unmet criteria and, for M and L, missing evidence.
- CLI with short text output (`digest`, `tree`) so reading the tracker costs an agent few tokens.
- Skill 2.0.0: rules for the first plan, added work, reports and several agents.

**Breaking**
- API version 2: `/api/call` replaces `/api/tools/call`; the v1 tools, the global `expectedRevision`, leases and
  `/api/workspace` are gone. Skill 1.x does not work with this server.
- Removed: ideas, image and audio attachments, the tag catalogue (tag names become labels), project templates,
  the AI audit runner, the design-document tree editor (the document becomes the project's notes).

**Data**
- A v1 `.local/workspace.json` is converted on first start; the original is kept as `workspace.v1.json`.
