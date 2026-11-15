# Agent workflow

The workflow for agents is the skill: [SKILL.md](../skills/nhanh-project-tracking/SKILL.md) (connect, the loop,
which action for which situation) and [rules.md](../skills/nhanh-project-tracking/references/rules.md) (what is
tracked, how to set up a plan, work added on the way, reports, several agents, audits).

In short: `digest` at the start of a session; `plan.apply` when the project has no plan; `task.start`,
`task.progress`, `task.done` with evidence around each task of size M or L; `task.add` with a reason for work
found on the way; `task.ask` for the user's decisions; `task.block` when stuck.
