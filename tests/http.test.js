// The real HTTP server on a temporary data folder: token, origin checks, calls, the change stream, the CLI and
// what is written to disk.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createService } from '../server/service.js';
import { acquireLock } from '../server/lock.js';

const CLI = fileURLToPath(new URL('../scripts/nhanh.mjs', import.meta.url));

async function start(root) {
  const service = createService({ root });
  const server = http.createServer((req, res) => service.handle(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const stop = () => { service.close(); return new Promise((resolve) => server.close(resolve)); };
  return { base, stop, service };
}
const tempDir = () => fs.mkdtemp(path.join(os.tmpdir(), 'nhanh-test-'));

test('the API needs the session token and refuses other origins', async () => {
  const root = await tempDir();
  const { base, stop } = await start(root);
  try {
    assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { ok: true, service: 'nhanh-local', apiVersion: 2 });
    const { token } = await (await fetch(`${base}/api/session`)).json();
    const post = (body, headers = {}) => fetch(`${base}/api/call`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Nhanh-Token': token, ...headers }, body: JSON.stringify(body),
    });

    assert.equal((await post({ name: 'projects.list' }, { 'X-Nhanh-Token': 'wrong' })).status, 403);
    assert.equal((await post({ name: 'projects.list' }, { Origin: 'http://evil.example' })).status, 403);
    assert.equal((await fetch(`${base}/api/call`, { method: 'POST', headers: { 'X-Nhanh-Token': token }, body: '{}' })).status, 415);

    const created = await post({ name: 'project.create', arguments: { id: 'g', title: 'Game' }, actor: 'claude-a' });
    assert.equal(created.status, 200);
    assert.equal((await created.json()).result.id, 'g');
    const missing = await post({ name: 'task.start', arguments: { taskId: 'nope' }, actor: 'claude-a' });
    assert.equal(missing.status, 404);
    assert.match((await missing.json()).error, /not found/);

    const actions = await (await fetch(`${base}/api/actions`, { headers: { 'X-Nhanh-Token': token } })).json();
    assert.ok(actions.actions.some((a) => a.name === 'plan.apply'));

    const saved = JSON.parse(await fs.readFile(path.join(root, 'workspace.json'), 'utf8'));
    assert.deepEqual([saved.version, saved.projects[0].id], [2, 'g']);
  } finally {
    await stop();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('writes at the same time all land, and each one reaches the change stream', async () => {
  const root = await tempDir();
  const { base, stop, service } = await start(root);
  try {
    await service.call('project.create', { id: 'g', title: 'Game' }, { actor: 'claude-a' });
    const { token } = await (await fetch(`${base}/api/session`)).json();
    const stream = await fetch(`${base}/api/stream?token=${token}`);
    const reader = stream.body.getReader();
    let seen = '';
    const pump = (async () => { for (;;) { const { done, value } = await reader.read(); if (done) return; seen += Buffer.from(value).toString(); } })();

    await Promise.all(Array.from({ length: 20 }, (_, i) =>
      service.call('task.add', { projectId: 'g', title: `Task ${i}`, reason: 'parallel' }, { actor: `agent-${i % 4}` })));
    const { result } = await service.call('project.get', { projectId: 'g' });
    assert.equal(result.tasks.length, 20);
    assert.equal(new Set(result.tasks.map((t) => t.id)).size, 20);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(seen.match(/event: change/g).length, 20);
    await reader.cancel();
    await pump;
  } finally {
    await stop();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('the CLI talks to the server, prints short text and exits 1 on an error', async () => {
  const root = await tempDir();
  const { base, stop } = await start(root);
  const cli = (...args) => new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { env: { ...process.env, NHANH_URL: base, NHANH_ACTOR: 'claude-cli' } },
      (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr }));
  });
  try {
    assert.equal((await cli('project.create', 'id=g', 'title=Game')).code, 0);
    const plan = path.join(root, 'plan.json');
    await fs.writeFile(plan, JSON.stringify({ projectId: 'g', nodes: [{ id: 'm', title: 'Core', children: [{ id: 't', title: 'Move', size: 'S', criteria: ['Moves'] }] }] }));
    assert.match((await cli('plan.apply', '--file', plan)).stdout, /created 2/);
    assert.match((await cli('task.start', 'taskId=t', 'branch=task/move')).stdout, /● t {2}Move \[S\] 0\/1 — claude-cli on task\/move/);
    const digest = (await cli('digest', 'g')).stdout;
    assert.match(digest, /IN PROGRESS:/);
    assert.match(digest, /\[ \] c1 Moves/);
    assert.match((await cli('tree', 'g')).stdout, /▸ m {2}Core/);
    const failed = await cli('task.done', 'taskId=t', 'summary=Done');
    assert.equal(failed.code, 1);
    assert.match(failed.stderr, /criteria not met/);
    assert.equal((await cli('--actor', 'human', 'task.done', 'taskId=t', 'summary=Done', 'check=all')).code, 0);
  } finally {
    await stop();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('a v1 data folder is converted on first read and the old file is kept', async () => {
  const root = await tempDir();
  const v1 = { revision: 7, data: { version: 1, projects: [{ id: 'p', title: 'Old', description: '', color: '#112233' }], tasks: [{ id: 'a', projectId: 'p', parentId: null, order: 0, title: 'Task', done: true, notes: '', attachments: [] }], ideas: [] } };
  await fs.writeFile(path.join(root, 'workspace.json'), JSON.stringify(v1));
  const { stop, service } = await start(root);
  try {
    const { result } = await service.call('project.get', { projectId: 'p' });
    assert.equal(result.tasks[0].status, 'done');
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'workspace.v1.json'), 'utf8')), v1);
    assert.equal(JSON.parse(await fs.readFile(path.join(root, 'workspace.json'), 'utf8')).version, 2);
  } finally {
    await stop();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('one server per data folder', async () => {
  const root = await tempDir();
  const release = await acquireLock(root);
  try {
    await assert.rejects(acquireLock(root), /already served by PID/);
  } finally {
    await release();
    await fs.rm(root, { recursive: true, force: true });
  }
});
