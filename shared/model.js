// Pure data model of the tracker, shared by the server and the web UI. No I/O here.
//
// A workspace holds projects, a tree of items per project, and a journal of events.
// An item is a `group` (a milestone or phase: it only holds other items) or a `task` (one unit of work that one
// agent session starts, reports on and closes with evidence).

export const STATUSES = ['todo', 'doing', 'blocked', 'done', 'dropped'];
export const SIZES = ['S', 'M', 'L'];
export const KINDS = ['group', 'task'];
export const ORIGINS = ['plan', 'user', 'agent'];
export const HUMAN = 'human';

// Relative weight of a task in progress numbers. An unsized task counts as M.
const WEIGHT = { S: 1, M: 3, L: 8 };
export const weightOf = (task) => WEIGHT[task.size] ?? WEIGHT.M;

export const emptyWorkspace = () => ({ version: 2, seq: 0, projects: [], tasks: [], events: [], receipts: [] });

export function childrenOf(tasks, parentId, projectId) {
  return tasks
    .filter((t) => t.parentId === parentId && (projectId === undefined || t.projectId === projectId))
    .sort((a, b) => a.order - b.order);
}

export function descendantIds(tasks, id) {
  const found = new Set();
  const stack = [id];
  while (stack.length) {
    const current = stack.pop();
    for (const t of tasks) {
      if (t.parentId === current && !found.has(t.id)) {
        found.add(t.id);
        stack.push(t.id);
      }
    }
  }
  return found;
}

/** True when the task waits for the user: an open question, or blocked. */
export const needsUser = (task) => Boolean(task.question && !task.question.answer) || task.status === 'blocked';

/** True when the user wrote something the agents have not picked up yet. */
export const needsAgent = (task) =>
  task.kind === 'task' && !task.ack && (task.origin === 'user' || Boolean(task.question?.answer)) &&
  task.status !== 'done' && task.status !== 'dropped';

/**
 * Progress and status of every item, bottom-up.
 * A task: 1 when done; while doing, the share of its criteria ticked (capped at 0.9, so only `done` reaches 100%).
 * A group: the weighted mean of its children; dropped items do not count. Its status is derived from them.
 * Returns { [id]: { progress: 0..1, weight, status, counts } }.
 */
export function rollup(tasks) {
  const byParent = new Map();
  for (const t of tasks) {
    if (!byParent.has(t.parentId)) byParent.set(t.parentId, []);
    byParent.get(t.parentId).push(t);
  }
  const out = {};
  const visit = (t) => {
    const kids = byParent.get(t.id) || [];
    if (!kids.length) {
      let progress = 0;
      if (t.status === 'done') progress = 1;
      else if (t.status === 'doing' || t.status === 'blocked') {
        const total = t.criteria?.length || 0;
        progress = total ? Math.min(0.9, t.criteria.filter((c) => c.done).length / total) : 0;
      }
      const counted = t.status !== 'dropped' && t.kind === 'task';
      out[t.id] = {
        progress,
        weight: counted ? weightOf(t) : 0,
        status: t.kind === 'group' ? 'todo' : t.status,
        counts: counted ? { [t.status]: 1 } : {},
      };
      return out[t.id];
    }
    let weight = 0;
    let sum = 0;
    const counts = {};
    for (const kid of kids) {
      const r = visit(kid);
      weight += r.weight;
      sum += r.progress * r.weight;
      for (const [k, v] of Object.entries(r.counts)) counts[k] = (counts[k] || 0) + v;
    }
    // A task that has sub-tasks is finished only by its own `done`; its number still follows its children.
    const own = t.kind === 'task' ? t.status : null;
    let status = 'todo';
    if (own === 'done' || own === 'dropped') status = own;
    else if (counts.blocked || own === 'blocked') status = 'blocked';
    else if (counts.doing || own === 'doing') status = 'doing';
    else if (weight > 0 && !counts.todo && !counts.blocked && !counts.doing) status = 'done';
    else if (counts.done) status = 'doing';
    const progress = own === 'done' ? 1 : weight ? sum / weight : 0;
    out[t.id] = { progress, weight: own === 'dropped' ? 0 : weight || (t.kind === 'task' ? weightOf(t) : 0), status, counts };
    return out[t.id];
  };
  for (const root of byParent.get(null) || []) visit(root);
  return out;
}

