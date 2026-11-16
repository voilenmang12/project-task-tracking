// The rules of the actions, run on a workspace in memory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyWorkspace, nextTasks, projectSummary, rollup, validateWorkspace, waitingOn } from '../shared/model.js';
import { runAction } from '../server/actions.js';
import { migrateV1 } from '../server/migrate.js';

const AGENT = { actor: 'claude-a' };
const OTHER = { actor: 'claude-b' };
const USER = { actor: 'human' };

function workspace() {
  const w = emptyWorkspace();
  const run = (name, args, options = AGENT) => runAction(w, name, args, options).result;
  run('project.create', { id: 'g', title: 'Game' });
  run('plan.apply', {
    projectId: 'g',
    nodes: [
      { id: 'm1', title: 'Core', children: [
        { id: 'move', title: 'Movement', size: 'M', criteria: ['Keys move the player', 'Collision test passes'] },
        { id: 'combat', title: 'Combat', size: 'L' },
      ] },
      { id: 'm2', title: 'UI', children: [{ id: 'hub', title: 'Hub', size: 'S' }] },
    ],
  });
  return { w, run };
}
const rejects = (fn, pattern, status) => assert.throws(fn, (e) => pattern.test(e.message) && (!status || e.status === status));

test('plan.apply creates the tree once and is safe to repeat', () => {
  const { w, run } = workspace();
  assert.equal(w.tasks.length, 5);
  assert.equal(w.tasks.find((t) => t.id === 'm1').kind, 'group');
  assert.equal(w.tasks.find((t) => t.id === 'move').criteria.length, 2);
  const again = run('plan.apply', { projectId: 'g', nodes: [{ id: 'm1', title: 'Core loop', children: [{ id: 'move', title: 'Movement', criteria: ['Keys move the player', 'No input lag'] }, { id: 'jump', title: 'Jump' }] }] });
  assert.deepEqual(again.created, ['jump']);
  assert.deepEqual(again.updated.sort(), ['m1', 'move']);
  assert.equal(w.tasks.find((t) => t.id === 'move').criteria.length, 3, 'criteria are added, never removed');
  assert.equal(w.tasks.length, 6);
  validateWorkspace(w);
});

test('a task runs from start to done, and done needs its criteria and evidence', () => {
  const { w, run } = workspace();
  run('task.start', { taskId: 'move', branch: 'task/move', agent: 'gameplay-programmer' });
  const t = w.tasks.find((x) => x.id === 'move');
  assert.deepEqual([t.status, t.owner, t.branch, t.agent], ['doing', 'claude-a', 'task/move', 'gameplay-programmer']);

  run('task.progress', { taskId: 'move', note: 'Keys work', check: [1] });
  rejects(() => run('task.done', { taskId: 'move', summary: 'Moves', evidence: { commit: 'abc' } }), /criteria not met: c2/);
  rejects(() => run('task.done', { taskId: 'move', summary: 'Moves', check: 'all' }), /needs evidence/);
  run('task.done', { taskId: 'move', summary: 'Player moves', check: 'all', evidence: { commit: 'abc', tests: '12 passed' } });
  assert.equal(t.status, 'done');
  assert.deepEqual(t.evidence, { commit: 'abc', tests: '12 passed' });
  assert.equal(w.events.at(-1).type, 'done');

  // An S task closes on its summary alone; an unmet criterion closes only with an explanation.
  run('task.start', { taskId: 'hub' });
  run('task.done', { taskId: 'hub', summary: 'Hub shows' });
  run('task.start', { taskId: 'combat' });
  run('task.progress', { taskId: 'combat', addCriteria: ['Enemy dies'] });
  run('task.done', { taskId: 'combat', summary: 'Combat works', evidence: { notes: 'played 3 fights' }, unmet: 'Enemy death animation is cut from scope' });
  assert.equal(w.tasks.find((x) => x.id === 'combat').unmet, 'Enemy death animation is cut from scope');
});

