#!/usr/bin/env node
// Command-line client of the tracker. No dependencies; Node.js 22+.
//
//   node nhanh.mjs actions                           every action with its arguments
//   node nhanh.mjs digest <projectId>                what to read when a session starts
//   node nhanh.mjs tree <projectId>                  the whole plan as text
//   node nhanh.mjs <action> key=value ...            short arguments
//   node nhanh.mjs <action> --file request.json      long or multi-line arguments ({...arguments})
//   node nhanh.mjs <action> --stdin                  the same from standard input
//
// Options: --actor <name> (or NHANH_ACTOR), --request <id> (safe retry), --raw (full JSON instead of text).
// NHANH_URL changes the server (default http://127.0.0.1:5173). Errors go to stderr with exit code 1.
import fs from 'node:fs';

const BASE = (process.env.NHANH_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');

function parseCommandLine(argv) {
  const out = { action: undefined, args: {}, positional: [], actor: process.env.NHANH_ACTOR, requestId: undefined, raw: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--raw') out.raw = true;
    else if (a === '--actor') out.actor = argv[++i];
    else if (a === '--request') out.requestId = argv[++i];
    else if (a === '--file') Object.assign(out.args, JSON.parse(fs.readFileSync(argv[++i], 'utf8').replace(/^﻿/, '')));
    else if (a === '--stdin') Object.assign(out.args, JSON.parse(fs.readFileSync(0, 'utf8')));
    else if (a === '--json') Object.assign(out.args, JSON.parse(argv[++i]));
    else if (/^[A-Za-z]+=/.test(a)) {
      const [key, ...rest] = a.split('=');
      const text = rest.join('=');
      // check=1,2 or labels=a,b style lists are not guessed: use JSON for anything that is not plain text.
      try { out.args[key] = /^(\[|\{|true$|false$|null$|-?\d+(\.\d+)?$)/.test(text) ? JSON.parse(text) : text; } catch { out.args[key] = text; }
    } else if (out.action === undefined) out.action = a; // options may come before or after the action
    else out.positional.push(a);
  }
  return out;
}

async function http(path, init) {
  let res;
  try {
    res = await fetch(BASE + path, init);
  } catch {
    throw Error(`The tracker does not answer at ${BASE}. It is optional: carry on with the work and say so; do not start a second server.`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Error(body.error || `HTTP ${res.status}`);
  return body;
}

async function call(name, args, { actor, requestId } = {}) {
  const health = await http('/api/health');
  if (health.service !== 'nhanh-local') throw Error(`${BASE} is not the tracker; no data was sent.`);
  const { token } = await http('/api/session');
  return http('/api/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Nhanh-Token': token },
    body: JSON.stringify({ name, arguments: args, actor, requestId }),
  });
}

// ---- text output: short, so reading the tracker costs an agent few tokens ----------------------------------------
const MARK = { todo: '○', doing: '●', blocked: '■', done: '✔', dropped: '✕' };
const pct = (n) => `${Math.round(n * 100)}%`;
const counts = (c) => ['doing', 'blocked', 'todo', 'done'].filter((s) => c[s]).map((s) => `${s} ${c[s]}`).join(' · ') || 'no tasks';

function taskLine(t) {
  const crit = t.criteria?.length ? ` ${t.criteria.filter((c) => c.done).length}/${t.criteria.length}` : '';
  const who = t.status === 'doing' && t.owner ? ` — ${t.owner}${t.branch ? ` on ${t.branch}` : ''}` : '';
  const origin = t.origin === 'user' ? ' (user request)' : t.origin === 'agent' ? ' (added by agent)' : '';
  return `${MARK[t.status] || '○'} ${t.id}  ${t.title}${t.size ? ` [${t.size}]` : ''}${crit}${who}${origin}`;
}
function taskDetail(t, indent = '    ') {
  const lines = [];
  if (t.description) lines.push(`${indent}${t.description.split('\n').join(`\n${indent}`)}`);
  for (const c of t.criteria || []) lines.push(`${indent}[${c.done ? 'x' : ' '}] ${c.id} ${c.text}`);
  if (t.blockedReason && t.status === 'blocked') lines.push(`${indent}blocked: ${t.blockedReason}`);
  if (t.question) lines.push(`${indent}question: ${t.question.text}${t.question.answer ? `\n${indent}ANSWER: ${t.question.answer}` : ' (not answered yet)'}`);
  return lines;
}

function digestText(d) {
  const out = [`${d.project.title} (${d.project.id}) · stage ${d.project.stage} · ${pct(d.summary.progress)} · ${counts(d.summary.counts)}`];
  if (!d.planned) out.push('', 'NO PLAN YET: set it up with plan.apply (see the skill, "Set up the plan").');
  const section = (title, list, detail) => {
    if (!list.length) return;
    out.push('', `${title}:`);
    for (const t of list) { out.push(`  ${taskLine(t)}`); if (detail) out.push(...taskDetail(t)); }
  };
  section('INBOX — the user wrote this, no agent has picked it up (task.ack or task.start each)', d.inbox, true);
  for (const f of d.flows || []) {
    const owner = f.assignee ? `for ${f.assignee}` : 'for any agent';
    const head = `FLOW ${f.id} "${f.title}" — ${f.status}, ${owner}, ${f.done}/${f.total} done`;
    const report = () => {
      if (!f.lastReport) return;
      out.push(`  last report (${f.lastReport.at.slice(0, 16).replace('T', ' ')}, ${f.lastReport.by}):`);
      for (const line of f.lastReport.text.split('\n').slice(0, 12)) out.push(`    ${line}`);
    };
    if (f.status === 'draft') {
      out.push('', f.review === 'pending'
        ? `${head} (PROPOSED: waits for the user's OK; do not start its tasks. When the user says to run it in chat: flow.update flowId=${f.id} status=running userSaid="<their words>")`
        : `${head} (approved, not running: the user starts it with Run, or tells you in chat: flow.update flowId=${f.id} status=running userSaid="<their words>")`);
      report();
      continue;
    }
    if (f.status === 'done') { out.push('', `${head} (finished)`); report(); continue; }
    if (!f.mine) { out.push('', `${head} (not yours: leave its tasks alone)`); continue; }
    if (f.status === 'paused') { out.push('', `${head} (paused: do not take its tasks)`); report(); continue; }
    out.push('', `${head}. YOURS: take its NEXT task first, in this order; when it is done, digest again for the next.`);
    for (const t of f.doing) out.push(`  doing: ${taskLine(t)}`);
    for (const t of f.next) { out.push(`  NEXT: ${taskLine(t)}`); out.push(...taskDetail(t)); }
    for (const t of f.waiting) out.push(`  then: ${taskLine(t)} — waits for ${t.waitingOn.join(t.afterMode === 'any' ? ' or ' : ', ') || 'review or sub-tasks'}`);
    report();
  }
  section('IN PROGRESS', d.doing, true);
  section('BLOCKED', d.blocked, true);
  section('WAITING FOR THE USER', d.waitingForUser.filter((t) => t.status !== 'blocked' && t.status !== 'doing'), true);
  section('AWAITING REVIEW — proposed, the user has not approved it yet: do not start it', d.awaitingReview || [], false);
  section('NEXT (in plan order)', d.next, true);
  if (d.recent.length) {
    out.push('', 'RECENT:');
    for (const e of d.recent) out.push(`  ${e.at.slice(0, 16).replace('T', ' ')} ${e.actor} ${e.type}${e.taskId ? ` ${e.taskId}` : ''}: ${e.text.split('\n')[0].slice(0, 140)}`);
  }
  return out.join('\n');
}

function treeText(p) {
  const out = [`${p.project.title} (${p.project.id}) · stage ${p.project.stage} · ${pct(p.summary.progress)} · ${counts(p.summary.counts)}`];
  const walk = (parentId, depth) => {
    for (const t of p.tasks.filter((x) => x.parentId === parentId).sort((a, b) => a.order - b.order)) {
      const pad = '  '.repeat(depth + 1);
      if (t.kind === 'group') out.push(`${pad}▸ ${t.id}  ${t.title}  ${pct(t.rollup.progress)} (${t.rollup.status})`);
      else out.push(`${pad}${taskLine(t)}`);
      walk(t.id, depth + 1);
    }
  };
  walk(null, 0);
  return out.join('\n');
}

function listText(projects) {
  return projects.map((p) => {
    const s = p.summary;
    const doing = s.doing.map((t) => `${t.title} (${t.owner})`).join('; ');
    return `${p.id}  ${p.title} · ${p.stage} · ${pct(s.progress)} · ${counts(s.counts)}${s.needsUser ? ` · needs the user: ${s.needsUser}` : ''}${doing ? `\n    doing: ${doing}` : ''}`;
  }).join('\n') || 'No projects.';
}

async function main() {
  const cmd = parseCommandLine(process.argv.slice(2));
  if (!cmd.action || cmd.action === 'help' || cmd.action === '--help') {
    console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 12).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    return;
  }
  if (cmd.action === 'actions') {
    const { token } = await http('/api/session');
    const { actions } = await http('/api/actions', { headers: { 'X-Nhanh-Token': token } });
    if (cmd.raw) return console.log(JSON.stringify(actions, null, 2));
    for (const a of actions) {
      const args = Object.entries(a.arguments).map(([k, v]) => (v.includes('required') ? k : `${k}?`)).join(', ');
      console.log(`${a.name}(${args})${a.readOnly ? '  [read]' : ''}\n    ${a.description}`);
    }
    return undefined;
  }
  // Shortcuts that take the project id as a plain word.
  let name = cmd.action;
  if (name === 'digest' || name === 'tree') {
    if (cmd.positional[0]) cmd.args.projectId = cmd.positional[0];
    name = name === 'tree' ? 'project.get' : 'digest';
  }
  const { result, seq } = await call(name, cmd.args, cmd);
  if (cmd.raw) return console.log(JSON.stringify({ seq, result }, null, 2));
  if (cmd.action === 'digest') return console.log(digestText(result));
  if (cmd.action === 'tree') return console.log(treeText(result));
  if (name === 'projects.list') return console.log(listText(result));
  if (name === 'plan.apply') {
    const flow = result.flow ? `\nflow ${result.flow}: proposed, waits for the user's OK (web UI, or their words in chat)` : '';
    return console.log(`created ${result.created.length}, updated ${result.updated.length}${result.created.length ? `\n${result.created.join('\n')}` : ''}${flow}`);
  }
  if (name.startsWith('task.') && result?.id) return console.log([taskLine(result), ...taskDetail(result, '  ')].join('\n'));
  return console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => { console.error(`nhanh: ${e.message}`); process.exitCode = 1; });
