# Audit rules for project agents

Audit inside the agent's current project workflow. The web UI is only for the human task tree and design document; it has no AI audit controls.

## Evidence to read

Read `projects.get` for the saved document, tasks, tags, progress and revision. Read relevant implementation and tests in the target repository when available. `audit.check` is an optional deterministic check for missing descriptions and blockers, not a replacement for reasoning about the design.

## Review criteria

- Scope: target users/players, problem, core experience, MVP and out-of-scope items are explicit. Identify unresolved decisions without inventing requirements.
- Design: workflows, core systems, dependencies, technical constraints and acceptance criteria agree. Point out concrete contradictions or missing decisions.
- Roadmap: phases produce testable outcomes and follow dependencies. Task branches cover the approved scope without duplicate work or unrelated expansion.
- Execution: each actionable task has clear completion criteria. Status, blockers and completion claims match code/test evidence; distinguish unfinished implementation from unfinished validation.
- Progress: use `progress.get`; root tasks have equal weight. Do not inflate progress by checking off planning tasks or splitting only completed work.

## Record the result

Report findings with the affected document section/task ID, evidence, impact and suggested correction. Distinguish confirmed issues, assumptions and questions for the user. Do not claim the whole project passed if code or tests were unavailable.

Within the user's authorized scope, create missing tasks, attach tags or update notes through the API. Preserve existing task IDs, completed work and human edits. Use the current expectedRevision for guarded writes; reconcile conflicts. Save document changes only after resolving ambiguities that materially change scope. Never mark an implementation task complete merely because the audit is finished.

When implementation is needed, work in the target repository, claim the task, run relevant checks and record actual evidence. Auditing alone does not implement code.

## Optional second-agent review

Only when a separate review is useful or requested, use the existing `audit.start/list/cancel/apply` API workflow. Do not launch a second AI audit routinely from an already-running agent. Review proposals and document freshness before applying them. These API tools remain available for compatibility; there is no corresponding UI action.

Use authorized agy/Codex sessions for AI work. Do not use Gemini/Google API keys outside TTS.