test('another agent cannot touch work in progress, unless it takes over', () => {
  const { w, run } = workspace();
  run('task.start', { taskId: 'move' });
  rejects(() => run('task.start', { taskId: 'move' }, OTHER), /being done by claude-a/, 409);
  rejects(() => run('task.progress', { taskId: 'move', note: 'x' }, OTHER), /being done by claude-a/, 409);
  rejects(() => run('task.done', { taskId: 'move', summary: 'x', check: 'all', evidence: { notes: 'x' } }, OTHER), /being done/, 409);
  run('task.start', { taskId: 'move', takeover: true }, OTHER);
  assert.equal(w.tasks.find((t) => t.id === 'move').owner, 'claude-b');
  // The user does not change work in progress either: they stop it first, then change it.
  rejects(() => run('task.update', { taskId: 'move', title: 'Player movement' }, USER), /being worked on by claude-b/, 423);
  run('work.stop', { taskId: 'move' }, USER);
  run('task.update', { taskId: 'move', title: 'Player movement' }, USER);
});

test('work added by an agent needs a reason; a request from the user lands in the inbox', () => {
  const { w, run } = workspace();
  rejects(() => run('task.add', { projectId: 'g', title: 'Fix lag' }), /"reason" is required/);
  const found = run('task.add', { projectId: 'g', parentId: 'm1', title: 'Fix lag', size: 'S', reason: 'Seen while testing movement' });
  assert.deepEqual([found.origin, found.ack], ['agent', true]);

  const asked = run('task.add', { projectId: 'g', title: 'Add a pause button' }, USER);
  assert.deepEqual([asked.origin, asked.ack], ['user', false]);
  let digest = run('digest', { projectId: 'g' });
  assert.deepEqual(digest.inbox.map((t) => t.id), [asked.id]);
  assert.equal(digest.next[0].id, asked.id, 'user requests come first');
  run('task.start', { taskId: asked.id });
  digest = run('digest', { projectId: 'g' });
  assert.equal(digest.inbox.length, 0, 'starting it acknowledges it');
  assert.equal(w.tasks.filter((t) => t.title === 'Fix lag').length, 1);
});

test('a question goes to the user and its answer comes back through the inbox', () => {
  const { w, run } = workspace();
  run('task.start', { taskId: 'combat' });
  run('task.ask', { taskId: 'combat', question: 'Melee or ranged first?', options: ['Melee', 'Ranged'] });
  assert.equal(run('attention', {}).questions.length, 1);
  assert.equal(projectSummary(w, 'g').needsUser, 1);
  rejects(() => run('task.answer', { taskId: 'move', answer: 'x' }, USER), /no open question/);
  run('task.answer', { taskId: 'combat', answer: 'Melee' }, USER);
  assert.equal(run('attention', {}).questions.length, 0);
  assert.equal(run('digest', { projectId: 'g' }).inbox[0].question.answer, 'Melee');
  run('task.ack', { taskId: 'combat' });
  assert.equal(run('digest', { projectId: 'g' }).inbox.length, 0);
  assert.equal(w.tasks.find((t) => t.id === 'combat').question, null);
});

test('block, unblock, release, reopen, drop and delete', () => {
  const { w, run } = workspace();
  const get = (id) => w.tasks.find((t) => t.id === id);
  run('task.start', { taskId: 'move' });
  run('task.block', { taskId: 'move', reason: 'SDK missing' });
  assert.equal(get('move').status, 'blocked');
  assert.equal(run('attention', {}).blocked.length, 1);
  run('task.unblock', { taskId: 'move', note: 'SDK added' }, USER);
  assert.deepEqual([get('move').status, get('move').ack], ['doing', false]);
  run('task.release', { taskId: 'move', note: 'half done' });
  assert.deepEqual([get('move').status, get('move').owner], ['todo', null]);

  run('task.drop', { taskId: 'm2', reason: 'UI cut' });
  assert.equal(get('hub').status, 'dropped');
  run('task.reopen', { taskId: 'hub', reason: 'back in scope' }, USER);
  assert.equal(get('hub').status, 'todo');

  rejects(() => run('task.delete', { taskId: 'm1' }), /only the user deletes/, 403);
  run('task.delete', { taskId: 'm1' }, USER);
  assert.equal(w.tasks.some((t) => t.id === 'move'), false);
  validateWorkspace(w);
});

