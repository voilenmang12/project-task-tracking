// The rules of the actions, run on a workspace in memory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyWorkspace, nextTasks, projectSummary, rollup, validateWorkspace } from '../shared/model.js';
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
  run('task.update', { taskId: 'move', title: 'Player movement' }, USER); // the user always can
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
