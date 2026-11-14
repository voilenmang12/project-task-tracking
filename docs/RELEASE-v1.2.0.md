# v1.2.0 — Document trees, branch files and updated agent skill

## Document workspace

- Common writing standard for game/product design documents, with a reusable section template.
- Tree navigation with editable titles and content, root/child/sibling creation, indentation/outdent, subtree deletion and local undo.
- Selected section editor and live Markdown preview stay side by side. Preview includes descendants; the editor edits the selected section's own body.
- Each root branch is exported as its own Markdown file under the private project documents directory. Stable section IDs keep filenames stable across renames; index.json maps the hierarchy. Removed root exports are archived.
- design.md remains the aggregate for whole-project reading. Existing document content is preserved on conversion.
- Fixed outline text alignment so short and wrapped titles share the same left edge.

## Agent workflow and skill

- Skill v1.2.0 includes the document writing standard and Markdown audit rules.
- Read sections/revision with documents.get. Use documents.section.create/update/move/delete with expectedRevision to preserve IDs and unrelated content.
- Whole-document documents.set is reserved for deliberate replacement/import because it reparses section identities.
- AI audit controls removed from the web UI. Agents audit within their workflow; existing audit APIs remain available for optional separate review.

## Install / upgrade

Download nhanh-project-tracking-v1.2.0.zip and verify SHA256SUMS.txt. Extract the nhanh-project-tracking folder into your agent's skills directory. For Codex use $CODEX_HOME/skills or ~/.codex/skills, then open a new agent session. For agy, point the agent at SKILL.md when automatic discovery is not configured.

From source: node scripts/install-skill.mjs. The installer does not overwrite an existing skill: inspect/move the old installation first, preserving any local customizations.

Update the local server to this release too: stop the previous process, pull the source, run npm ci, npm run build, then npm start. Keep .local intact; no manual data reset is needed. The skill ZIP is a client, not a running server. Section tools require server v1.2.0 or later.

## Validation

23 tests passed, including branch-file persistence, stable filenames on rename, subtree move/archive, section CRUD, Markdown parsing, concurrency and HTTP/CLI workflows. Frontend build and skill validator passed. The release skill ZIP contains seven explicitly allowed files and no private project data.
