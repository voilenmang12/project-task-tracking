# v1.1.0 — Local agent workflow & reusable skill

Nhánh is now a localhost API and web workspace for people and agents to manage the same projects.

- Installable `nhanh-project-tracking` skill with a portable, dependency-free Node.js CLI, Codex metadata and agent workflow references.
- Local tools for project/document/task/tag management, nested tasks, claims with expiring leases, blockers, progress and activity.
- Serialized writes, revision checks, retry deduplication and human/agent field merging.
- Standalone `npm start` serves API and built UI. Existing private workspace data stays local.
- Project/document/task audit through agy and Codex remains available.
- Agent chat and cloud deployment configuration removed; the former hosted project has been removed.

## Install the skill

Download `nhanh-project-tracking-v1.1.0.zip`, verify with `SHA256SUMS.txt`, and extract the `nhanh-project-tracking` folder into your agent's skills directory. For Codex use `$CODEX_HOME/skills` or `~/.codex/skills`, then start a new agent session.

From a source checkout: `node scripts/install-skill.mjs`. A custom parent directory is supported via `--target`; existing installs are not overwritten.

For agy, point the agent to the extracted `SKILL.md` if automatic discovery is not configured. Supply the intended Nhánh projectId and a stable actor. The ZIP includes the client, not a running server.

## Run the service

Node.js 22.12+ or 24+: `npm ci`, `npm run build`, `npm start`. Open http://127.0.0.1:5173. API and agent must run on the same host; loopback is not automatically reachable from a remote container.

## Validation

Skill validator passed; portable installed CLI tested against the local service; all 18 tests passed including an external CLI process calling HTTP and writing an isolated project; frontend build passed. The ZIP uses an explicit five-file allowlist and includes no private workspace data.
