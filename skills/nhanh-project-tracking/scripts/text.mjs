// Short text views of tracker results, shared by the CLI (nhanh.mjs) and the MCP server (nhanh-mcp.mjs): reading the
// tracker costs an agent few tokens.
const MARK = { todo: '○', doing: '●', blocked: '■', done: '✔', dropped: '✕' };
const pct = (n) => `${Math.round(n * 100)}%`;
const counts = (c) => ['doing', 'blocked', 'todo', 'done'].filter((s) => c[s]).map((s) => `${s} ${c[s]}`).join(' · ') || 'no tasks';

export function taskLine(t) {
  const crit = t.criteria?.length ? ` ${t.criteria.filter((c) => c.done).length}/${t.criteria.length}` : '';
  const who = t.status === 'doing' && t.owner ? ` — ${t.owner}${t.branch ? ` on ${t.branch}` : ''}` : '';
  const origin = t.origin === 'user' ? ' (user request)' : t.origin === 'agent' ? ' (added by agent)' : '';
  const stopped = t.stopped && t.status === 'todo' ? ` (STOPPED by the user${t.stopped.reason ? `: ${t.stopped.reason}` : ''}; restart only on their word)` : '';
  return `${MARK[t.status] || '○'} ${t.id}  ${t.title}${t.size ? ` [${t.size}]` : ''}${crit}${who}${origin}${stopped}`;
}
export function taskDetail(t, indent = '    ') {
  const lines = [];
  if (t.description) lines.push(`${indent}${t.description.split('\n').join(`\n${indent}`)}`);
  for (const c of t.criteria || []) lines.push(`${indent}[${c.done ? 'x' : ' '}] ${c.id} ${c.text}`);
  if (t.blockedReason && t.status === 'blocked') lines.push(`${indent}blocked: ${t.blockedReason}`);
  if (t.question) lines.push(`${indent}question: ${t.question.text}${t.question.answer ? `\n${indent}ANSWER: ${t.question.answer}` : ' (not answered yet)'}`);
  for (const change of t.changedSinceStop || []) lines.push(`${indent}changed by the user since the stop: ${change}`);
  if (t.resume) {
    const r = t.resume;
    lines.push(`${indent}RESUME: this task was worked on before. Continue it, do not start over:`);
    lines.push(`${indent}  branch: ${r.branch || '(none recorded)'}: check it out, run git status, keep what is committed, finish or discard what is not`);
    if (r.stopped) lines.push(`${indent}  stopped by the user at ${r.stopped.at.slice(0, 16).replace('T', ' ')} while ${r.stopped.owner} was on it${r.stopped.reason ? `: ${r.stopped.reason}` : ''}`);
    for (const x of r.criteriaDone) lines.push(`${indent}  done already: ${x}`);
    for (const x of r.criteriaOpen) lines.push(`${indent}  still open: ${x}`);
    for (const x of r.progress) lines.push(`${indent}  progress: ${x}`);
    for (const x of r.changedSinceStop) lines.push(`${indent}  CHANGED BY THE USER: ${x}  (apply it)`);
  }
  return lines;
}

export function digestText(d) {
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
    for (const t of f.waiting) out.push(`  then: ${taskLine(t)} — waits for ${t.waitingOn.join(t.afterMode === 'any' ? ' or ' : ', ') || (t.stopped ? 'the user (stopped)' : 'review or sub-tasks')}`);
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

export function treeText(p) {
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

export function listText(projects) {
  return projects.map((p) => {
    const s = p.summary;
    const doing = s.doing.map((t) => `${t.title} (${t.owner})`).join('; ');
    return `${p.id}  ${p.title} · ${p.stage} · ${pct(s.progress)} · ${counts(s.counts)}${s.needsUser ? ` · needs the user: ${s.needsUser}` : ''}${doing ? `\n    doing: ${doing}` : ''}`;
  }).join('\n') || 'No projects.';
}

/** The text an agent reads for the result of an action; JSON for actions without a text view. */
export function resultText(name, result) {
  if (name === 'digest') return digestText(result);
  if (name === 'project.get') return treeText(result);
  if (name === 'projects.list') return listText(result);
  if (name === 'plan.apply') {
    const lines = [`created ${result.created.length}, updated ${result.updated.length}`, ...result.created];
    if (result.flow) lines.push(`flow ${result.flow}: proposed, waits for the user's OK (web UI, or their words in chat)`);
    return lines.join('\n');
  }
  if (name.startsWith('task.') && result?.id) return [taskLine(result), ...taskDetail(result, '  ')].join('\n');
  return JSON.stringify(result, null, 2);
}
