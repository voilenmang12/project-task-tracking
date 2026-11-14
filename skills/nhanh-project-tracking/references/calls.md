# Calls and retries

Run the CLI using its absolute path inside the skill folder. Input via `--file <json-file>` or `--stdin`; avoid interpolating task/document text into shell commands.

```json
{
  "arguments": {"projectId":"PROJECT_ID"},
  "options": {"actor":"codex-product"}
}
```

Use this envelope with `projects.get`. Reads return `{revision,result}`. The `tools` command requires no input and returns the live schemas; prefer those over memorized argument lists.

Create a phase with `tasks.create`:

```json
{
  "arguments": {"projectId":"PROJECT_ID","id":"phase-prototype","title":"Playable prototype","notes":"Complete playable loop; restart works","tagIds":["prototype"]},
  "options": {"actor":"codex-product","requestId":"prototype-phase-v1"}
}
```

Create a child by adding `parentId: phase-prototype`. Client IDs are optional; if omitted the server generates one. Record the returned ID.

Claim work with `tasks.claim`:

```json
{"arguments":{"taskId":"TASK_ID","leaseMinutes":30},"options":{"actor":"codex-product"}}
```

Update after reading the latest revision:

```json
{
  "arguments": {"taskId":"TASK_ID","status":"blocked","blockedReason":"Missing approved assets","notes":"Movement implemented; collision tests pass; asset integration remains"},
  "options": {"actor":"codex-product","expectedRevision":42,"requestId":"TASK_ID-blocker-1"}
}
```

Use `tasks.complete` with `{taskId,done:true}` only when the whole branch is verified. Status values are todo/in_progress/blocked/done. Document replacement uses `documents.set` with `{projectId,document}` and current expectedRevision. Never make a blind document replacement from an old snapshot.

The service serializes mutations. `requestId` deduplication is scoped by actor and retains the latest 1,000 receipts. After a timeout retry the same request/ID; after a 409 revision conflict, read current state, reconcile, then retry with its revision and the same ID if content is unchanged. A different mutation gets a different ID. Do not retry forever.

CLI exit 1 means error; JSON error is on stderr. HTTP errors: 400 invalid input, 403 invalid session/origin, 404 unknown entity/tool, 409 conflict, 428 missing expectedRevision. Connection failure means no server access, not that project data is empty.

Audits: `audit.start` arguments `{projectId,mode:"agy"|"codex"|"both",instruction}`; returns a job. `audit.list` returns job history with running/ready/failed/cancelled/interrupted status. `audit.apply` requires projectId, runId and current expectedRevision. Review findings and check that the saved document is still current. Unlike ordinary tools, audit start/list return jobs directly rather than a revision/result envelope.
