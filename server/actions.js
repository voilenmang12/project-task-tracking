// Every way to read or change the workspace, as named actions. The web UI, the CLI and the agents all go through
// `call(name, args, {actor, requestId})`; nothing else writes the data.
//
// The actions follow the life of a piece of work, so an agent never edits fields: it says what happened
// (plan.apply, task.start, task.progress, task.add, task.ask, task.block, task.done) and the tracker keeps the
// state, the journal and the numbers consistent.
import {
  AFTER_MODES, FLOW_STATUSES, HUMAN, KINDS, SIZES, awaitingReview, childrenOf, descendantIds, flowState, hasDeadlock,
  needsAgent, needsUser, nextTasks, projectSummary, rollup, waitingOn,
} from '../shared/model.js';

const MAX_EVENTS = 5000;
const MAX_RECEIPTS = 1000;
const STAGES = ['idea', 'brief', 'gdd', 'playtest', 'production', 'release', 'live'];

export class ActionError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const fail = (message, status) => {
  throw new ActionError(message, status);
};

// ---- argument checks -------------------------------------------------------------------------------------------
const S = (max = 300) => ({ type: 'string', max });
const TEXT = S(20000);
const LIST = { type: 'array' };
const BOOL = { type: 'boolean' };
const NUM = { type: 'number' };
const OBJ = { type: 'object' };
const ANY = { type: 'any' };

function checkArgs(def, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) fail('Arguments must be a JSON object');
  for (const key of Object.keys(args)) if (!def.args[key]) fail(`${def.name}: unknown argument "${key}"`);
  for (const [key, rule] of Object.entries(def.args)) {
    const value = args[key];
    if (value === undefined || value === null) {
      if (rule.required) fail(`${def.name}: "${key}" is required`);
      continue;
    }
    const type = Array.isArray(value) ? 'array' : typeof value;
    if (rule.type === 'any') continue;
    if (type !== rule.type) fail(`${def.name}: "${key}" must be ${rule.type}`);
    if (type === 'string' && (value.length > rule.max || (rule.required && !value.trim()))) {
      fail(`${def.name}: "${key}" must be non-empty text of at most ${rule.max} characters`);
    }
  }
}
const req = (rule) => ({ ...rule, required: true });

const slug = (text) =>
  text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'item';

// ---- helpers on a draft workspace ------------------------------------------------------------------------------
function makeContext(w, actor, now) {
  const project = (id) => w.projects.find((p) => p.id === id) || fail(`Project "${id}" not found`, 404);
  const task = (id) => w.tasks.find((t) => t.id === id) || fail(`Task "${id}" not found`, 404);
  const flow = (id) => w.flows.find((x) => x.id === id) || fail(`Flow "${id}" not found`, 404);
  const isHuman = actor === HUMAN;
  const log = (type, projectId, taskId, text, data) => {
    w.seq += 1;
    w.events.push({ id: w.seq, at: now, actor, projectId, taskId: taskId ?? null, type, text: text || '', ...(data ? { data } : {}) });
    if (w.events.length > MAX_EVENTS) w.events.splice(0, w.events.length - MAX_EVENTS);
  };
  const uniqueId = (wanted) => {
    let id = wanted;
    for (let n = 2; w.tasks.some((t) => t.id === id) || w.projects.some((p) => p.id === id); n += 1) id = `${wanted}-${n}`;
    return id;
  };
  const criteria = (texts, existing = []) => {
    const out = [...existing];
    for (const raw of texts || []) {
      const text = typeof raw === 'string' ? raw.trim() : '';
      if (!text || text.length > 500) fail('Each criterion is non-empty text of at most 500 characters');
      if (out.some((c) => c.text === text)) continue;
      out.push({ id: `c${out.reduce((max, c) => Math.max(max, Number(c.id.slice(1)) || 0), 0) + 1}`, text, done: false });
    }
    return out;
  };
  const newTask = (fields) => ({
    id: fields.id,
    projectId: fields.projectId,
    parentId: fields.parentId ?? null,
    order: childrenOf(w.tasks, fields.parentId ?? null, fields.projectId).length,
    kind: fields.kind,
    title: fields.title.trim(),
    description: fields.description || '',
    size: fields.kind === 'task' ? fields.size ?? null : null,
    labels: fields.labels || [],
    status: 'todo',
    criteria: criteria(fields.criteria),
    owner: null,
    agent: null,
    branch: '',
    evidence: null,
    summary: '',
    question: null,
    review: fields.review ?? null,
    origin: fields.origin,
    reason: fields.reason || '',
    ack: fields.origin !== 'user',
    createdBy: actor,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    doneAt: null,
  });
  // On a project with review on, what an agent proposes waits for the user's approval.
  const proposal = (projectId) => (!isHuman && project(projectId).review ? 'pending' : null);
  const underReview = (t) => {
    for (let p = t; p; p = p.parentId ? w.tasks.find((x) => x.id === p.parentId) : null) if (awaitingReview(p)) return p;
    return null;
  };
  // Another agent's work in progress is not ours to change. The user can always step in.
  const mine = (t, verb) => {
    if (isHuman || !t.owner || t.owner === actor || t.status !== 'doing') return;
    fail(`${verb}: task "${t.id}" is being done by ${t.owner}. Pick another task, or task.start with takeover:true if that work was abandoned.`, 409);
  };
  const tick = (t, check) => {
    if (check === undefined || check === null) return;
    const wanted = check === 'all' ? t.criteria.map((c) => c.id) : check;
    if (!Array.isArray(wanted)) fail('"check" is "all" or a list of criterion ids, numbers (1-based) or texts');
    for (const ref of wanted) {
      const c = typeof ref === 'number' ? t.criteria[ref - 1] : t.criteria.find((x) => x.id === ref || x.text === ref);
      if (!c) fail(`Criterion "${ref}" not found on task "${t.id}"`);
      c.done = true;
    }
  };
  const sizeOk = (size) => size === undefined || size === null || SIZES.includes(size) || fail(`size is one of ${SIZES.join(', ')}`);
  const kindOk = (kind) => kind === undefined || KINDS.includes(kind) || fail(`kind is one of ${KINDS.join(', ')}`);
  const labelsOk = (labels) =>
    labels === undefined || labels.every((l) => typeof l === 'string' && l.trim() && l.length <= 40) || fail('labels are short texts');
  return { w, actor, now, isHuman, project, task, flow, log, proposal, underReview, uniqueId, criteria, newTask, mine, tick, sizeOk, kindOk, labelsOk };
}