test('progress is weighted by size and only "done" reaches 100%', () => {
  const { w, run } = workspace();
  // Core: move M(3) + combat L(8); UI: hub S(1). Total 12.
  run('task.start', { taskId: 'move' });
  run('task.progress', { taskId: 'move', check: [1] });
  let roll = rollup(w.tasks);
  assert.equal(roll.move.progress, 0.5);
  assert.equal(roll.m1.status, 'doing');
  assert.ok(Math.abs(projectSummary(w, 'g').progress - 1.5 / 12) < 1e-9);
  run('task.progress', { taskId: 'move', check: 'all' });
  assert.equal(rollup(w.tasks).move.progress, 0.9, 'all criteria ticked is still not done');
  run('task.done', { taskId: 'move', summary: 'ok', evidence: { commit: 'a' } });
  run('task.drop', { taskId: 'combat', reason: 'cut' });
  roll = rollup(w.tasks);
  assert.deepEqual([roll.m1.progress, roll.m1.status], [1, 'done'], 'dropped work leaves the numbers');
  assert.deepEqual(nextTasks(w, 'g').map((t) => t.id), ['hub']);
});

test('arguments are checked, writes need an actor, and requestId makes a retry safe', () => {
  const { w, run } = workspace();
  rejects(() => run('task.start', { taskId: 'nope' }), /not found/, 404);
  rejects(() => run('task.start', { taskId: 'move', colour: 'red' }), /unknown argument "colour"/);
  rejects(() => run('nope', {}), /Unknown action/, 404);
  rejects(() => runAction(w, 'task.start', { taskId: 'move' }, {}), /"actor" is required/);
  rejects(() => run('task.start', { taskId: 'm1' }), /a group is not started/);

  const options = { actor: 'claude-a', requestId: 'r1' };
  const first = runAction(w, 'task.add', { projectId: 'g', title: 'Once', reason: 'needed' }, options);
  const again = runAction(w, 'task.add', { projectId: 'g', title: 'Once', reason: 'needed' }, options);
  assert.equal(again.changed, false);
  assert.equal(again.result.id, first.result.id);
  assert.equal(w.tasks.filter((t) => t.title === 'Once').length, 1);
  rejects(() => runAction(w, 'task.add', { projectId: 'g', title: 'Other', reason: 'needed' }, options), /already used/, 409);
});

test('a v1 workspace migrates: tree, done state, notes, tag names and the design document', () => {
  const v1 = {
    version: 1,
    projects: [{ id: 'p', title: 'Old', description: 'd', color: '#112233', designDocument: '# Doc' }],
    tagCatalog: [{ id: 'gameplay', name: 'Gameplay', color: '#112233' }],
    tasks: [
      { id: 'a', projectId: 'p', parentId: null, order: 0, title: 'Phase', done: false, notes: '', attachments: [] },
      { id: 'b', projectId: 'p', parentId: 'a', order: 0, title: 'Did it', done: true, notes: 'how', tagIds: ['gameplay'], attachments: [] },
      { id: 'c', projectId: 'p', parentId: 'a', order: 1, title: 'Doing', done: false, status: 'in_progress', notes: '', attachments: [] },
    ],
    ideas: [{ id: 'i', title: 'idea', notes: '', attachments: [], createdAt: '2026-01-01T00:00:00Z' }],
  };
  const w = validateWorkspace(migrateV1(v1));
  const get = (id) => w.tasks.find((t) => t.id === id);
  assert.equal(w.projects[0].brief, '# Doc');
  assert.deepEqual([get('a').kind, get('b').kind], ['group', 'task']);
  assert.deepEqual([get('b').status, get('b').description, get('b').labels], ['done', 'how', ['Gameplay']]);
  assert.equal(get('c').status, 'doing');
  assert.equal(rollup(w.tasks).a.progress, 0.5);
});

