# Shared design document standard

Use this structure for new game/product design documents. Existing documents may keep equivalent headings and established terminology; do not replace or duplicate their content merely to match names.

- In aggregate design.md, H1 names the project and H2 names each root branch. In each branch file, H1 names that branch.
- H2 (`##`) identifies a main section; H3–H6 define child sections. Do not skip heading levels in newly written content.
- Use descriptive, unique sibling titles. Markdown imports derive sections from headings; the saved UI tree uses stable section IDs. Selecting a section previews it and its descendants. Fenced code examples are not outline entries.
- Each substantive design section states its purpose, decisions/rules, constraints and verifiable outcomes. Mark unknowns as questions or assumptions, not confirmed requirements.

## Main sections

1. Tổng quan & tầm nhìn: problem, value, vision.
2. Người dùng & bối cảnh: audience, needs, usage scenarios.
3. Phạm vi: MVP and explicit exclusions.
4. Trải nghiệm & luồng chính: input → action → outcome, errors and exceptions.
5. Thiết kế hệ thống: components/data plus business/gameplay rules and technical constraints.
6. Tiêu chí nghiệm thu: observable conditions, checks and expected results.
7. Roadmap & phụ thuộc: phase outcomes, dependencies, links to existing task IDs.
8. Rủi ro & câu hỏi mở: risks, assumptions, unresolved decisions and how to resolve them.
9. Nhật ký quyết định: date, decision, rationale and effect on scope/tasks.

## Updating documents

Read the current saved document before edits. Retain unrelated sections. Keep agreed names, task IDs and decisions unless the user asks to change them. Update the decision log for meaningful design changes. Prefer `documents.section.*` with current expectedRevision; reconcile conflicts rather than replacing someone else's edits. Use `documents.set` only for an intentional whole-document replacement.

The UI always shows a content editor alongside its Markdown preview. Changes are drafts until Save. The “Bổ sung mục chuẩn” action appends missing exact-title sections; review semantic overlaps in older documents before saving. Imported text without headings is preserved in a Giới thiệu section. Toàn bộ tài liệu is a read-only aggregate view.

## Branch files and UI editing

Each top-level document branch is a separate `.md` file in `.local/projects/<project-hash>/documents/`. The filename is derived from a stable section ID, not the title, so renaming does not break file references. `index.json` maps files to titles/IDs and contains the exact section hierarchy. Removed/moved root-file exports are archived. `design.md` remains the generated aggregate for reading the entire project.

Sections have independent ID, parentId, order, title and Markdown content. Use `documents.get` to read both aggregate text and sections. Prefer `documents.section.create/update/move/delete` with expectedRevision for edits that must preserve section identities. `documents.set` replaces and reparses the entire document, so section IDs can change. Do not directly edit generated files; the local workspace is the source of truth.

The UI supports adding roots/children/siblings, editing titles inline or in the selected section, editing content with a live adjacent preview, moving in/out one level, and deleting subtrees with local undo. Enter in a tree title creates a sibling; Tab/Shift+Tab change depth. The root preview shows descendants; the editor edits only the selected section's own content. Saving writes all affected branch files and the aggregate.

Prefer at most five section depths below the project title for readable Markdown. Deeper UI trees retain their hierarchy in section data/index.json; Markdown heading depth is capped at H6. Do not infer exact deep-tree parentage solely from a compiled Markdown file.