const view = (w, t, roll) => ({
  ...t, rollup: roll[t.id], needsUser: needsUser(t), needsAgent: needsAgent(t), waitingOn: waitingOn(w.tasks, t),
});

/** A flow as the UI and the agents read it: its fields, derived status, progress and queue (task ids). */
function flowView(w, f, actor) {
  const st = flowState(w, f);
  return {
    ...f,
    state: st.status,
    total: st.total,
    done: st.done,
    mine: !f.assignee || f.assignee === actor,
    next: st.next.map((t) => t.id),
    doing: st.doing.map((t) => t.id),
    waiting: st.waiting.map((x) => ({ id: x.task.id, waitingOn: x.waitingOn })),
  };
}

// ---- the actions -----------------------------------------------------------------------------------------------
const ACTIONS = [
  {
    name: 'projects.list', read: true, args: {},
    description: 'Every project with its progress, what is being done and what waits for the user.',
    run: ({ w }) => w.projects.map((p) => ({ ...p, brief: undefined, summary: projectSummary(w, p.id) })),
  },
  {
    name: 'project.get', read: true, args: { projectId: req(S(100)), events: NUM },
    description: 'One project: its fields, brief, the whole item tree with status and progress, its flows, and the latest journal entries.',
    run: ({ w, project }, a) => {
      const p = project(a.projectId);
      const tasks = w.tasks.filter((t) => t.projectId === p.id);
      const roll = rollup(tasks);
      return {
        project: p,
        summary: projectSummary(w, p.id),
        tasks: tasks.map((t) => view(w, t, roll)),
        flows: w.flows.filter((f) => f.projectId === p.id).map((f) => flowView(w, f)),
        events: w.events.filter((e) => e.projectId === p.id).slice(-(a.events ?? 50)),
      };
    },
  },
  {
    name: 'digest', read: true, args: { projectId: req(S(100)) },
    description: 'What an agent reads when a session starts: work in progress, the flows the user gave you to run in order (take their next task first), the next tasks, what is blocked, open questions, and what the user wrote that no agent has picked up yet (inbox).',
    run: ({ w, project, actor }, a) => {
      const p = project(a.projectId);
      const tasks = w.tasks.filter((t) => t.projectId === p.id && t.kind === 'task');
      const brief = (t) => ({
        id: t.id, title: t.title, size: t.size, status: t.status, owner: t.owner, branch: t.branch, origin: t.origin,
        criteria: t.criteria, description: t.description, question: t.question, parentId: t.parentId,
        ...(t.after?.length ? { after: t.after, afterMode: t.afterMode || 'all' } : {}),
      });
      const byId = new Map(w.tasks.map((t) => [t.id, t]));
      const flows = w.flows
        .filter((f) => f.projectId === p.id && f.status !== 'draft')
        .map((f) => {
          const v = flowView(w, f, actor);
          return {
            id: f.id, title: f.title, status: v.state, assignee: f.assignee || null, mine: v.mine, done: v.done, total: v.total,
            next: v.next.map((id) => brief(byId.get(id))),
            doing: v.doing.map((id) => brief(byId.get(id))),
            waiting: v.waiting.map((x) => ({ ...brief(byId.get(x.id)), waitingOn: x.waitingOn })),
          };
        })
        .sort((x, y) => Number(y.mine) - Number(x.mine));
      return {
        project: { id: p.id, title: p.title, stage: p.stage, repo: p.repo },
        summary: projectSummary(w, p.id),
        planned: w.tasks.some((t) => t.projectId === p.id && t.origin === 'plan'),
        inbox: tasks.filter(needsAgent).map(brief),
        doing: tasks.filter((t) => t.status === 'doing').map(brief),
        blocked: tasks.filter((t) => t.status === 'blocked').map(brief),
        waitingForUser: tasks.filter((t) => t.question && !t.question.answer).map(brief),
        awaitingReview: w.tasks.filter((t) => t.projectId === p.id && awaitingReview(t)).map(brief),
        flows,
        next: nextTasks(w, p.id, 5, actor).map(brief),
        recent: w.events.filter((e) => e.projectId === p.id).slice(-8),
      };
    },
  },
  {
    name: 'attention', read: true, args: {},
    description: 'Across all projects, what waits for the user (open questions, blocked tasks) and what the user wrote that no agent has picked up yet.',
    run: ({ w }) => {
      const title = new Map(w.projects.map((p) => [p.id, p.title]));
      const live = w.tasks.filter((t) => t.kind === 'task' && !w.projects.find((p) => p.id === t.projectId)?.archived);
      const item = (t) => ({ ...t, projectTitle: title.get(t.projectId) });
      return {
        questions: live.filter((t) => t.question && !t.question.answer).map(item),
        blocked: live.filter((t) => t.status === 'blocked').map(item),
        review: w.tasks.filter((t) => awaitingReview(t) && !w.projects.find((p) => p.id === t.projectId)?.archived).map(item),
        pending: live.filter(needsAgent).map(item),
      };
    },
  },
  {
    name: 'task.get', read: true, args: { taskId: req(S(100)) },
    description: 'One item with its sub-items and its whole journal.',
    run: ({ w, task }, a) => {
      const t = task(a.taskId);
      const tasks = w.tasks.filter((x) => x.projectId === t.projectId);
      const roll = rollup(tasks);
      return {
        task: view(w, t, roll),
        children: childrenOf(tasks, t.id).map((c) => view(w, c, roll)),
        events: w.events.filter((e) => e.taskId === t.id),
      };
    },
  },
  {
    name: 'events.list', read: true, args: { projectId: S(100), taskId: S(100), limit: NUM },
    description: 'The journal, oldest first: who did what and when. Filter by project or task.',
    run: ({ w }, a) =>
      w.events.filter((e) => (!a.projectId || e.projectId === a.projectId) && (!a.taskId || e.taskId === a.taskId)).slice(-(a.limit ?? 100)),
  },

  {
    name: 'project.create', args: { id: S(100), title: req(S(200)), description: TEXT, repo: S(300), stage: S(40), review: BOOL },
    description: 'Create a project. Give a stable id (for example "cg01-mortalbound") so a retry does not create a second one. review:true makes every item an agent adds wait for approval by the user before work starts on it.',
    run: (c, a) => {
      const existing = a.id && c.w.projects.find((p) => p.id === a.id);
      if (existing) return existing;
      if (a.stage && !STAGES.includes(a.stage)) fail(`stage is one of ${STAGES.join(', ')}`);
      const p = {
        id: c.uniqueId(a.id || slug(a.title)), title: a.title.trim(), description: a.description || '', repo: a.repo || '',
        stage: a.stage || 'idea', brief: '', archived: false, review: Boolean(a.review), createdAt: c.now,
      };
      c.w.projects.push(p);
      c.log('project', p.id, null, `Project created: ${p.title}`);
      return p;
    },
  },
  {
    name: 'project.update',
    args: { projectId: req(S(100)), title: S(200), description: TEXT, repo: S(300), stage: S(40), brief: { type: 'string', max: 200000 }, archived: BOOL, review: BOOL },
    description: 'Change a project\'s title, description, repo folder, lifecycle stage, brief (Markdown), review setting (review:true = items agents add wait for approval by the user), or archive it.',
    run: (c, a) => {
      const p = c.project(a.projectId);
      if (a.stage && !STAGES.includes(a.stage)) fail(`stage is one of ${STAGES.join(', ')}`);
      const before = p.stage;
      for (const key of ['title', 'description', 'repo', 'stage', 'brief', 'archived', 'review']) if (a[key] !== undefined && a[key] !== null) p[key] = a[key];
      if (a.stage && a.stage !== before) c.log('project', p.id, null, `Stage: ${before} → ${a.stage}`);
      if (a.review !== undefined && a.review !== null) c.log('project', p.id, null, a.review ? 'Review on: items agents add wait for approval' : 'Review off');
      return p;
    },
  },
  {
    name: 'project.log', args: { projectId: req(S(100)), text: req(S(2000)) },
    description: 'One journal line on the project with no task behind it: a small (S) change that was made, or a session note.',
    run: (c, a) => {
      c.project(a.projectId);
      c.log('note', a.projectId, null, a.text.trim());
      return { ok: true };
    },
  },

  {
    name: 'plan.apply', args: { projectId: req(S(100)), nodes: req(LIST), note: S(2000) },
    description: 'Set up or extend the plan in one call. On a project with review on, new items wait for approval by the user (digest: awaitingReview) and cannot be started before. nodes: [{id, title, kind?, size?, description?, criteria?: [text], labels?, children?: [...]}]. An item with children is a group unless kind says otherwise. Items are matched by id: a new id is created, a known id gets its title, description, size and missing criteria updated. Nothing is ever deleted and no status changes, so the call is safe to repeat.',
    run: (c, a) => {
      c.project(a.projectId);
      const created = [];
      const updated = [];
      const apply = (nodes, parentId, depth) => {
        if (!Array.isArray(nodes)) fail('plan.apply: children must be a list');
        if (depth > 4) fail('plan.apply: at most 4 levels (group → task → sub-task → sub-task)');
        for (const n of nodes) {
          if (!n || typeof n.title !== 'string' || !n.title.trim() || n.title.length > 300) fail('plan.apply: every node needs a title');
          c.sizeOk(n.size); c.kindOk(n.kind); c.labelsOk(n.labels);
          const kind = n.kind || (n.children?.length ? 'group' : 'task');
          const id = n.id || `${parentId || a.projectId}-${slug(n.title)}`;
          let t = c.w.tasks.find((x) => x.id === id);
          if (t) {
            if (t.projectId !== a.projectId) fail(`plan.apply: id "${id}" belongs to another project`, 409);
            const before = JSON.stringify([t.title, t.description, t.size, t.criteria.length]);
            t.title = n.title.trim();
            if (n.description !== undefined) t.description = n.description;
            if (n.size !== undefined && t.kind === 'task') t.size = n.size;
            t.criteria = c.criteria(n.criteria, t.criteria);
            if (before !== JSON.stringify([t.title, t.description, t.size, t.criteria.length])) {
              t.updatedAt = c.now;
              updated.push(id);
            }
          } else {
            t = c.newTask({ ...n, id, kind, projectId: a.projectId, parentId, origin: 'plan', review: c.proposal(a.projectId) });
            c.w.tasks.push(t);
            created.push(id);
          }
          if (n.children?.length) apply(n.children, id, depth + 1);
        }
      };
      apply(a.nodes, null, 1);
      if (created.length || updated.length) {
        c.log('plan', a.projectId, null, a.note?.trim() || 'Plan applied', { created, updated });
      }
      return { created, updated };
    },
  },
  {
    name: 'task.add',
    args: { projectId: req(S(100)), parentId: S(100), id: S(100), title: req(S(300)), kind: S(10), size: S(1), description: TEXT, criteria: LIST, labels: LIST, reason: S(2000) },
    description: 'Add one item. From an agent it is work discovered while working, and "reason" (why it is needed, what revealed it) is required; it is shown to the user as added by the agent. From the user it is a request, and lands in the agents\' inbox.',
    run: (c, a) => {
      c.project(a.projectId);
      c.sizeOk(a.size); c.kindOk(a.kind); c.labelsOk(a.labels);
      const existing = a.id && c.w.tasks.find((t) => t.id === a.id);
      if (existing) return existing;
      if (a.parentId && c.task(a.parentId).projectId !== a.projectId) fail('task.add: the parent is in another project');
      if (!c.isHuman && !a.reason?.trim()) fail('task.add: "reason" is required when an agent adds work (why it is needed, what revealed it)');
      const t = c.newTask({
        ...a, kind: a.kind || 'task', id: c.uniqueId(a.id || `${a.projectId}-${slug(a.title)}`), origin: c.isHuman ? 'user' : 'agent',
        review: c.proposal(a.projectId),
      });
      c.w.tasks.push(t);
      c.log('added', t.projectId, t.id, c.isHuman ? 'Requested by the user' : `Added while working: ${a.reason.trim()}`);
      return t;
    },
  },
  {
    name: 'task.update',
    args: { taskId: req(S(100)), title: S(300), description: TEXT, size: S(1), labels: LIST, criteria: LIST, after: LIST, afterMode: S(3) },
    description: 'Edit an item: title, description, size, labels, the whole criteria list ([{id?, text, done?}]), or its order arrows: after = the ids of the tasks or groups it waits for, afterMode "all" (every one finished, the default) or "any" (one is enough). Refused when the arrows could never all be met. Not for status: use the task.* verbs.',
    run: (c, a) => {
      const t = c.task(a.taskId);
      c.mine(t, 'task.update'); c.sizeOk(a.size); c.labelsOk(a.labels);
      if (a.title) t.title = a.title.trim();
      if (a.description !== undefined && a.description !== null) t.description = a.description;
      if (a.size !== undefined && t.kind === 'task') t.size = a.size;
      if (a.labels) t.labels = a.labels.map((l) => l.trim());
      if (a.afterMode !== undefined && a.afterMode !== null) {
        if (!AFTER_MODES.includes(a.afterMode)) fail(`afterMode is one of ${AFTER_MODES.join(', ')}`);
        t.afterMode = a.afterMode;
      }
      if (a.after) {
        const ids = [...new Set(a.after)];
        for (const id of ids) {
          if (typeof id !== 'string' || id === t.id) fail('task.update: "after" lists other items of the project');
          if (c.task(id).projectId !== t.projectId) fail(`task.update: "${id}" is in another project`);
        }
        const before = t.after;
        t.after = ids;
        if (hasDeadlock(c.w.tasks.filter((x) => x.projectId === t.projectId))) {
          t.after = before;
          fail('task.update: these arrows make a loop (an item would wait for itself, or for a group it belongs to)', 409);
        }
      }
      if (a.criteria) {
        const kept = [];
        for (const raw of a.criteria) {
          const text = (typeof raw === 'string' ? raw : raw?.text || '').trim();
          if (!text || text.length > 500) fail('task.update: each criterion needs a text');
          const old = t.criteria.find((x) => x.id === raw?.id || x.text === text);
          kept.push({ id: old?.id || `c${Date.now().toString(36)}${kept.length}`, text, done: raw?.done ?? old?.done ?? false });
        }
        t.criteria = kept;
      }
      t.updatedAt = c.now;
      c.log('edited', t.projectId, t.id, a.after ? (t.after.length ? `Runs after: ${t.after.join(', ')}${t.afterMode === 'any' ? ' (any one)' : ''}` : 'No order arrows') : 'Edited');
      return t;
    },
  },
  {
    name: 'task.move', args: { taskId: req(S(100)), parentId: S(100), index: NUM },
    description: 'Move an item (with its sub-items) under another parent, or reorder it. parentId null = top level.',
    run: (c, a) => {
      const t = c.task(a.taskId);
      const parentId = a.parentId ?? null;
      if (parentId !== null) {
        const parent = c.task(parentId);
        if (parent.projectId !== t.projectId || parentId === t.id || descendantIds(c.w.tasks, t.id).has(parentId)) fail('task.move: invalid parent');
      }
      const siblings = childrenOf(c.w.tasks, parentId, t.projectId).filter((x) => x.id !== t.id);
      siblings.splice(Math.min(Math.max(0, a.index ?? siblings.length), siblings.length), 0, t);
      t.parentId = parentId;
      siblings.forEach((x, i) => { x.order = i; });
      t.updatedAt = c.now;
      return t;
    },
  },

  {
    name: 'task.start', args: { taskId: req(S(100)), branch: S(200), agent: S(100), takeover: BOOL },
    description: 'Begin work on a task: it becomes "doing" and yours. branch = the git branch of the work; agent = the specialist doing it when the session delegates (for example "gameplay-programmer"). Fails with 409 when another agent is doing it, unless takeover:true.',
    run: (c, a) => {
      const t = c.task(a.taskId);
      if (t.kind !== 'task') fail('task.start: a group is not started; start one of its tasks');
      if (t.status === 'done' || t.status === 'dropped') fail(`task.start: task is ${t.status}; task.reopen it first`);
      const waits = waitingOn(c.w.tasks, t);
      if (waits.length && !c.isHuman) {
        fail(`task.start: "${t.id}" runs after ${waits.join(', ')}, not finished yet. Take a task that is ready (digest NEXT).`, 409);
      }
      const pending = c.underReview(t);
      if (pending && !c.isHuman) {
        fail(`task.start: "${pending.id}" waits for the user's approval. Take an approved task, or task.ask if this one is urgent.`, 409);
      }
      if (t.status === 'doing' && t.owner && t.owner !== c.actor && !a.takeover && !c.isHuman) {
        fail(`task.start: "${t.id}" is being done by ${t.owner} since ${t.startedAt}. Take another task, or pass takeover:true if that work was abandoned.`, 409);
      }
      const takeover = t.status === 'doing' && t.owner && t.owner !== c.actor;
      t.status = 'doing';
      t.owner = c.actor;
      t.agent = a.agent || t.agent || null;
      if (a.branch) t.branch = a.branch;
      t.startedAt = t.startedAt || c.now;
      t.ack = true;
      t.updatedAt = c.now;
      c.log('started', t.projectId, t.id, takeover ? 'Taken over' : `Started${t.branch ? ` on ${t.branch}` : ''}${t.agent ? ` (${t.agent})` : ''}`);
      return t;
    },
  },
  {
    name: 'task.progress', args: { taskId: req(S(100)), note: S(4000), check: ANY, addCriteria: LIST, agent: S(100) },
    description: 'Report progress on a task in work: a short note of what is now true, criteria that are now met (check: ids, 1-based numbers or texts), and criteria discovered on the way (addCriteria).',
    run: (c, a) => {
      const t = c.task(a.taskId);
      c.mine(t, 'task.progress');
      if (!a.note?.trim() && !a.check?.length && !a.addCriteria?.length) fail('task.progress: give a note, check or addCriteria');
      t.criteria = c.criteria(a.addCriteria, t.criteria);
      c.tick(t, a.check);
      if (a.agent) t.agent = a.agent;
      t.updatedAt = c.now;
      const done = t.criteria.filter((x) => x.done).length;
      c.log('progress', t.projectId, t.id, a.note?.trim() || `Criteria ${done}/${t.criteria.length}`, a.addCriteria?.length ? { addedCriteria: a.addCriteria } : undefined);
      return t;
    },
  },
  {
    name: 'task.block', args: { taskId: req(S(100)), reason: req(S(4000)) },
    description: 'The task cannot go on and it is not a question the user can answer in a line (a missing asset, a tool that fails, a dependency). Say what is missing and what would unblock it.',
    run: (c, a) => {
      const t = c.task(a.taskId);
      c.mine(t, 'task.block');
      if (t.kind !== 'task') fail('task.block: only a task can be blocked');
      t.status = 'blocked';
      t.blockedReason = a.reason.trim();
      t.updatedAt = c.now;
      c.log('blocked', t.projectId, t.id, t.blockedReason);
      return t;
    },
  },
  {
    name: 'task.unblock', args: { taskId: req(S(100)), note: S(2000) },
    description: 'The blocker is gone: the task goes back to "doing" (or "todo" when nobody owns it).',
    run: (c, a) => {
      const t = c.task(a.taskId);
      if (t.status !== 'blocked') fail('task.unblock: the task is not blocked');
      t.status = t.owner ? 'doing' : 'todo';
      t.blockedReason = '';
      if (c.isHuman) t.ack = false;
      t.updatedAt = c.now;
      c.log('unblocked', t.projectId, t.id, a.note?.trim() || 'Unblocked');
      return t;
    },
  },
  {
    name: 'task.ask', args: { taskId: req(S(100)), question: req(S(4000)), options: LIST },
    description: 'Put a decision to the user (a taste or business call, a try branch to keep or drop, an approval). The work goes on with a reversible default meanwhile; the answer arrives in the digest inbox.',
    run: (c, a) => {
      const t = c.task(a.taskId);
      c.mine(t, 'task.ask');
      t.question = { text: a.question.trim(), options: (a.options || []).filter((o) => typeof o === 'string' && o.trim()), by: c.actor, askedAt: c.now, answer: null, answeredAt: null };
      t.updatedAt = c.now;
      c.log('asked', t.projectId, t.id, t.question.text);
      return t;
    },
  },
  {
    name: 'task.answer', args: { taskId: req(S(100)), answer: req(S(4000)) },
    description: 'Answer the open question of a task (the user does this in the web UI). The answer lands in the agents\' inbox.',
    run: (c, a) => {
      const t = c.task(a.taskId);
      if (!t.question || t.question.answer) fail('task.answer: this task has no open question');
      t.question.answer = a.answer.trim();
      t.question.answeredAt = c.now;
      t.ack = false;
      t.updatedAt = c.now;
      c.log('answered', t.projectId, t.id, t.question.answer);
      return t;
    },
  },
  {
    name: 'task.approve', args: { taskId: req(S(100)), note: S(2000) },
    description: 'The user approves an item an agent proposed: it, the items under it and the groups above it may be worked on. Only the user approves; a rejected proposal is dropped (task.drop) or deleted.',
    run: (c, a) => {
      if (!c.isHuman) fail('task.approve: only the user approves proposed work', 403);
      const t = c.task(a.taskId);
      const ids = descendantIds(c.w.tasks, t.id);
      ids.add(t.id);
      for (let p = t; p.parentId; ) {
        p = c.task(p.parentId);
        ids.add(p.id);
      }
      const approved = [];
      for (const x of c.w.tasks) {
        if (ids.has(x.id) && x.review === 'pending') {
          x.review = null;
          x.updatedAt = c.now;
          approved.push(x.id);
        }
      }
      if (!approved.length) return { approved };
      const text = a.note?.trim() || (approved.length > 1 ? `Approved ${approved.length} items` : 'Approved');
      c.log('approved', t.projectId, t.id, text, { approved });
      return { approved };
    },
  },
  {
    name: 'task.ack', args: { taskId: req(S(100)), note: S(2000) },
    description: 'An agent has read what the user wrote on this task (a new request, an answer, an unblock) and will act on it. Removes it from the inbox.',
    run: (c, a) => {
      const t = c.task(a.taskId);
      t.ack = true;
      if (t.question?.answer) t.question = null;
      t.updatedAt = c.now;
      c.log('ack', t.projectId, t.id, a.note?.trim() || 'Read by the agent');
      return t;
    },
  },
  {
    name: 'task.done',
    args: { taskId: req(S(100)), summary: req(S(4000)), evidence: OBJ, check: ANY, unmet: S(2000) },
    description: 'Close a task with proof. summary = what is now true for the player or the project. evidence = {commit, tests, report, screenshots, notes}: at least one for an M or L task. check = criteria met now (ids, numbers, texts). A criterion still unticked refuses the call unless "unmet" explains why it is closed without it. Sub-tasks must be done or dropped first.',
    run: (c, a) => {
      const t = c.task(a.taskId);
      c.mine(t, 'task.done');
      if (t.kind !== 'task') fail('task.done: a group is done when its tasks are; close those');
      if (t.status === 'done') return t;
      const openKids = childrenOf(c.w.tasks, t.id).filter((k) => k.status !== 'done' && k.status !== 'dropped');
      if (openKids.length) fail(`task.done: sub-tasks still open: ${openKids.map((k) => k.id).join(', ')}. Finish or drop them first.`);
      c.tick(t, a.check);
      const missing = t.criteria.filter((x) => !x.done);
      if (missing.length && !a.unmet?.trim()) {
        fail(`task.done: criteria not met: ${missing.map((x) => `${x.id} "${x.text}"`).join('; ')}. Tick them with "check" once they are true, or pass "unmet" saying why the task closes without them.`);
      }
      const evidence = {};
      for (const key of ['commit', 'tests', 'report', 'screenshots', 'notes']) {
        const value = a.evidence?.[key];
        if (value !== undefined && value !== null && value !== '') evidence[key] = String(value).slice(0, 2000);
      }
      if (t.size !== 'S' && !Object.keys(evidence).length && !c.isHuman) {
        fail('task.done: an M or L task needs evidence: {commit, tests, report, screenshots or notes}. "Done" without proof is not recorded.');
      }
      t.status = 'done';
      t.summary = a.summary.trim();
      t.evidence = Object.keys(evidence).length ? evidence : null;
      t.unmet = a.unmet?.trim() || '';
      t.owner = t.owner || c.actor;
      t.question = null;
      t.blockedReason = '';
      t.doneAt = c.now;
      t.ack = true;
      t.updatedAt = c.now;
      c.log('done', t.projectId, t.id, t.summary, { evidence: t.evidence, ...(t.unmet ? { unmet: t.unmet } : {}) });
      return t;
    },
  },
  {
    name: 'task.reopen', args: { taskId: req(S(100)), reason: req(S(2000)) },
    description: 'A done or dropped task is not finished after all (a regression, the user is not satisfied). It goes back to "todo".',
    run: (c, a) => {
      const t = c.task(a.taskId);
      if (t.status !== 'done' && t.status !== 'dropped') fail('task.reopen: the task is not done or dropped');
      t.status = 'todo';
      t.owner = null;
      t.doneAt = null;
      if (c.isHuman) { t.ack = false; t.origin = t.origin === 'plan' ? 'user' : t.origin; }
      t.updatedAt = c.now;
      c.log('reopened', t.projectId, t.id, a.reason.trim());
      return t;
    },
  },
  {
    name: 'task.drop', args: { taskId: req(S(100)), reason: req(S(2000)) },
    description: 'The item will not be done (cut from scope, replaced). It and its sub-items leave the progress numbers but stay visible with the reason.',
    run: (c, a) => {
      const t = c.task(a.taskId);
      c.mine(t, 'task.drop');
      const ids = descendantIds(c.w.tasks, t.id);
      ids.add(t.id);
      for (const x of c.w.tasks) {
        if (ids.has(x.id) && x.status !== 'done') { x.status = 'dropped'; x.question = null; x.updatedAt = c.now; }
      }
      c.log('dropped', t.projectId, t.id, a.reason.trim());
      return t;
    },
  },
  {
    name: 'task.release', args: { taskId: req(S(100)), note: S(2000) },
    description: 'Hand a task back unfinished: it becomes "todo" with no owner. Say in the note where the work stands.',
    run: (c, a) => {
      const t = c.task(a.taskId);
      c.mine(t, 'task.release');
      if (t.status !== 'doing' && t.status !== 'blocked') fail('task.release: the task is not in work');
      t.status = 'todo';
      t.owner = null;
      t.updatedAt = c.now;
      c.log('released', t.projectId, t.id, a.note?.trim() || 'Released');
      return t;
    },
  },
  {
    name: 'flow.create', args: { projectId: req(S(100)), id: S(100), title: req(S(200)) },
    description: 'Create a flow: a canvas of tasks and groups joined by order arrows, which the user gives to one agent to run in order.',
    run: (c, a) => {
      c.project(a.projectId);
      const existing = a.id && c.w.flows.find((x) => x.id === a.id);
      if (existing) return existing;
      let id = a.id || `${a.projectId}-flow-${slug(a.title)}`;
      for (let n = 2; c.w.flows.some((x) => x.id === id); n += 1) id = `${a.id || `${a.projectId}-flow-${slug(a.title)}`}-${n}`;
      const f = { id, projectId: a.projectId, title: a.title.trim(), nodes: [], assignee: null, status: 'draft', createdAt: c.now, updatedAt: c.now };
      c.w.flows.push(f);
      c.log('flow', f.projectId, null, `Flow created: ${f.title}`);
      return f;
    },
  },
  {
    name: 'flow.update', args: { flowId: req(S(100)), title: S(200), nodes: LIST, assignee: S(100), status: S(10) },
    description: 'Change a flow: title, nodes ([{taskId, x, y}], the whole list), assignee (the actor that runs it; "" = any agent) or status: "running" (agents take its tasks in order), "paused" or "draft".',
    run: (c, a) => {
      const f = c.flow(a.flowId);
      if (a.title) f.title = a.title.trim();
      if (a.nodes) {
        const seen = new Set();
        f.nodes = a.nodes.map((n) => {
          if (!n || typeof n.taskId !== 'string' || !Number.isFinite(n.x) || !Number.isFinite(n.y)) fail('flow.update: each node is {taskId, x, y}');
          if (c.task(n.taskId).projectId !== f.projectId) fail(`flow.update: "${n.taskId}" is in another project`);
          if (seen.has(n.taskId)) fail(`flow.update: "${n.taskId}" is twice in the flow`);
          seen.add(n.taskId);
          return { taskId: n.taskId, x: Math.round(n.x), y: Math.round(n.y) };
        });
      }
      if (a.assignee !== undefined && a.assignee !== null) f.assignee = a.assignee.trim() || null;
      if (a.status !== undefined && a.status !== null) {
        if (!FLOW_STATUSES.includes(a.status)) fail(`status is one of ${FLOW_STATUSES.join(', ')}`);
        if (a.status !== f.status) {
          const label = { running: `Flow running: ${f.title}${f.assignee ? ` (for ${f.assignee})` : ''}`, paused: `Flow paused: ${f.title}`, draft: `Flow back to draft: ${f.title}` };
          c.log('flow', f.projectId, null, label[a.status]);
        }
        f.status = a.status;
      }
      f.updatedAt = c.now;
      return f;
    },
  },
  {
    name: 'flow.delete', args: { flowId: req(S(100)) },
    description: 'Remove a flow. Its order arrows stay on the items. Only the user does this.',
    run: (c, a) => {
      if (!c.isHuman) fail('flow.delete: only the user deletes a flow', 403);
      const f = c.flow(a.flowId);
      c.w.flows = c.w.flows.filter((x) => x.id !== f.id);
      c.log('flow', f.projectId, null, `Flow deleted: ${f.title}`);
      return { deleted: f.id };
    },
  },
  {
    name: 'task.delete', args: { taskId: req(S(100)) },
    description: 'Remove an item and its sub-items for good. Only the user does this; agents use task.drop, which keeps the record.',
    run: (c, a) => {
      if (!c.isHuman) fail('task.delete: only the user deletes. Use task.drop with a reason.', 403);
      const t = c.task(a.taskId);
      const ids = descendantIds(c.w.tasks, t.id);
      ids.add(t.id);
      c.w.tasks = c.w.tasks.filter((x) => !ids.has(x.id));
      for (const x of c.w.tasks) if (x.after?.some((id) => ids.has(id))) x.after = x.after.filter((id) => !ids.has(id));
      for (const f of c.w.flows) f.nodes = f.nodes.filter((n) => !ids.has(n.taskId));
      childrenOf(c.w.tasks, t.parentId, t.projectId).forEach((x, i) => { x.order = i; });
      c.log('deleted', t.projectId, null, `Deleted: ${t.title}${ids.size > 1 ? ` (+${ids.size - 1} sub-items)` : ''}`);
      return { deleted: [...ids] };
    },
  },
];

