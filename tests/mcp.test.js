// The MCP server (skills/.../scripts/nhanh-mcp.mjs) as a client sees it: a child process speaking JSON-RPC over
// stdio to a real tracker on a temporary data folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createService } from '../server/service.js';
import { render, snapshotFile } from '../scripts/write-skill-actions.mjs';

const MCP = fileURLToPath(new URL('../skills/nhanh-project-tracking/scripts/nhanh-mcp.mjs', import.meta.url));

async function tracker() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nhanh-mcp-'));
  const service = createService({ root: path.join(root, 'data') });
  const server = http.createServer((req, res) => service.handle(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const stop = async () => {
    service.close();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  };
  return { root, base: `http://127.0.0.1:${server.address().port}`, service, stop };
}

/** Starts the MCP server and returns request(method, params) → result, and notify(method). */
function mcp({ cwd, env = {}, args = [] }) {
  const child = spawn(process.execPath, [MCP, ...args], { cwd, env: { ...process.env, NHANH_ACTOR: '', NHANH_PROJECT: '', ...env }, stdio: ['pipe', 'pipe', 'inherit'] });
  const waiting = new Map();
  let buffer = '';
  let id = 0;
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      waiting.get(message.id)?.(message);
      waiting.delete(message.id);
    }
  });
  const request = (method, params) => new Promise((resolve) => {
    id += 1;
    waiting.set(id, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  const notify = (method) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`);
  const close = () => new Promise((resolve) => { child.on('close', resolve); child.stdin.end(); });
  return { request, notify, close };
}
const text = (response) => response.result.content.map((c) => c.text).join('\n');

test('the shipped action list matches the tracker (npm run skill:actions)', async () => {
  const shipped = (await fs.readFile(snapshotFile, 'utf8')).replace(/\r\n/g, '\n');
  assert.equal(shipped, render());
});

test('MCP: tools for agents, defaults from project.yaml, short texts, and the tracker\'s refusals as tool errors', async () => {
  const t = await tracker();
  await t.service.call('project.create', { id: 'game', title: 'Game' }, { actor: 'human' });
  const folder = path.join(t.root, 'Game');
  await fs.mkdir(folder);
  await fs.writeFile(path.join(folder, 'project.yaml'), 'name: Game\ntracker:\n  project_id: "game"\n  actor: "claude-game"   # sessions write as this\nengine: unity\n');
  const client = mcp({ cwd: folder, env: { NHANH_URL: t.base } });
  try {
    const init = await client.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    assert.equal(init.result.protocolVersion, '2025-06-18');
    assert.equal(init.result.serverInfo.name, 'nhanh');
    assert.match(init.result.instructions, /You write as claude-game/);
    client.notify('notifications/initialized');

    const { tools } = (await client.request('tools/list')).result;
    const names = tools.map((x) => x.name);
    assert.ok(names.includes('digest') && names.includes('task_start') && names.includes('flow_report'));
    for (const userOnly of ['task_delete', 'run_start', 'work_stop', 'flow_approve', 'task_approve', 'run_report']) assert.ok(!names.includes(userOnly), userOnly);
    assert.ok(names.every((n) => /^[a-zA-Z0-9_-]{1,64}$/.test(n)), 'names clients accept');
    const add = tools.find((x) => x.name === 'task_add');
    assert.deepEqual(add.inputSchema.required, ['title'], 'projectId is optional when project.yaml names the project');
    assert.equal(add.inputSchema.additionalProperties, false);
    assert.equal(tools.find((x) => x.name === 'digest').annotations.readOnlyHint, true);

    const added = await client.request('tools/call', { name: 'task_add', arguments: { title: 'Shop', size: 'M', reason: 'Asked in chat' } });
    assert.match(text(added), /○ game-shop {2}Shop \[M\]/);
    assert.match(text(await client.request('tools/call', { name: 'task_start', arguments: { taskId: 'game-shop', branch: 'task/shop' } })), /claude-game on task\/shop/);
    assert.match(text(await client.request('tools/call', { name: 'digest', arguments: {} })), /IN PROGRESS:[\s\S]*game-shop/);

    // The tracker's refusals come back as tool errors the agent can read.
    const done = await client.request('tools/call', { name: 'task_done', arguments: { taskId: 'game-shop', summary: 'Shop opens' } });
    assert.equal(done.result.isError, true);
    assert.match(text(done), /needs evidence/);
    const hidden = await client.request('tools/call', { name: 'task_delete', arguments: { taskId: 'game-shop' } });
    assert.equal(hidden.result.isError, true);
    assert.equal((await client.request('nope')).error.code, -32601);
    assert.deepEqual((await client.request('ping')).result, {});
  } finally {
    await client.close();
    await t.stop();
  }
});

test('MCP: without an actor reads work and writes say how to set one; without the tracker the tools are still listed', async () => {
  const t = await tracker();
  await t.service.call('project.create', { id: 'game', title: 'Game' }, { actor: 'human' });
  const client = mcp({ cwd: t.root, env: { NHANH_URL: t.base } });
  try {
    await client.request('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
    assert.match(text(await client.request('tools/call', { name: 'projects_list', arguments: {} })), /game {2}Game/);
    const write = await client.request('tools/call', { name: 'task_add', arguments: { projectId: 'game', title: 'X', reason: 'r' } });
    assert.equal(write.result.isError, true);
    assert.match(text(write), /--actor/);
  } finally {
    await client.close();
    await t.stop();
  }
  const offline = mcp({ cwd: os.tmpdir(), env: { NHANH_URL: 'http://127.0.0.1:9' }, args: ['--actor', 'claude-x', '--project', 'game'] });
  try {
    const { tools } = (await offline.request('tools/list')).result;
    assert.ok(tools.length > 20, 'listed from the shipped copy');
    const call = await offline.request('tools/call', { name: 'digest', arguments: {} });
    assert.equal(call.result.isError, true);
    assert.match(text(call), /does not answer/);
  } finally {
    await offline.close();
  }
});