test('on a project with review on, what an agent proposes waits for the user before work starts', () => {
  const { w, run } = workspace();
  run('project.update', { projectId: 'g', review: true }, USER);
  run('plan.apply', { projectId: 'g', nodes: [{ id: 'm3', title: 'Shop', children: [{ id: 'buy', title: 'Buy button', size: 'M' }] }] });
  const added = run('task.add', { projectId: 'g', parentId: 'm1', title: 'Fix input lag', reason: 'Found while testing' });
  const byId = (id) => w.tasks.find((t) => t.id === id);
  assert.equal(byId('m3').review, 'pending');
  assert.equal(byId('buy').review, 'pending');
  assert.equal(added.review, 'pending');
  assert.equal(byId('move').review, null, 'items from before review was turned on are not affected');

  const digest = run('digest', { projectId: 'g' });
  assert.deepEqual(digest.awaitingReview.map((t) => t.id).sort(), ['buy', added.id, 'm3'].sort());
  assert.ok(!digest.next.some((t) => t.id === 'buy' || t.id === added.id), 'proposals are not offered as next tasks');
  assert.equal(run('attention', {}).review.length, 3);
  assert.equal(projectSummary(w, 'g').awaitingReview, 3);

  rejects(() => run('task.start', { taskId: 'buy' }), /waits for the user's approval/, 409);
  rejects(() => run('task.approve', { taskId: 'buy' }), /only the user/, 403);

  // Approving a task approves the groups above it; approving a group approves what is under it.
  const ok = run('task.approve', { taskId: 'buy' }, USER);
  assert.deepEqual(ok.approved.sort(), ['buy', 'm3']);
  run('task.start', { taskId: 'buy' });
  assert.equal(byId('buy').status, 'doing');

  // A rejected proposal is dropped; it leaves the review list.
  run('task.drop', { taskId: added.id, reason: 'Not now' }, USER);
  assert.equal(run('digest', { projectId: 'g' }).awaitingReview.length, 0);

  // What the user adds is never pending.
  assert.equal(run('task.add', { projectId: 'g', title: 'Mine' }, USER).review, null);
  assert.equal(w.events.filter((e) => e.type === 'approved').length, 1);
  validateWorkspace(w);
});

test('a project created with review on, and review off by default', () => {
  const w = emptyWorkspace();
  const run = (name, args, options = AGENT) => runAction(w, name, args, options).result;
  assert.equal(run('project.create', { id: 'a', title: 'A' }).review, false);
  assert.equal(run('project.create', { id: 'b', title: 'B', review: true }, USER).review, true);
  run('task.add', { projectId: 'a', title: 'Free', reason: 'r' });
  assert.equal(w.tasks[0].review, null);
});

test('order arrows: a task waits for all its predecessors, or any one; groups count as a whole', () => {
  const { w, run } = workspace();
  const byId = (id) => w.tasks.find((t) => t.id === id);
  // hub (in m2) runs after movement and combat (in m1, another branch of the tree).
  run('task.update', { taskId: 'hub', after: ['move', 'combat'] }, USER);
  assert.deepEqual(waitingOn(w.tasks, byId('hub')).sort(), ['combat', 'move']);
  assert.ok(!nextTasks(w, 'g').some((t) => t.id === 'hub'));
  rejects(() => run('task.start', { taskId: 'hub' }), /runs after/, 409);

  run('task.update', { taskId: 'hub', afterMode: 'any' }, USER);
  run('task.start', { taskId: 'move' });
  run('task.done', { taskId: 'move', summary: 'ok', check: 'all', evidence: { commit: 'a' } });
  assert.deepEqual(waitingOn(w.tasks, byId('hub')), [], 'any one is enough');

  // An arrow from a group: everything under m2 waits until m1 is finished. A dropped task does not hold it up.
  run('task.update', { taskId: 'hub', after: [], afterMode: 'all' }, USER);
  run('task.update', { taskId: 'm2', after: ['m1'] }, USER);
  assert.deepEqual(waitingOn(w.tasks, byId('hub')), ['m1']);
  run('task.drop', { taskId: 'combat', reason: 'cut' }, USER);
  assert.deepEqual(waitingOn(w.tasks, byId('hub')), []);
  validateWorkspace(w);
});

test('order arrows that can never be met are refused', () => {
  const { run } = workspace();
  run('task.update', { taskId: 'combat', after: ['move'] }, USER);
  rejects(() => run('task.update', { taskId: 'move', after: ['combat'] }, USER), /loop/, 409);
  rejects(() => run('task.update', { taskId: 'move', after: ['m1'] }, USER), /loop/, 409); // its own group
  rejects(() => run('task.update', { taskId: 'm1', after: ['move'] }, USER), /loop/, 409); // a task inside it
  rejects(() => run('task.update', { taskId: 'move', after: ['move'] }, USER), /other items/);
});

test('a flow runs its nodes in arrow order for its actor; other agents leave its tasks alone', () => {
  const { w, run } = workspace();
  const f = run('flow.create', { projectId: 'g', title: 'Setup' }, USER);
  run('flow.update', { flowId: f.id, nodes: [{ taskId: 'hub', x: 0, y: 0 }, { taskId: 'combat', x: 300, y: 0 }, { taskId: 'move', x: 300, y: 200 }] }, USER);
  run('task.update', { taskId: 'combat', after: ['hub'] }, USER);
  run('task.update', { taskId: 'move', after: ['combat'] }, USER);
  run('flow.update', { flowId: f.id, assignee: 'claude-a', status: 'running' }, USER);

  let mine = run('digest', { projectId: 'g' }, AGENT).flows[0];
  assert.deepEqual([mine.mine, mine.done, mine.total], [true, 0, 3]);
  assert.deepEqual(mine.next.map((t) => t.id), ['hub']);
  assert.deepEqual(mine.waiting.map((t) => t.id), ['combat', 'move']);
  // Another agent sees the flow as not its own, and its tasks are not offered to it.
  const other = run('digest', { projectId: 'g' }, OTHER);
  assert.equal(other.flows[0].mine, false);
  assert.ok(!other.next.some((t) => ['hub', 'combat', 'move'].includes(t.id)));

  run('task.start', { taskId: 'hub' });
  run('task.done', { taskId: 'hub', summary: 'Hub shows' });
  mine = run('digest', { projectId: 'g' }, AGENT).flows[0];
  assert.deepEqual(mine.next.map((t) => t.id), ['combat']);
  for (const id of ['combat', 'move']) {
    run('task.start', { taskId: id });
    run('task.done', { taskId: id, summary: 'ok', check: 'all', evidence: { commit: id } });
  }
  const view = run('project.get', { projectId: 'g' }).flows[0];
  assert.deepEqual([view.state, view.done, view.total], ['done', 3, 3]);

  // A deleted task leaves the flow and the arrows; only the user deletes a flow.
  run('task.delete', { taskId: 'combat' }, USER);
  assert.equal(w.flows[0].nodes.length, 2);
  assert.deepEqual(w.tasks.find((t) => t.id === 'move').after, []);
  rejects(() => run('flow.delete', { flowId: f.id }), /only the user/, 403);
  run('flow.delete', { flowId: f.id }, USER);
  assert.equal(w.flows.length, 0);
  validateWorkspace(w);
});

test('a group node covers the tasks inside it', () => {
  const { run } = workspace();
  const f = run('flow.create', { projectId: 'g', id: 'f1', title: 'All of M1' }, USER);
  run('flow.update', { flowId: f.id, nodes: [{ taskId: 'm1', x: 0, y: 0 }], status: 'running' }, USER);
  const d = run('digest', { projectId: 'g' }).flows[0];
  assert.equal(d.total, 2);
  assert.deepEqual(d.next.map((t) => t.id), ['move', 'combat']);
});

test('runs: only the user starts and stops them; the supervisor reports; an ended run leaves nothing in work', () => {
  const { w, run } = workspace();
  rejects(() => run('run.start', { taskId: 'move' }, USER), /no repository folder/);
  run('project.update', { projectId: 'g', repo: 'Game' }, USER);
  rejects(() => run('run.start', { taskId: 'move' }), /only the user/, 403);
  rejects(() => run('run.start', { taskId: 'm1' }, USER), /run a task/);
  const r = run('run.start', { taskId: 'move' }, USER);
  rejects(() => run('run.start', { taskId: 'move' }, USER), /already running/, 409);
  rejects(() => run('run.report', { runId: r.id, status: 'done' }), /only the tracker/, 403);

  // The session takes the task as its actor, then ends without closing it: the task goes back to "todo".
  run('run.report', { runId: r.id, status: 'running', pid: 42 }, { actor: 'tracker' });
  run('task.start', { taskId: 'move' }, { actor: r.actor });
  run('run.report', { runId: r.id, status: 'failed', exitCode: 1, error: 'boom' }, { actor: 'tracker' });
  const t = w.tasks.find((x) => x.id === 'move');
  assert.deepEqual([t.status, t.owner], ['todo', null]);
  assert.ok(w.runs[0].endedAt);

  // A session that ends well is "done" only when its task is; otherwise "unfinished".
  const r2 = run('run.start', { taskId: 'combat' }, USER);
  run('task.start', { taskId: 'combat' }, { actor: r2.actor });
  assert.equal(run('run.report', { runId: r2.id, status: 'done' }, { actor: 'tracker' }).status, 'unfinished');
  const r3 = run('run.start', { taskId: 'combat' }, USER);
  run('task.start', { taskId: 'combat' }, { actor: r3.actor });
  run('task.done', { taskId: 'combat', summary: 'Combat works', evidence: { commit: 'abc' } }, { actor: r3.actor });
  assert.equal(run('run.report', { runId: r3.id, status: 'done' }, { actor: 'tracker' }).status, 'done');

  // A flow run takes the flow for its actor, and pauses it when it ends.
  const f = run('flow.create', { projectId: 'g', title: 'F' }, USER);
  run('flow.update', { flowId: f.id, nodes: [{ taskId: 'hub', x: 0, y: 0 }] }, USER);
  const fr = run('run.start', { flowId: f.id }, USER);
  assert.deepEqual([w.flows[0].assignee, w.flows[0].status], [fr.actor, 'running']);
  run('run.stop', { runId: fr.id }, USER);
  assert.equal(w.runs.at(-1).status, 'stopped', 'a queued run stops at once');
  assert.equal(w.flows[0].status, 'paused', 'and its flow is no longer handed out');
  assert.equal(run('project.get', { projectId: 'g' }).runs.length, 4);
  validateWorkspace(w);
});

test('the work loop: an agent proposes a plan as a flow, runs it when the user says so in chat, and reports', () => {
  const { w, run } = workspace();
  run('project.update', { projectId: 'g', review: true }, USER);
  const plan = run('plan.apply', {
    projectId: 'g',
    note: 'Shop milestone, from the chat of today',
    flow: { id: 'shop-flow', title: 'Shop' },
    nodes: [
      { id: 'shop-ui', title: 'Shop screen', size: 'M' },
      { id: 'shop-data', title: 'Shop data', size: 'S' },
      { id: 'shop-buy', title: 'Buy button', size: 'M', after: ['shop-ui', 'shop-data'] },
    ],
  });
  assert.equal(plan.flow, 'shop-flow');
  const f = w.flows.find((x) => x.id === 'shop-flow');
  assert.equal(f.review, 'pending', 'a flow an agent makes waits for the user');
  assert.deepEqual(w.tasks.find((t) => t.id === 'shop-buy').after, ['shop-ui', 'shop-data']);
  const at = (id) => f.nodes.find((n) => n.taskId === id);
  assert.ok(at('shop-buy').x > at('shop-ui').x, 'the layout puts later work to the right');
  assert.equal(run('digest', { projectId: 'g' }).flows.find((x) => x.id === 'shop-flow').review, 'pending');
  assert.equal(run('attention', {}).flows.length, 1);

  // The agent cannot start it on its own; the user's words in chat are the OK.
  rejects(() => run('flow.update', { flowId: 'shop-flow', status: 'running' }), /userSaid/, 403);
  rejects(() => run('flow.approve', { flowId: 'shop-flow' }), /only the user/, 403);
  run('flow.update', { flowId: 'shop-flow', status: 'running', userSaid: 'ok chạy đi' });
  assert.deepEqual([f.status, f.assignee, f.review ?? null], ['running', 'claude-a', null]);
  assert.equal(w.tasks.find((t) => t.id === 'shop-ui').review, null, 'its proposed tasks are approved with it');
  assert.match(w.events.filter((e) => e.type === 'approved').at(-1).text, /ok chạy đi/);
  assert.deepEqual(run('digest', { projectId: 'g' }).flows.find((x) => x.id === 'shop-flow').next.map((t) => t.id), ['shop-ui', 'shop-data']);

  // The chat session shows as working; the report closes the loop and comes back in the next digest.
  run('task.start', { taskId: 'shop-ui' });
  assert.deepEqual(run('activity', {}).map((s) => [s.actor, s.doing.length, s.flows.length]), [['claude-a', 1, 1]]);
  assert.equal(projectSummary(w, 'g').sessions, 1);
  run('flow.report', { flowId: 'shop-flow', text: '## Shop\n- Shop screen: done (abc)\n- Next: prices' });
  const d = run('digest', { projectId: 'g' }).flows.find((x) => x.id === 'shop-flow');
  assert.match(d.lastReport.text, /Next: prices/);
  assert.equal(w.events.at(-1).type, 'report');
  validateWorkspace(w);
});

test('the user approves a flow in the UI; an agent changing an idle flow proposes it again; a run reports for a silent session', () => {
  const { w, run } = workspace();
  run('plan.apply', { projectId: 'g', flow: { id: 'f', title: 'Core' }, nodes: [{ id: 'move', title: 'Movement' }, { id: 'combat', title: 'Combat', after: ['move'] }] });
  const f = w.flows.find((x) => x.id === 'f');
  run('flow.approve', { flowId: 'f' }, USER);
  assert.equal(f.review, null);
  run('flow.update', { flowId: 'f', nodes: [{ taskId: 'move', x: 0, y: 0 }] });
  assert.equal(f.review, 'pending', 'a changed flow is a new proposal');

  run('project.update', { projectId: 'g', repo: 'Game' }, USER);
  const r = run('run.start', { flowId: 'f' }, USER);
  assert.equal(f.review, null, 'Run is the user\'s OK');
  run('run.report', { runId: r.id, status: 'running' }, { actor: 'tracker' });
  run('run.report', { runId: r.id, status: 'done', summary: 'Movement started, combat waits.' }, { actor: 'tracker' });
  assert.deepEqual([f.reports.at(-1).by, f.reports.at(-1).fromRun], [r.actor, r.id]);
  rejects(() => run('plan.apply', { projectId: 'g', nodes: [{ id: 'move', title: 'Movement', after: ['combat'] }] }), /loop/, 409);
  validateWorkspace(w);
});

const LOCKED = 423;

test('live work: changes to a task an agent is doing are refused until the user stops it', () => {
  const { w, run } = workspace();
  run('task.add', { projectId: 'g', parentId: 'm1', id: 'prep', title: 'Input map', size: 'S' }, USER);
  run('task.start', { taskId: 'prep' });
  run('task.done', { taskId: 'prep', summary: 'Keys mapped' });
  run('task.update', { taskId: 'move', after: ['prep'] }, USER);
  run('task.start', { taskId: 'move' }); // claude-a is doing "move" now

  const blocked = [
    ['task.update', { taskId: 'move', title: 'Walk' }],
    ['task.update', { taskId: 'move', after: [] }],
    ['task.update', { taskId: 'move', criteria: ['Only this'] }],
    ['task.move', { taskId: 'move', parentId: 'm2' }],
    ['task.move', { taskId: 'hub', parentId: 'move' }],
    ['task.add', { projectId: 'g', parentId: 'move', title: 'Sprint' }],
    ['task.drop', { taskId: 'move', reason: 'cut' }],
    ['task.delete', { taskId: 'm1' }],
    ['task.done', { taskId: 'move', summary: 'x', check: 'all' }],
    ['task.start', { taskId: 'move' }],
    ['task.reopen', { taskId: 'prep', reason: 'redo' }], // "move" runs after it
    ['plan.apply', { projectId: 'g', nodes: [{ id: 'move', title: 'Walk' }] }],
    ['plan.apply', { projectId: 'g', nodes: [{ id: 'move', title: 'Movement', children: [{ id: 'run-anim', title: 'Run' }] }] }],
  ];
  for (const [name, args] of blocked) {
    assert.throws(() => run(name, args, USER), (e) => e.status === LOCKED && e.details.live.taskId === 'move', `${name} ${JSON.stringify(args)}`);
  }
  // The session doing it still works on it; the user still answers, unblocks and adds elsewhere.
  run('task.update', { taskId: 'move', description: 'WASD and arrows' });
  run('task.add', { projectId: 'g', parentId: 'm2', title: 'Settings' }, USER);

  // Stop, then the change goes through; the agent may not write to it again without the user's word.
  const out = run('work.stop', { taskId: 'move', reason: 'Changing the scope' }, USER);
  assert.deepEqual(out.tasks, ['move']);
  const t = w.tasks.find((x) => x.id === 'move');
  assert.deepEqual([t.status, t.owner, t.stopped.owner], ['todo', null, 'claude-a']);
  run('task.update', { taskId: 'move', title: 'Walk' }, USER);
  rejects(() => run('task.progress', { taskId: 'move', note: 'still going' }), /user stopped/, 409);
  rejects(() => run('task.start', { taskId: 'move' }), /userSaid/, 409);
  assert.ok(!nextTasks(w, 'g').some((x) => x.id === 'move'), 'a stopped task is not offered as NEXT');
  run('task.start', { taskId: 'move', userSaid: 'ok làm tiếp đi' });
  assert.equal(t.stopped, undefined);
  assert.match(w.events.filter((e) => e.type === 'note').at(-1).text, /ok làm tiếp đi/);
  validateWorkspace(w);
});

test('live work: a running flow belongs to its session; the user stops the flow to change it', () => {
  const { w, run } = workspace();
  const f = run('flow.create', { projectId: 'g', id: 'f', title: 'UI' }, USER);
  run('flow.update', { flowId: 'f', nodes: [{ taskId: 'hub', x: 0, y: 0 }] }, USER);
  run('flow.update', { flowId: 'f', status: 'running', userSaid: 'chạy đi' }); // claude-a runs it
  run('task.start', { taskId: 'hub' });

  const blocked = [
    ['task.update', { taskId: 'hub', title: 'Home' }],
    ['task.add', { projectId: 'g', parentId: 'hub', title: 'Badge' }],
    ['task.move', { taskId: 'hub', parentId: 'm1' }],
    ['flow.update', { flowId: 'f', nodes: [{ taskId: 'hub', x: 0, y: 0 }, { taskId: 'combat', x: 300, y: 0 }] }],
    ['flow.update', { flowId: 'f', assignee: 'claude-b' }],
    ['flow.update', { flowId: 'f', status: 'draft' }],
    ['flow.delete', { flowId: 'f' }],
    ['run.start', { flowId: 'f' }],
    ['plan.apply', { projectId: 'g', flow: { id: 'f', title: 'UI' }, nodes: [{ id: 'combat', title: 'Combat' }] }],
    ['project.update', { projectId: 'g', archived: true }],
  ];
  for (const [name, args] of blocked) {
    assert.throws(() => run(name, args, USER), (e) => e.status === LOCKED && e.details.live.flowId === 'f', `${name} ${JSON.stringify(args)}`);
  }
  rejects(() => run('task.update', { taskId: 'hub', title: 'Home' }, OTHER), /being done by claude-a/, 409);
  rejects(() => run('task.add', { projectId: 'g', parentId: 'hub', title: 'Badge', reason: 'r' }, OTHER), /running flow/, LOCKED);
  rejects(() => run('task.start', { taskId: 'hub' }, OTHER), /being done by claude-a/, 409);
  // Moving nodes on the board and renaming the flow change nothing that runs.
  run('flow.update', { flowId: 'f', title: 'UI pass', nodes: [{ taskId: 'hub', x: 80, y: 40 }] }, USER);

  run('work.stop', { flowId: 'f' }, USER);
  assert.deepEqual([f.status, w.tasks.find((t) => t.id === 'hub').status], ['paused', 'todo']);
  run('task.update', { taskId: 'hub', title: 'Home' }, USER);
  run('flow.update', { flowId: 'f', nodes: [{ taskId: 'hub', x: 0, y: 0 }, { taskId: 'combat', x: 300, y: 0 }] }, USER);
  assert.ok(!nextTasks(w, 'g', 5, 'claude-b').some((t) => t.id === 'combat'), 'a paused flow keeps its tasks from other agents');
  // Saying "go on" in chat starts the flow again and lifts the stop on its tasks.
  run('flow.update', { flowId: 'f', status: 'running', userSaid: 'tiếp tục' });
  assert.equal(w.tasks.find((t) => t.id === 'hub').stopped, undefined);
  validateWorkspace(w);
});

test('live work: a tracker run holds its task and its project folder until it is stopped', () => {
  const { w, run } = workspace();
  run('project.update', { projectId: 'g', repo: 'Game' }, USER);
  const r = run('run.start', { taskId: 'combat' }, USER);
  rejects(() => run('task.update', { taskId: 'combat', size: 'S' }, USER), /being worked on by run-1/, LOCKED);
  rejects(() => run('project.update', { projectId: 'g', repo: 'Elsewhere' }, USER), /run-1 is running/, LOCKED);
  run('project.update', { projectId: 'g', stage: 'production' }, USER); // other fields stay free
  const out = run('work.stop', { taskId: 'combat' }, USER);
  assert.deepEqual(out.runs, [r.id]);
  assert.equal(w.runs[0].status, 'stopped');
  run('task.update', { taskId: 'combat', size: 'S' }, USER);
  run('project.update', { projectId: 'g', repo: 'Elsewhere' }, USER);
  rejects(() => run('work.stop', { taskId: 'combat' }), /only the user/, 403);
});