export const definitions = ACTIONS.map(({ name, description, args, read }) => ({
  name,
  description,
  readOnly: Boolean(read),
  arguments: Object.fromEntries(Object.entries(args).map(([k, r]) => [k, `${r.type}${r.required ? ' (required)' : ''}`])),
}));

/**
 * Run one action on a draft workspace (mutated in place). Returns {result, changed}.
 * `requestId` makes a retry safe: the same id from the same actor with the same arguments returns the first result.
 */
export function runAction(w, name, args = {}, { actor, requestId, now = new Date().toISOString() } = {}) {
  const def = ACTIONS.find((d) => d.name === name) || fail(`Unknown action "${name}". GET /api/actions lists them.`, 404);
  checkArgs(def, args);
  if (def.read) return { result: def.run(makeContext(w, actor || 'reader', now), args), changed: false };
  if (typeof actor !== 'string' || !actor.trim() || actor.length > 100) {
    fail(`${name}: "actor" is required for a change: a stable name for who is writing, for example "claude-cg01"`);
  }
  const fingerprint = JSON.stringify([name, args]);
  if (requestId) {
    const receipt = w.receipts.find((r) => r.id === requestId && r.actor === actor);
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) fail('requestId was already used for a different call; use a new one', 409);
      return { result: receipt.result, changed: false };
    }
  }
  const result = def.run(makeContext(w, actor.trim(), now), args);
  if (requestId) {
    w.receipts.push({ id: requestId, actor, fingerprint, result: structuredClone(result) });
    if (w.receipts.length > MAX_RECEIPTS) w.receipts.splice(0, w.receipts.length - MAX_RECEIPTS);
  }
  return { result, changed: true };
}
