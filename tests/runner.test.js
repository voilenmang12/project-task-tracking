// The run supervisor, with a stand-in for the Claude Code CLI (tests/fake-claude.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../server/service.js';
import { createRunner, runEnv } from '../server/runner.js';

const fake = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fake-claude.mjs');
const USER = { actor: 'human' };

async function setup() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'nhanh-run-'));
  const root = path.join(base, 'data');
  await fs.mkdir(path.join(base, 'Game'), { recursive: true });
  const service = createService({ root });
  const runner = createRunner({ service, root, workspaceDir: base, port: 1, command: [process.execPath, fake] });
  service.setRunner(runner);
  const run = async (name, args, options = USER) => (await service.call(name, args, options)).result;
  await run('project.create', { id: 'g', title: 'Game', repo: 'Game' });
  await run('task.add', { projectId: 'g', id: 'a', title: 'First' });
  await run('task.add', { projectId: 'g', id: 'b', title: 'Second' });
  const runOf = async (id) => (await service.store.read()).runs.find((r) => r.id === id);
  const until = async (id, status) => {
    for (let i = 0; i < 100; i += 1) {
      if ((await runOf(id))?.status === status) return runOf(id);
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.fail(`${id} never became ${status}: ${(await runOf(id))?.status}`);
  };
  const cleanup = () => fs.rm(base, { recursive: true, force: true });
  return { service, runner, run, runOf, until, cleanup, base };
}

test('a run starts the CLI in the repository, keeps a readable log and records the report', async () => {
  const s = await setup();
  try {
    const r = await s.run('run.start', { taskId: 'a', note: 'Keep it small' });
    assert.equal(r.actor, 'run-1');
    const done = await s.until('run-1', 'unfinished'); // the session ended well, but task a is not done
    assert.equal(done.sessionId, 'fake-session');
    assert.match(done.summary, /finished on task\/x/);
    const log = s.runner.readLog('run-1').text;
    assert.match(log, /💬 Actor run-1; task/);
    assert.match(log, /→ Bash: git checkout -b task\/x/);
    assert.match(log, /allowed=Bash\(node [^)]*nhanh\.mjs"?:\*\); prompt uses it: true/, 'only the tracker CLI is pre-approved, and the prompt names it');
    assert.match(log, /■ Kết thúc \(success, 3 lượt · \$0\.12\)/);
    assert.equal(s.runner.readLog('../x').text, '', 'only run logs are served');
    assert.doesNotMatch(log, /LEAKED/, 'a host Claude Code session does not leak into the run');
  } finally { await s.cleanup(); }
});

test('one run per repository at a time; the user stops a run; a missing folder fails the run', async () => {
  const s = await setup();
  process.env.FAKE_SLEEP = '4000';
  try {
    await s.run('run.start', { taskId: 'a' });
    await s.run('run.start', { taskId: 'b' });
    await s.until('run-1', 'running');
    assert.equal((await s.runOf('run-2')).status, 'queued', 'the second waits for the repository');
    await s.run('run.stop', { runId: 'run-1' });
    await s.until('run-1', 'stopped');
    await s.until('run-2', 'running');
    await s.run('run.stop', { runId: 'run-2' });
    await s.until('run-2', 'stopped');
  } finally {
    delete process.env.FAKE_SLEEP;
  }
  try {
    await s.run('project.update', { projectId: 'g', repo: 'Nowhere' });
    await s.run('run.start', { taskId: 'a' });
    const failed = await s.until('run-3', 'failed');
    assert.match(failed.error, /not found/);
  } finally { await s.cleanup(); }
});

test('a run whose session died while the tracker was down is marked interrupted', async () => {
  const s = await setup();
  try {
    await s.service.store.transact((w) => {
      w.runs.push({ id: 'run-9', projectId: 'g', target: { kind: 'task', id: 'a' }, title: 'First', actor: 'run-9', repo: 'Game', status: 'running', pid: 999999, createdAt: '' });
      return { changed: true };
    });
    await s.runner.recover();
    assert.equal((await s.runOf('run-9')).status, 'interrupted');
  } finally { await s.cleanup(); }
});

test('a run gets a clean environment and a plain fix when the CLI is not signed in', async () => {
  const env = runEnv({ PATH: 'p', CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'desktop', CLAUDE_CODE_SESSION_ID: 's', ANTHROPIC_BASE_URL: 'http://proxy', ANTHROPIC_API_KEY: 'k' }, { NHANH_ACTOR: 'run-1' });
  assert.deepEqual(env, { PATH: 'p', ANTHROPIC_API_KEY: 'k', NHANH_ACTOR: 'run-1' });
  assert.equal(runEnv({ ANTHROPIC_BASE_URL: 'http://mine' }, {}).ANTHROPIC_BASE_URL, 'http://mine', 'a base URL the user set stays');

  const s = await setup();
  process.env.FAKE_NOT_LOGGED_IN = '1';
  try {
    await s.run('run.start', { taskId: 'a' });
    const failed = await s.until('run-1', 'failed');
    assert.match(failed.error, /chưa đăng nhập.*\/login/);
    assert.equal(failed.summary, '', 'an error is not shown as the report');
    assert.match(s.runner.readLog('run-1').text, /⚠ Claude Code CLI chưa đăng nhập/);
  } finally {
    delete process.env.FAKE_NOT_LOGGED_IN;
    await s.cleanup();
  }
});
