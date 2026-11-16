# v2.8.0 — MCP server for agents

**New**
- `skills/nhanh-project-tracking/scripts/nhanh-mcp.mjs`: an MCP server over stdio (JSON-RPC 2.0, protocol
  2025-06-18, 2025-03-26 or 2024-11-05), no dependencies. Each action an agent may call is a tool (`task.start` as
  `task_start`) with its JSON Schema and a read-only hint; actions only the user or the tracker calls are not
  served. Results are the CLI's short texts; the tracker's refusals (409, 423, criteria, evidence) come back as tool
  errors the agent reads.
- The actor and the project come from `--actor`/`--project`, `NHANH_ACTOR`/`NHANH_PROJECT`, or the `tracker` block
  of `project.yaml` in the folder the client starts it in; then `projectId` is optional. Without an actor, reads
  work and writes say how to set one. When the tracker does not answer (or is older than 2.8.0), the tools are
  listed from `scripts/actions.json` and each call says the tracker is not answering.
- `/api/actions` gives each action its `audience` (agent, user, tracker) and a JSON Schema; `nhanh actions` marks
  user-only ones. `npm run skill:actions` writes `actions.json`; a test fails while it is out of date.
- Tracker runs talk to the tracker through their own MCP server, `nhanh-run` (writing as `run-<n>`, project set);
  the CLI stays pre-approved as a fallback.
- The CLI's HTTP client and text views moved to `scripts/client.mjs` and `scripts/text.mjs`, shared with the MCP
  server. Skill 2.7.0: the MCP tools are the preferred way in.

Checked with Claude Code 2.1.308: `--mcp-config` with this server, `mcp__nhanh__digest` answered, 28 tools listed.
