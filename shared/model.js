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
export const FLOW_STATUSES = ['draft', 'running', 'paused'];
export const AFTER_MODES = ['all', 'any'];
// A run is one Claude Code session the tracker starts for a task or a flow (server/runner.js).
// "unfinished": the session ended normally but its task or flow is not done (blocked, a question, a refusal).
export const RUN_STATUSES = ['queued', 'running', 'stopping', 'done', 'unfinished', 'failed', 'stopped', 'interrupted'];
export const ACTIVE_RUN = ['queued', 'running', 'stopping'];

// Relative weight of a task in progress numbers. An unsized task counts as M.
const WEIGHT = { S: 1, M: 3, L: 8 };
export const weightOf = (task) => WEIGHT[task.size] ?? WEIGHT.M;

export const emptyWorkspace = () => ({ version: 2, seq: 0, projects: [], tasks: [], flows: [], runs: [], events: [], receipts: [] });

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

const ancestorsOf = (tasks, task) => {
  const out = [];
  for (let p = tasks.find((t) => t.id === task.parentId); p; p = tasks.find((t) => t.id === p.parentId)) out.push(p);
  return out;
};

/** True when an item no longer holds anything up: a done or dropped task, or a group whose tasks all are. */
export function finished(tasks, item) {
  if (!item || item.status === 'dropped') return true;
  if (item.kind === 'task' && item.status !== 'done') return false;
  const below = descendantIds(tasks, item.id);
  return tasks.every((t) => !below.has(t.id) || t.kind !== 'task' || t.status === 'done' || t.status === 'dropped');
}

/**
 * The predecessors an item still waits for ("after" arrows), its own and those of the groups above it.
 * mode "all": every predecessor must be finished; "any": one is enough. [] when it may start.
 */
export function waitingOn(tasks, task) {
  const out = [];
  for (const holder of [task, ...ancestorsOf(tasks, task)]) {
    const after = (holder.after || []).map((id) => tasks.find((t) => t.id === id)).filter(Boolean);
    if (!after.length) continue;
    const open = after.filter((p) => !finished(tasks, p));
    if (holder.afterMode === 'any' ? open.length === after.length : open.length) out.push(...open.map((p) => p.id));
  }
  return [...new Set(out)];
}

/**
 * True when the "after" arrows of a project can never all be met: an item that, through its arrows, the arrows of
 * the groups above it and the items a group holds, ends up waiting for itself.
 */
export function hasDeadlock(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const requires = (t) => {
    const out = [...(t.after || [])];
    for (const a of ancestorsOf(tasks, t)) out.push(...(a.after || []));
    for (const c of tasks) if (c.parentId === t.id) out.push(c.id);
    return out.filter((id) => byId.has(id));
  };
  const state = new Map(); // 1 = on the path, 2 = done
  const visit = (id) => {
    if (state.get(id) === 1) return true;
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    for (const next of requires(byId.get(id))) if (visit(next)) return true;
    state.set(id, 2);
    return false;
  };
  return tasks.some((t) => visit(t.id));
}

/** True when an agent proposed the item and the user has not approved it yet. Agents do not start it meanwhile. */
export const awaitingReview = (task) => task.review === 'pending' && task.status !== 'done' && task.status !== 'dropped';

/** True when the task waits for the user: an open question, blocked, or proposed and not reviewed yet. */
export const needsUser = (task) =>
  Boolean(task.question && !task.question.answer) || task.status === 'blocked' || awaitingReview(task);

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
    awaitingReview: tasks.filter(awaitingReview).length,
    running: (workspace.runs || []).filter((r) => r.projectId === projectId && ACTIVE_RUN.includes(r.status)).length,
    lastEventAt: lastEvent?.at ?? null,
  };
}

/**
 * The next tasks an agent should take: open, unowned leaves in tree order, user requests first. Leaves out what
 * still waits for its predecessors, and what a running flow has given to another actor.
 */
export function nextTasks(workspace, projectId, limit = 5, actor = null) {
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
  const pendingIds = new Set(tasks.filter(awaitingReview).map((t) => t.id));
  const underReview = (t) => {
    for (let p = t; p; p = tasks.find((x) => x.id === p.parentId)) if (pendingIds.has(p.id)) return true;
    return false;
  };
  const reserved = reservedByFlows(workspace, projectId, actor);
  const open = ordered.filter((t) => t.kind === 'task' && t.status === 'todo' && !hasOpenChild(t) && !underReview(t) &&
    !waitingOn(tasks, t).length && !reserved.has(t.id));
  return [...open.filter((t) => t.origin === 'user'), ...open.filter((t) => t.origin !== 'user')].slice(0, limit);
}

const isText = (v, max) => typeof v === 'string' && v.length <= max;