/** One project's numbers for the dashboard and the agents' digest. */
export function projectSummary(workspace, projectId) {
  const tasks = workspace.tasks.filter((t) => t.projectId === projectId);
  const roll = rollup(tasks);
  let weight = 0;
  let sum = 0;
  for (const root of tasks.filter((t) => t.parentId === null)) {
    weight += roll[root.id].weight;
    sum += roll[root.id].progress * roll[root.id].weight;
  }
  const work = tasks.filter((t) => t.kind === 'task');
  const counts = Object.fromEntries(STATUSES.map((s) => [s, work.filter((t) => t.status === s).length]));
  const lastEvent = workspace.events.filter((e) => e.projectId === projectId).at(-1);
  return {
    progress: weight ? sum / weight : 0,
    counts,
    doing: work.filter((t) => t.status === 'doing').map((t) => ({ id: t.id, title: t.title, owner: t.owner, agent: t.agent })),
    needsUser: work.filter(needsUser).length,
    needsAgent: work.filter(needsAgent).length,
    lastEventAt: lastEvent?.at ?? null,
  };
}

/** The next tasks an agent should take: open, unowned leaves in tree order, user requests first. */
export function nextTasks(workspace, projectId, limit = 5) {
  const tasks = workspace.tasks.filter((t) => t.projectId === projectId);
  const ordered = [];
  const walk = (parentId) => {
    for (const t of childrenOf(tasks, parentId)) {
      ordered.push(t);
      walk(t.id);
    }
  };
  walk(null);
  const hasOpenChild = (t) => tasks.some((c) => c.parentId === t.id && c.status !== 'done' && c.status !== 'dropped');
  const open = ordered.filter((t) => t.kind === 'task' && t.status === 'todo' && !hasOpenChild(t));
  return [...open.filter((t) => t.origin === 'user'), ...open.filter((t) => t.origin !== 'user')].slice(0, limit);
}

const isText = (v, max) => typeof v === 'string' && v.length <= max;

/** Throws on a workspace that the server must not write. */
export function validateWorkspace(w) {
  const bad = (why) => {
    throw Error(`Invalid workspace: ${why}`);
  };
  if (!w || w.version !== 2) bad('version');
  for (const key of ['projects', 'tasks', 'events', 'receipts']) if (!Array.isArray(w[key])) bad(key);
  const projects = new Set();
  for (const p of w.projects) {
    if (!isText(p.id, 100) || !p.id || projects.has(p.id) || !isText(p.title, 200) || !p.title.trim()) bad(`project ${p?.id}`);
    projects.add(p.id);
  }
  const byId = new Map();
  for (const t of w.tasks) {
    if (!isText(t.id, 100) || !t.id || byId.has(t.id)) bad(`task id ${t?.id}`);
    if (!projects.has(t.projectId)) bad(`task ${t.id}: project`);
    if (!isText(t.title, 300) || !t.title.trim()) bad(`task ${t.id}: title`);
    if (!KINDS.includes(t.kind) || !STATUSES.includes(t.status) || !ORIGINS.includes(t.origin)) bad(`task ${t.id}: kind/status/origin`);
    if (t.size != null && !SIZES.includes(t.size)) bad(`task ${t.id}: size`);
    if (!Number.isFinite(t.order) || !Array.isArray(t.criteria)) bad(`task ${t.id}: order/criteria`);
    byId.set(t.id, t);
  }
  for (const t of w.tasks) {
    const seen = new Set([t.id]);
    let p = t;
    while (p.parentId !== null) {
      const parent = byId.get(p.parentId);
      if (!parent || parent.projectId !== t.projectId || seen.has(parent.id)) bad(`task ${t.id}: tree`);
      seen.add(parent.id);
      p = parent;
    }
  }
  return w;
}
