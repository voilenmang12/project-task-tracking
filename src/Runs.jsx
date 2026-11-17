// Agent runs in the web UI: the Run button, the live log of a run, and the "Đang chạy" page.
// A run is a Claude Code session the tracker starts on this machine for one task or one flow (server/runner.js).
import React from 'react';
import { Play, Square, TerminalSquare, X } from 'lucide-react';
import { call, runLog } from './api.js';
import { askText, confirmAction } from './Dialog.jsx';
import { timeAgo } from './ui.jsx';

export const ACTIVE = ['queued', 'running', 'stopping'];
export const RUN_LABEL = {
  queued: 'Chờ lượt', running: 'Đang chạy', stopping: 'Đang dừng', done: 'Xong', unfinished: 'Chưa xong', failed: 'Lỗi', stopped: 'Đã dừng', interrupted: 'Bị ngắt',
};
export const runName = (id) => `Nhánh #${String(id).replace('run-', '')}`;

let openLog = null; // set by the mounted <RunLogHost />
export const showRunLog = (runId) => openLog?.(runId);

export function RunChip({ run }) {
  return <span className={`chip run-chip run-${run.status}`}>{ACTIVE.includes(run.status) && <span className="pulse" />}{RUN_LABEL[run.status]}</span>;
}

/** Starts a run for a task or a flow, with an optional note the agent reads. */
export function RunButton({ taskId, flowId, title, onError, label = 'Chạy bằng agent', small = false }) {
  const start = async (e) => {
    e?.stopPropagation();
    const note = await askText({
      title: `Chạy "${title}"`,
      text: 'Tracker mở một phiên Claude Code trong repo của dự án. Phiên đó tạo nhánh git, chia việc cho agent con và báo cáo ở đây. Quyền theo settings của repo.',
      label: 'Dặn thêm agent', placeholder: 'Ví dụ: chỉ làm phần UI, đừng đụng save system', multiline: true, confirmLabel: '▶ Chạy',
    });
    if (note === null) return;
    call('run.start', { taskId, flowId, note: note || undefined }).then((r) => showRunLog(r.id)).catch(onError);
  };
  return small
    ? <button className="mini mini-run" title={label} aria-label={label} onClick={start}><Play size={13} /></button>
    : <button className="btn btn-run" onClick={start}><Play size={14} /> {label}</button>;
}

export async function stopRun(run, onError) {
  const ok = await confirmAction({
    title: `Dừng ${runName(run.id)}`, text: 'Phiên Claude Code bị tắt ngay. Việc đang làm dở trở về "Chờ làm"; những gì đã commit vẫn còn trên nhánh.',
    confirmLabel: 'Dừng', danger: true,
  });
  if (ok) call('run.stop', { runId: run.id }).catch(onError);
}

/** One run on a line: status, name, what it runs, when, and its buttons. */
export function RunLine({ run, onError, showProject = false, href }) {
  const target = run.target.kind === 'flow' ? `Luồng "${run.title}"` : run.title;
  const since = ACTIVE.includes(run.status) ? run.startedAt || run.createdAt : run.endedAt;
  return (
    <div className={`run-line ${ACTIVE.includes(run.status) ? 'run-active' : ''}`}>
      <RunChip run={run} />
      <strong>{runName(run.id)}</strong>
      <span className="grow ellipsis">
        {showProject && <span className="muted">{run.projectTitle} · </span>}
        {href ? <a className="link" href={href}>{target}</a> : target}
      </span>
      <span className="muted small">{since ? timeAgo(since) : ''}</span>
      <button className="btn" onClick={() => showRunLog(run.id)}><TerminalSquare size={14} /> Log</button>
      {ACTIVE.includes(run.status) && <button className="btn" onClick={() => stopRun(run, onError)}><Square size={13} /> Dừng</button>}
    </div>
  );
}

