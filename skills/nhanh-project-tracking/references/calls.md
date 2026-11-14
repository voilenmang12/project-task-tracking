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

Document branches: `documents.get` returns `sections` alongside aggregate Markdown. Each node has id/title/content/parentId/order. Every root branch is exported to its own Markdown file, with descendants in the same file. Use `documents.section.create` ({projectId,title,content,parentId}), `.update` ({projectId,sectionId,title,content}), `.move` ({projectId,sectionId,parentId,index}) or `.delete` ({projectId,sectionId}) with current expectedRevision. Prefer these tools over whole-document replacement to preserve stable IDs and branch file paths.

## Section edit examples (server v1.2.0+)

Read `documents.get` with `{projectId}` first. The result includes `sections`; find the intended section ID from that result rather than guessing it from its title or file path.

Create a root branch using `documents.section.create`:

```json
{"arguments":{"projectId":"PROJECT_ID","parentId":null,"title":"Combat system","content":"Purpose and acceptance criteria."},"options":{"actor":"codex-game","expectedRevision":42,"requestId":"combat-design-root-v1"}}
```

Create a child with the returned root ID as parentId. For ordinary edits, `content` is the selected section's own body, not its descendants or title. Use child sections for structural headings; do not duplicate the section title as a Markdown heading in content.

Rename/update using `documents.section.update`:

```json
{"arguments":{"projectId":"PROJECT_ID","sectionId":"SECTION_ID","title":"Combat rules","content":"Decisions, constraints and verifiable outcomes."},"options":{"actor":"codex-game","expectedRevision":43,"requestId":"combat-rules-edit-v1"}}
```

Both revisions above are examples: use the real current revision from the server. Read the document again after edits and check that unrelated sections and parent links remain intact. Deleting a section deletes all descendants; inspect the subtree first and only delete when within the requested scope. Moving a root under another section archives its former root file; its stable section ID survives.

If live `tools` discovery lacks `documents.section.*`, the server is older than this skill. Update/restart the service from v1.2.0 or later before using section workflows; do not silently fall back to replacing the full document.
