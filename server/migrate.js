// Convert a tracker v1 workspace (a personal to-do tree) into version 2. Nothing is lost on disk: the store keeps
// the v1 file as workspace.v1.json. Dropped here because v2 has no place for them: ideas, base64 attachments,
// the tag colours, claims and the v1 audit runs.
import { emptyWorkspace } from '../shared/model.js';

/** Tracker 2.0 data has no flows (2.2.0). Adds the empty list; nothing else changes. Returns null when not needed. */
export function addFlows(w) {
  if (Array.isArray(w.flows)) return null;
  return { ...w, flows: [] };
}

export function migrateV1(v1) {
  const w = emptyWorkspace();
  const tagName = new Map([...(v1.tagCatalog || []), ...(v1.customTags || [])].map((t) => [t.id, t.name]));
  const now = new Date().toISOString();

  for (const p of v1.projects) {
    w.projects.push({
      id: p.id,
      title: p.title,
      description: p.description || '',
      repo: '',
      stage: 'production',
      brief: p.designDocument || '',
      archived: false,
      createdAt: p.createdAt || now,
    });
  }
  const hasChildren = new Set(v1.tasks.map((t) => t.parentId).filter(Boolean));
  for (const t of v1.tasks) {
    const group = hasChildren.has(t.id);
    const status = t.done ? 'done' : t.status === 'in_progress' ? 'doing' : t.status === 'blocked' ? 'blocked' : 'todo';
    w.tasks.push({
      id: t.id,
      projectId: t.projectId,
      parentId: t.parentId ?? null,
      order: t.order,
      kind: group ? 'group' : 'task',
      title: t.title,
      description: t.notes || '',
      size: null,
      labels: (t.tagIds || []).map((id) => tagName.get(id) || id),
      status: group ? 'todo' : status,
      criteria: [],
      owner: null,
      agent: null,
      branch: '',
      evidence: null,
      summary: '',
      question: null,
      blockedReason: t.blockedReason || '',
      origin: 'plan',
      reason: '',
      ack: true,
      createdBy: 'migration',
      createdAt: t.createdAt || now,
      updatedAt: t.updatedAt || t.createdAt || now,
      startedAt: null,
      doneAt: t.done ? t.updatedAt || now : null,
    });
  }
  for (const p of w.projects) {
    w.seq += 1;
    w.events.push({ id: w.seq, at: now, actor: 'migration', projectId: p.id, taskId: null, type: 'project', text: 'Migrated from tracker v1' });
  }
  return w;
}