/** Throws on a workspace that the server must not write. */
export function validateWorkspace(w) {
  const bad = (why) => {
    throw Error(`Invalid workspace: ${why}`);
  };
  if (!w || w.version !== 2) bad('version');
  for (const key of ['projects', 'tasks', 'flows', 'runs', 'events', 'receipts']) if (!Array.isArray(w[key])) bad(key);
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
    if (t.after !== undefined && (!Array.isArray(t.after) || t.after.some((id) => byId.get(id)?.projectId !== t.projectId || id === t.id))) bad(`task ${t.id}: after`);
    if (t.afterMode !== undefined && !AFTER_MODES.includes(t.afterMode)) bad(`task ${t.id}: afterMode`);
    const seen = new Set([t.id]);
    let p = t;
    while (p.parentId !== null) {
      const parent = byId.get(p.parentId);
      if (!parent || parent.projectId !== t.projectId || seen.has(parent.id)) bad(`task ${t.id}: tree`);
      seen.add(parent.id);
      p = parent;
    }
  }
  const flows = new Set();
  for (const f of w.flows) {
    if (!isText(f.id, 100) || !f.id || flows.has(f.id) || !projects.has(f.projectId) || !isText(f.title, 200)) bad(`flow ${f?.id}`);
    if (!FLOW_STATUSES.includes(f.status) || !Array.isArray(f.nodes)) bad(`flow ${f.id}: status/nodes`);
    if (f.nodes.some((n) => byId.get(n.taskId)?.projectId !== f.projectId || !Number.isFinite(n.x) || !Number.isFinite(n.y))) bad(`flow ${f.id}: nodes`);
    flows.add(f.id);
  }
  for (const r of w.runs) {
    if (!isText(r.id, 100) || !projects.has(r.projectId) || !RUN_STATUSES.includes(r.status)) bad(`run ${r?.id}`);
    if (!['task', 'flow'].includes(r.target?.kind) || !isText(r.target.id, 100)) bad(`run ${r.id}: target`);
  }
  return w;
}

// ---- flows ------------------------------------------------------------------------------------------------------
// A flow is a canvas of items (tasks or whole groups) joined by "after" arrows, that the user hands to one agent to
// run in order. The arrows belong to the items, so they hold everywhere; the flow adds the place of each node, the
// actor it is given to and whether it runs.

/** The leaf tasks a flow covers, in run order: nodes sorted by their arrows, then top to bottom, left to right. */
export function flowTasks(workspace, flow) {
  const tasks = workspace.tasks.filter((t) => t.projectId === flow.projectId);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const nodes = flow.nodes.filter((n) => byId.has(n.taskId));
  const inFlow = new Set(nodes.map((n) => n.taskId));
  const before = new Map(nodes.map((n) => [n.taskId, (byId.get(n.taskId).after || []).filter((id) => inFlow.has(id))]));
  const placed = new Set();
  const order = [];
  const byPlace = (a, b) => a.y - b.y || a.x - b.x;
  while (order.length < nodes.length) {
    const ready = nodes.filter((n) => !placed.has(n.taskId) && before.get(n.taskId).every((id) => placed.has(id))).sort(byPlace);
    const next = ready[0] || nodes.filter((n) => !placed.has(n.taskId)).sort(byPlace)[0]; // a loop cannot be saved, but never hangs
    placed.add(next.taskId);
    order.push(next.taskId);
  }
  const leaves = [];
  const seen = new Set();
  const addLeaves = (t) => {
    const kids = childrenOf(tasks, t.id);
    if (t.kind === 'task' && !kids.length) {
      if (!seen.has(t.id)) { seen.add(t.id); leaves.push(t); }
      return;
    }
    kids.forEach(addLeaves);
    if (t.kind === 'task' && !seen.has(t.id)) { seen.add(t.id); leaves.push(t); } // a parent task closes after its sub-tasks
  };
  for (const id of order) addLeaves(byId.get(id));
  return leaves;
}

/** A flow with its numbers: the derived status, progress, and the queue an agent works from. */
export function flowState(workspace, flow) {
  const tasks = workspace.tasks.filter((t) => t.projectId === flow.projectId);
  const all = flowTasks(workspace, flow);
  const live = all.filter((t) => t.status !== 'dropped');
  const done = live.filter((t) => t.status === 'done');
  const open = live.filter((t) => t.status !== 'done');
  const hasOpenChild = (t) => tasks.some((c) => c.parentId === t.id && c.status !== 'done' && c.status !== 'dropped');
  const runnable = (t) => t.status === 'todo' && !hasOpenChild(t) && !awaitingReview(t) && !waitingOn(tasks, t).length;
  return {
    status: live.length && !open.length ? 'done' : flow.status,
    total: live.length,
    done: done.length,
    next: open.filter(runnable),
    doing: open.filter((t) => t.status === 'doing' || t.status === 'blocked'),
    waiting: open.filter((t) => t.status === 'todo' && !runnable(t)).map((t) => ({ task: t, waitingOn: waitingOn(tasks, t) })),
  };
}

/** Task ids that a running flow keeps for its own actor, so other agents leave them alone. */
export function reservedByFlows(workspace, projectId, actor) {
  const out = new Set();
  for (const f of workspace.flows || []) {
    if (f.projectId !== projectId || f.status !== 'running' || !f.assignee || f.assignee === actor) continue;
    for (const t of flowTasks(workspace, f)) out.add(t.id);
  }
  return out;
}