/** The log window, over everything; follows the run while it is active. */
export function RunLogHost({ onError }) {
  const [runId, setRunId] = React.useState(null);
  const [run, setRun] = React.useState(null);
  const [text, setText] = React.useState('');
  const body = React.useRef(null);
  const size = React.useRef(0);
  const stick = React.useRef(true);

  React.useEffect(() => {
    openLog = (id) => { size.current = 0; stick.current = true; setText(''); setRun(null); setRunId(id); };
    return () => { openLog = null; };
  }, []);
  React.useEffect(() => {
    if (!runId) return undefined;
    // The log grows only while the run is active: read it every 1.5 s until the run ends (or a read fails), then stop.
    let stopped = false;
    let timer = null;
    const end = () => { if (timer) clearInterval(timer); timer = null; };
    const refresh = async () => {
      try {
        const runs = await call('runs.list', { limit: 300 });
        const r = runs.find((x) => x.id === runId);
        if (!stopped) setRun(r || null);
        const chunk = await runLog(runId, size.current);
        if (stopped) return;
        if (chunk.size < size.current) { size.current = 0; setText(''); return; }
        size.current = chunk.size;
        if (chunk.text) setText((old) => old + chunk.text);
        if (!r || !ACTIVE.includes(r.status)) end();
      } catch (e) {
        end();
        if (!stopped) onError(e);
      }
    };
    refresh();
    timer = setInterval(refresh, 1500);
    return () => { stopped = true; end(); };
  }, [runId, onError]);
  React.useEffect(() => {
    if (stick.current && body.current) body.current.scrollTop = body.current.scrollHeight;
  }, [text]);
  if (!runId) return null;

  const close = () => setRunId(null);
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()} onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="run-log" role="dialog" aria-modal="true" aria-label={`Log ${runName(runId)}`}>
        <header className="dialog-head">
          <h2 className="row">{runName(runId)} {run && <RunChip run={run} />}</h2>
          <span className="row">
            {run && ACTIVE.includes(run.status) && <button className="btn" onClick={() => stopRun(run, onError)}><Square size={13} /> Dừng</button>}
            <button className="icon-btn" aria-label="Đóng" onClick={close}><X size={18} /></button>
          </span>
        </header>
        {run && (
          <div className="run-meta">
            <span>{run.projectTitle} · {run.target.kind === 'flow' ? `luồng "${run.title}"` : `việc "${run.title}"`}</span>
            <span className="muted">actor <code>{run.actor}</code> · repo <code>{run.repo}</code>{run.sessionId ? <> · phiên <code>{run.sessionId}</code></> : ''}</span>
            {run.note && <span className="muted">Bạn dặn: {run.note}</span>}
          </div>
        )}
        <pre ref={body} className="run-log-body" onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}>{text || 'Chưa có gì…'}</pre>
        {run?.summary && <div className="run-summary"><strong>Báo cáo của agent</strong><div>{run.summary}</div></div>}
        {run?.error && <div className="run-summary run-error"><strong>Lỗi</strong><div>{run.error}</div></div>}
        {run?.sessionId && !ACTIVE.includes(run.status) && (
          <p className="muted small">Mở lại phiên này để hỏi tiếp: <code>claude --resume {run.sessionId}</code> trong thư mục <code>{run.repo}</code>.</p>
        )}
      </div>
    </div>
  );
}

/** "Đang chạy": every run of every project, active ones first. */
export function RunsPage({ onError, projectHref }) {
  const [runs, setRuns] = React.useState(null);
  const [sessions, setSessions] = React.useState([]);
  const load = React.useCallback(() => {
    call('runs.list', { limit: 100 }).then(setRuns).catch(onError);
    call('activity').then(setSessions).catch(onError);
  }, [onError]);
  React.useEffect(() => { load(); window.addEventListener('nhanh-change', load); return () => window.removeEventListener('nhanh-change', load); }, [load]);
  if (!runs) return <p className="muted pad">Đang tải…</p>;
  const active = runs.filter((r) => ACTIVE.includes(r.status)).reverse();
  const ended = runs.filter((r) => !ACTIVE.includes(r.status)).reverse().slice(0, 40);
  const hrefOf = (r) => projectHref(r.projectId, r.target.kind === 'task' ? r.target.id : null);
  return (
    <div className="pad narrow">
      <h1>Đang chạy</h1>
      <p className="muted">Phiên chat là agent bạn đang trò chuyện trong Claude Code. Lượt chạy là phiên tracker tự mở khi bạn bấm Chạy; mỗi repo chạy một lượt một lúc, lượt sau chờ.</p>
      {sessions.length > 0 && <h3>Phiên chat đang làm (Claude Code)</h3>}
      {sessions.map((x) => (
        <div key={`${x.projectId}:${x.actor}`} className="run-line run-active">
          <span className="chip run-chip run-running"><span className="pulse" />Phiên chat</span>
          <strong>{x.actor}</strong>
          <span className="grow ellipsis">
            <span className="muted">{x.projectTitle} · </span>
            {x.flows.map((f) => <span key={f.id}>luồng "{f.title}" · </span>)}
            {x.doing.map((t, i) => <React.Fragment key={t.id}>{i > 0 && ', '}<a className="link" href={projectHref(x.projectId, t.id)}>{t.title}</a>{t.status === 'blocked' ? ' (bị chặn)' : ''}</React.Fragment>)}
          </span>
          <span className="muted small">{x.lastAt ? timeAgo(x.lastAt) : ''}</span>
        </div>
      ))}
      <h3>Lượt chạy do tracker mở</h3>
      {active.length ? active.map((r) => <RunLine key={r.id} run={r} onError={onError} showProject href={hrefOf(r)} />)
        : <p className="muted">Không có lượt nào đang chạy. Bấm ▶ trên một việc, hoặc "Chạy bằng agent" trên một luồng.</p>}
      {ended.length > 0 && <h3>Gần đây</h3>}
      {ended.map((r) => <RunLine key={r.id} run={r} onError={onError} showProject href={hrefOf(r)} />)}
    </div>
  );
}
