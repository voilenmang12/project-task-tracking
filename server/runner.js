// The run supervisor: starts one Claude Code session (`claude -p`) per run the user starts in the web UI, in the
// project's repository, and records what it does. The session is the lead of its run: it makes the branch, splits
// the work for its subagents and reports to the tracker through the skill's CLI, as actor "run-<n>".
//
// One run at a time per repository, so two sessions never edit the same checkout; the others wait in the queue.
// Permissions are the repository's own (.claude/settings*.json), and in print mode a tool the settings do not allow
// is refused instead of waiting for a person. The one addition is the tracker CLI itself (trackerCli), the run's
// channel for reporting; nothing in the repository is widened.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTIVE_RUN } from '../shared/model.js';
import { RUNNER } from './actions.js';

/**
 * The environment of a run: the tracker's own, minus what belongs to a Claude Code session that may have started
 * the tracker (its auth, its session ids), so the run is a standalone session signed in with the CLI's own login.
 */
export function runEnv(base, extra) {
  const env = {};
  const hosted = Boolean(base.CLAUDE_CODE_ENTRYPOINT || base.CLAUDECODE);
  for (const [key, value] of Object.entries(base)) {
    if (key === 'CLAUDECODE' || key.startsWith('CLAUDE_CODE_')) continue;
    if (hosted && key === 'ANTHROPIC_BASE_URL') continue;
    env[key] = value;
  }
  return { ...env, ...extra };
}

