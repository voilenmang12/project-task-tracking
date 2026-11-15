# Rules: the plan, added work, reports

## 1. What is tracked

| Work | In the tracker |
|---|---|
| **S**: one value, a text, a colour, a one-file fix | no task. One `project.log` line after it is done, with the commit. |
| **M**: a feature, a screen, an asset set | one task. `task.start` → `task.progress` → `task.done`. |
| **L**: a goal, a rework, an audit, anything with a checklist | one task whose checklist items are its criteria (up to about 7) or, when the items are pieces of work of their own, its sub-tasks. |
| A try (`try/<slug>` branch) | the task stays `doing`; `task.ask` "keep or drop?" with both as `options`. |

A project uses its own sizes if it defines them; otherwise S is under an hour, M is a session, L is several.

## 2. Set up the plan (`plan.apply`)

Do this once, when the digest says `NO PLAN YET`, and again each time a milestone is reached.

**Read first:** the project's brief or GDD, its milestone or roadmap file if it has one, and the state of the
repository (what already exists and works). The plan describes the work that is left, not the history: work
already finished goes in as one done task per milestone at most, closed with `task.done` and the evidence that
exists.

**Shape:**

- **Groups are milestones**: 3 to 7 outcomes the user would recognise, in the order they will be reached
  ("M1 · Core loop playable", "M2 · All screens", "M3 · First release"). Not disciplines ("Art", "Code"), not
  weeks.
- **Tasks are units of work**: one branch, one session or goal, one result the user can see or a test can show.
  Each has a `size` and 1 to 5 `criteria`.
- **Criteria are observable facts**, written so that anyone can say yes or no: "The shop's Buy button spends gold
  and the counter updates", "EditMode tests pass", "Initial download ≤ 50 MB". Not activities ("implement the
  shop"), not qualities ("clean code").
- **Detail the current milestone, sketch the rest.** The milestone in work gets its real tasks. Later milestones
  get a few L tasks naming their outcomes; they are split when reached. A plan with more than about 40 open tasks
  is too detailed to stay true.
- **Depth:** group → task → sub-task. A fourth level means the task above is really a milestone.
- **Ids are stable and readable** (`m1-core`, `shop-popup`): `plan.apply` matches on them, so the same file can be
  applied again after an edit. Titles may change; ids never do.
- **No filler.** No "research", "planning", "review" or "testing" tasks on their own: they are part of the task
  they serve, or a criterion of it. A task that produces a document names the document.

**Never** in a plan: steps of how to do a task (that is your working checklist, not the user's plan), S-sized
items, anything the brief does not ask for.

Send it as a file: `nhanh plan.apply --file plan.json --actor <actor>`.

```json
{
  "projectId": "cg01-mortalbound",
  "note": "First plan, from GDD v0.5 and the state of main on 2026-11-16",
  "nodes": [
    {"id": "m1-core", "title": "M1 · Core loop playable", "children": [
      {"id": "life-events", "title": "Life events system", "size": "L",
       "description": "Yearly events from a weighted table (GDD section 4).",
       "criteria": ["An event fires every in-game year", "Weights come from the data table", "EditMode tests pass"]},
      {"id": "save-load", "title": "Save and load", "size": "M", "criteria": ["A run survives a page reload"]}
    ]},
    {"id": "m2-release", "title": "M2 · First release", "children": [
      {"id": "webgl-build", "title": "WebGL build within the portal limits", "size": "L"}
    ]}
  ]
}
```

Then tell the user, in your closing message, how many milestones and tasks the plan has and what you left coarse.

## 3. Work added on the way

The plan is the user's picture of the scope. Changing it silently makes the progress number a lie, so every
addition says where it came from.

| What you found | What to do |
|---|---|
| A check the current task needs that nobody wrote down | `task.progress` with `addCriteria`. No new task. |
| A separate piece of work without which the current task cannot be done (a bug in the way, a missing helper) | `task.add` under the same parent, `reason` = what revealed it. Do it now; it is in scope. |
| Something worth doing, not needed now (a refactor, a nice-to-have, a bug elsewhere) | `task.add` with `reason`, leave it `todo`. Do not start it in this task. |
| Something outside what the brief or GDD asks for (a new feature, a bigger scope) | `task.add` with `reason`, leave it `todo`, and `task.ask` on it: "Not in the GDD. Add it to scope?" Do not start it before the answer. |
| An L task that is too big to report on | When you start it, add its sub-tasks (`plan.apply` with the same id and `children`, or `task.add` with `reason: "Split of <id>"`). The parent closes with `task.done` after them. |
| A planned task that is no longer needed | `task.drop` with the reason. Never delete, never retitle it into something else. |

A task added by an agent is marked as such in the UI with its reason. More than a few per session means the plan
was too coarse: say so, and re-detail the milestone with `plan.apply`.

## 4. Reports

The journal is the report. Each entry is read by the user later, without the conversation, so it must stand alone.

- **`task.start`**: `branch`, and `agent` when a specialist does the work.
- **`task.progress`**: at each finished step. `note` = what is now true, in one line ("Event table loads from CSV;
  the yearly tick fires one event"), not what you did ("edited EventSystem.cs"). `check` = the criteria it meets.
- **`task.ask`**: the decision alone, the options, and the default you continue with: "The Hub fits 4 or 6
  buttons; 6 needs a 14 px font. I continue with 4."
- **`task.block`**: what is missing, and what or who unblocks it: "The WebGL build fails: the portal SDK is not in
  Packages/. Needs the SDK zip from the developer portal (sign-in)."
- **`task.done`**:
  - `summary`: what is now true for the player or the project, 1 to 3 sentences, and anything left out.
  - `evidence`: the facts that prove it. `commit` = the merge commit on the main branch; `tests` = which suite and
    the count ("EditMode 14 passed"); `report` = the path of the report file; `screenshots` = the folder or files;
    `notes` = anything else checked by hand. M and L need at least one; give all that exist.
  - `check`: the criteria met now. One that is not met: `unmet` with the reason, never a silent tick.
- **`project.log`**: S changes ("Gold counter colour on the Hub, commit 1a2b3c4") and session notes worth keeping.

Before the session ends: run `nhanh digest <projectId>` once more. Nothing of yours stays `doing` unless work
really continues; an open question or a blocked task also goes in your closing message, since the user may read
that first.

## 5. Several agents

- **One writer per task.** The session that started a task records everything about it. Specialists it spawns
  (subagents) return their result to it; it writes the progress with `agent=<specialist>`.
- **Parallel sessions** in one project each take their own task and their own actor name. Two tasks that touch
  the same files are not taken at the same time: the second waits or takes another.
- **Team work** (one orchestrator, several specialists on one feature): the feature is the task; each specialist's
  piece is a sub-task with `agent` set, started and closed by the orchestrator as the pieces come back.
- **Handover:** `task.release` with a note of what is done and what is next, or leave it `doing` with a last
  `task.progress` when the same actor resumes in the next session. A task found `doing` under another actor for
  more than a day with no entry is abandoned: `task.start` with `takeover=true` and say so in the note.

## 6. Auditing a project

Asked to audit or review a project's tracking: read `nhanh tree <projectId>`, the journal (`events.list`) and the
repository, then report, per finding, the item id, the evidence and the correction. Check that done tasks have
evidence that still holds (the commit exists, the tests still pass), that `doing` tasks are really in work, that
criteria are observable, that open tasks still match the brief, and that nothing the repository contains is
missing from the plan. Fix the tracker through the actions (`task.reopen`, `task.drop`, `task.add`,
`plan.apply`); never by editing its files.