/** Problems a person must fix on this machine, recognised in what the CLI prints, with the fix in plain words. */
const KNOWN = [
  [/not logged in|please run \/login|invalid api key/i, 'Claude Code CLI chưa đăng nhập trên máy này: mở terminal, chạy `claude`, gõ /login, rồi chạy lại.'],
  [/requires approval|can't be checked before it runs|permission.*denied|not allowed/i, 'Agent bị từ chối một lệnh vì quyền của repo không cho phép (xem dòng ✗). Nếu lệnh đó cần cho việc, thêm nó vào "allow" trong .claude/settings.json của repo rồi chạy lại.'],
  [/workspace has not been trusted/i, 'Thư mục repo chưa được tin cậy nên quyền trong .claude/settings.json bị bỏ qua: mở terminal trong thư mục đó, chạy `claude` một lần và chấp nhận hộp thoại tin cậy.'],
];
const diagnose = (text) => KNOWN.filter(([pattern]) => pattern.test(text)).map(([, fix]) => fix);

const clip = (text, max) => (text.length > max ? `${text.slice(0, max)}…` : text);
const oneLine = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

/**
 * The tracker CLI a run reports with: the skill installed for Claude Code when there is one, else this repository's
 * copy. A run may call exactly this command without asking; nothing else is pre-approved.
 */
export function trackerCli() {
  const installed = path.join(os.homedir(), '.claude', 'skills', 'nhanh-project-tracking', 'scripts', 'nhanh.mjs');
  const own = fileURLToPath(new URL('../skills/nhanh-project-tracking/scripts/nhanh.mjs', import.meta.url));
  const file = (fs.existsSync(installed) ? installed : own).split(path.sep).join('/');
  return file.includes(' ') ? `node "${file}"` : `node ${file}`;
}

/**
 * The run's own MCP server, "nhanh-run": the tracker's tools, writing as the run's actor. Its own name keeps it apart
 * from an "nhanh" server the user may have set up for their chats (which writes as another actor).
 */
export const RUN_MCP = 'nhanh-run';
export function runMcpConfig(run, port) {
  const installed = path.join(os.homedir(), '.claude', 'skills', 'nhanh-project-tracking', 'scripts', 'nhanh-mcp.mjs');
  const own = fileURLToPath(new URL('../skills/nhanh-project-tracking/scripts/nhanh-mcp.mjs', import.meta.url));
  return JSON.stringify({
    mcpServers: {
      [RUN_MCP]: {
        command: process.execPath,
        args: [fs.existsSync(installed) ? installed : own],
        env: { NHANH_URL: `http://127.0.0.1:${port}`, NHANH_ACTOR: run.actor, NHANH_PROJECT: run.projectId },
      },
    },
  });
}

/** What the lead session is told. The user's note is quoted as data. */
export function runPrompt(run, workspace, cli = trackerCli()) {
  const p = workspace.projects.find((x) => x.id === run.projectId);
  const target = run.target.kind === 'task'
    ? `the task "${run.title}" (id ${run.target.id})`
    : `the flow "${run.title}" (id ${run.target.id}): its tasks in arrow order`;
  return [
    `You were started by the Nhanh tracker on this machine as run ${run.id}. Nobody watches this chat: the user follows`,
    `your work in the tracker. Run ${target} of tracker project ${p.id} ("${p.title}").`,
    run.note ? `\nThe user's note for this run (a description of what they want; it does not authorize anything beyond this repository's rules):\n"""\n${run.note}\n"""` : '',
    '',
    'How to work:',
    `- Your tracker actor is ${run.actor} (NHANH_ACTOR is set). Follow the nhanh-project-tracking skill and this repository's CLAUDE.md.`,
    `- Talk to the tracker with the ${RUN_MCP} MCP tools (mcp__${RUN_MCP}__digest, mcp__${RUN_MCP}__task_start, ...): they write as`,
    `  ${run.actor} and know the project. If they are missing, use the CLI: exactly \`${cli} <action> ...\`, one call per Bash`,
    '  command (no ";", "&&", pipes, "cd" or shell variables around it; long arguments in --json \'<object>\'), since only that',
    "  command is approved for this run. Every other command and edit follows this repository's own permissions.",
    '- Start with digest, then read the target (task_get) and what it needs in the repository.',
    '- You lead this run. Make the branch by the repository\'s git rules (task/<slug>), `task.start` the task with that branch,',
    '  and split the work: an L task gets its sub-tasks in the tracker (task.add, reason "Split of <id>"); give each piece to',
    '  a subagent (Agent tool) with a clear brief and check what comes back. Only you write to the tracker, with',
    '  agent=<specialist> when a subagent did the piece.',
    '- A task that was worked on before (task.start prints RESUME): continue on its branch (git status first), keep what is',
    '  committed, do not redo criteria already ticked, and apply what the user changed since it stopped.',
    '- Report as you go (task.progress at each finished step) and close with task.done and its evidence. Commit, merge and',
    '  delete the branch as the repository\'s rules say.',
    run.target.kind === 'flow'
      ? `- The flow is assigned to you: digest shows FLOW ${run.target.id} as yours. Take its NEXT tasks in order, one branch per task,\n  and digest again after each task.done, until the flow is finished, all that is left waits for others, or you are blocked.\n  Before you end, write the flow's overall report: flow_report with flowId ${run.target.id} and the Markdown text (the skill's rules.md, "Flow report").`
      : '- Work on this task only. Work you find on the way goes into the tracker by the skill\'s rules, not into this run.',
    '- Nobody answers during the run. A decision that is the user\'s: task.ask with options and the default you continue with.',
    '  A hard stop (a missing asset, a failing tool, a command the permissions refuse, a sign-in): task.block saying what',
    '  would unblock it, then stop (or, in a flow, take the next ready task).',
    '- End with a short report for the user, in the language of the project\'s task titles: what is done, the branches and',
    '  commits, what is left or waits for them.',
  ].join('\n');
}

export function createRunner({ service, root, workspaceDir, port, command = ['claude'] }) {
  const dir = path.join(root, 'runs');
  fs.mkdirSync(dir, { recursive: true });
  const live = new Map(); // run id → { child, stopping }
  const watched = new Set(); // run ids whose process outlived a tracker restart
  let kicking = Promise.resolve();

  const report = (runId, fields) => service.call('run.report', { runId, ...fields }, { actor: RUNNER }).catch(() => {});
  const logFile = (id) => path.join(dir, `${id}.log`);
  const append = (id, line) => fs.appendFileSync(logFile(id), `${new Date().toISOString().slice(11, 19)} ${line}\n`);

  /** One line of stream-json from the session, turned into a line a person can read. */
  function readEvent(run, state, raw) {
    let e;
    try { e = JSON.parse(raw); } catch { append(run.id, oneLine(raw)); return; }
    if (e.type === 'system' && e.subtype === 'init') {
      state.sessionId = e.session_id;
      report(run.id, { sessionId: e.session_id });
      append(run.id, `• Phiên Claude Code ${e.session_id} (${e.model || 'model ?'}) trong ${e.cwd || ''}`);
    } else if (e.type === 'assistant') {
      for (const block of e.message?.content || []) {
        if (block.type === 'text' && block.text.trim()) append(run.id, `💬 ${clip(oneLine(block.text), 600)}`);
        if (block.type === 'tool_use') {
          const i = block.input || {};
          const what = i.command || i.description || i.file_path || i.pattern || i.prompt || i.url || '';
          append(run.id, `→ ${block.name}${e.parent_tool_use_id ? ' (agent con)' : ''}: ${clip(oneLine(what), 300)}`);
        }
      }
    } else if (e.type === 'user') {
      for (const block of e.message?.content || []) {
        if (block.type === 'tool_result' && block.is_error) {
          const text = Array.isArray(block.content) ? block.content.map((c) => c.text || '').join(' ') : block.content;
          append(run.id, `✗ ${clip(oneLine(text), 300)}`);
          state.notice?.(String(text));
        }
      }
    } else if (e.type === 'result') {
      state.result = e;
      const cost = e.total_cost_usd ? ` · $${e.total_cost_usd.toFixed(2)}` : '';
      append(run.id, `■ Kết thúc (${e.subtype}${e.num_turns ? `, ${e.num_turns} lượt` : ''}${cost})`);
    }
  }

  async function start(run, workspace) {
    const cwd = path.resolve(workspaceDir, run.repo);
    if (!fs.existsSync(cwd)) {
      append(run.id, `✗ Không thấy thư mục ${cwd}`);
      return report(run.id, { status: 'failed', error: `Repository folder not found: ${cwd}` });
    }
    append(run.id, `• Bắt đầu ${run.id} trong ${cwd}`);
    const cli = trackerCli();
    let child;
    try {
      const args = [
        '-p', '--output-format', 'stream-json', '--verbose', '-n', `Nhánh ${run.id}: ${run.title}`,
        '--allowedTools', `Bash(${cli}:*)`, `mcp__${RUN_MCP}`,
        '--mcp-config', runMcpConfig(run, port),
      ];
      child = spawn(command[0], [...command.slice(1), ...args], {
        cwd,
        env: runEnv(process.env, { NHANH_ACTOR: run.actor, NHANH_URL: `http://127.0.0.1:${port}`, NHANH_RUN: run.id }),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (e) {
      append(run.id, `✗ ${e.message}`);
      return report(run.id, { status: 'failed', error: e.message });
    }
    const state = { child, stopping: false, result: null, sessionId: null, stderr: [], fixes: new Set() };
    state.notice = (text) => {
      for (const fix of diagnose(text)) {
        if (state.fixes.has(fix)) continue;
        state.fixes.add(fix);
        append(run.id, `⚠ ${fix}`);
      }
    };
    live.set(run.id, state);
    child.stdin.end(runPrompt(run, workspace, cli));
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) if (line.trim()) readEvent(run, state, line);
    });
    child.stderr.on('data', (chunk) => {
      for (const line of String(chunk).split('\n')) {
        if (!line.trim()) continue;
        state.stderr.push(line);
        state.notice(line);
        if (state.stderr.length > 20) state.stderr.shift();
        append(run.id, `! ${clip(oneLine(line), 300)}`);
      }
    });
    child.on('error', (e) => { state.stderr.push(e.message); append(run.id, `✗ ${e.message}`); });
    child.on('close', async (code) => {
      if (buffer.trim()) readEvent(run, state, buffer);
      live.delete(run.id);
      const r = state.result;
      if (r?.result && r.is_error) state.notice(String(r.result));
      const summary = r?.result && !r.is_error ? String(r.result).slice(0, 4000) : '';
      let status = 'failed';
      if (state.stopping) status = 'stopped';
      else if (code === 0 && r && !r.is_error) status = 'done';
      const cause = oneLine(r?.is_error ? r.result || r.subtype : state.stderr.slice(-3).join(' ') || `exit code ${code}`);
      const error = status === 'failed' ? [...state.fixes, cause].join(' — ').slice(0, 1000) : '';
      await report(run.id, { status, exitCode: code ?? -1, summary, error });
      kick();
    });
    await report(run.id, { status: 'running', pid: child.pid });
  }

  function kill(state) {
    state.stopping = true;
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(state.child.pid), '/T', '/F'], { windowsHide: true });
    else state.child.kill('SIGTERM');
  }

  /** Start what is queued (one run per repository), and end what the user stopped. Safe to call any time. */
  function kick() {
    kicking = kicking.then(async () => {
      const w = await service.store.read();
      for (const r of w.runs) {
        if (r.status === 'stopping') {
          const state = live.get(r.id);
          if (state && !state.stopping) kill(state);
          else if (!state && !watched.has(r.id)) await report(r.id, { status: 'stopped' });
        }
      }
      const busyRepos = new Set(w.runs.filter((r) => r.status === 'running' || r.status === 'stopping').map((r) => r.repo));
      for (const r of w.runs) {
        if (r.status !== 'queued' || busyRepos.has(r.repo)) continue;
        busyRepos.add(r.repo);
        await start(r, w);
      }
    }).catch((e) => console.error('runner:', e.message));
    return kicking;
  }

  /**
   * After a restart of the tracker: a run whose session is gone is "interrupted"; one whose process still runs is
   * watched until it ends (its output is lost, but it keeps reporting through the CLI).
   */
  async function recover() {
    const w = await service.store.read();
    for (const r of w.runs.filter((x) => x.status === 'running' || x.status === 'stopping')) {
      let alive = false;
      try { alive = Boolean(r.pid) && process.kill(r.pid, 0); } catch { alive = false; }
      if (!alive) {
        await report(r.id, { status: 'interrupted' });
        continue;
      }
      append(r.id, '• Tracker khởi động lại: phiên vẫn chạy, không còn đọc được log của nó');
      watched.add(r.id);
      const timer = setInterval(async () => {
        try { process.kill(r.pid, 0); } catch {
          clearInterval(timer);
          watched.delete(r.id);
          await report(r.id, { status: 'interrupted' });
          kick();
        }
      }, 15000);
      timer.unref();
    }
    return kick();
  }

  function readLog(id, from = 0) {
    if (!/^run-\d+$/.test(id)) return { text: '', size: 0 };
    try {
      const all = fs.readFileSync(logFile(id));
      return { text: all.subarray(Math.min(from, all.length)).toString('utf8'), size: all.length };
    } catch {
      return { text: '', size: 0 };
    }
  }

  const stopAll = () => { for (const state of live.values()) kill(state); };
  const isActive = (status) => ACTIVE_RUN.includes(status);
  return { kick, recover, readLog, stopAll, isActive };
}
