// The side panel of one item: what it is, where it stands, the proof, the question for the user and its journal.
import React from 'react';
import Markdown from 'react-markdown';
import { GitBranch, Plus, RotateCcw, Trash2, X, XCircle } from 'lucide-react';
import { call } from './api.js';
import { Editable, EVENT_LABEL, StatusChip, actorName, clock, day, pct } from './ui.jsx';

const EVIDENCE_LABEL = { commit: 'Commit', tests: 'Test', report: 'Báo cáo', screenshots: 'Ảnh chụp', notes: 'Ghi chú' };
const ORIGIN_LABEL = { plan: 'Từ kế hoạch', user: 'Bạn yêu cầu', agent: 'Agent thêm khi đang làm' };

export function QuestionBox({ task, onError }) {
  const [answer, setAnswer] = React.useState('');
  const q = task.question;
  if (!q) return null;
  const send = (text) => text.trim() && call('task.answer', { taskId: task.id, answer: text.trim() }).then(() => setAnswer('')).catch(onError);
  if (q.answer) {
    return (
      <div className="question answered">
        <div className="question-text">{q.text}</div>
        <div className="question-answer">Bạn trả lời: {q.answer} <span className="muted">· chờ agent nhận</span></div>
      </div>
    );
  }
  return (
    <div className="question">
      <div className="question-by">{actorName(q.by)} hỏi bạn</div>
      <div className="question-text">{q.text}</div>
      {q.options?.length > 0 && (
        <div className="question-options">
          {q.options.map((o) => <button key={o} className="btn" onClick={() => send(o)}>{o}</button>)}
        </div>
      )}
      <form className="row" onSubmit={(e) => { e.preventDefault(); send(answer); }}>
        <input className="input grow" value={answer} placeholder="Trả lời…" onChange={(e) => setAnswer(e.target.value)} />
        <button className="btn btn-primary" disabled={!answer.trim()}>Gửi</button>
      </form>
    </div>
  );
}

export function Journal({ events, tasks, onOpenTask }) {
  if (!events.length) return <p className="muted">Chưa có hoạt động.</p>;
  const titleOf = new Map((tasks || []).map((t) => [t.id, t.title]));
  const groups = [];
  for (const e of [...events].reverse()) {
    const d = day(e.at);
    if (groups.at(-1)?.day !== d) groups.push({ day: d, items: [] });
    groups.at(-1).items.push(e);
  }
  return (
    <div className="journal">
      {groups.map((g) => (
        <section key={g.day}>
          <h4 className="journal-day">{g.day}</h4>
          {g.items.map((e) => (
            <div key={e.id} className={`event event-${e.type}`}>
              <span className="event-time">{clock(e.at)}</span>
              <div className="event-body">
                <div className="event-head">
                  <span className={`event-type type-${e.type}`}>{EVENT_LABEL[e.type] || e.type}</span>
                  <span className="event-actor">{actorName(e.actor)}</span>
                  {e.taskId && onOpenTask && titleOf.has(e.taskId) && (
                    <button className="link" onClick={() => onOpenTask(e.taskId)}>{titleOf.get(e.taskId)}</button>
                  )}
                </div>
                {e.text && <div className="event-text">{e.text}</div>}
                {e.data?.evidence && <Evidence evidence={e.data.evidence} />}
                {e.data?.unmet && <div className="event-text warn">Chưa đạt: {e.data.unmet}</div>}
                {e.data?.created?.length > 0 && <div className="muted">{e.data.created.length} việc mới{e.data.updated?.length ? `, ${e.data.updated.length} việc cập nhật` : ''}</div>}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function Evidence({ evidence }) {
  return (
    <dl className="evidence">
      {Object.entries(evidence).map(([key, value]) => (
        <React.Fragment key={key}><dt>{EVIDENCE_LABEL[key] || key}</dt><dd>{value}</dd></React.Fragment>
      ))}
    </dl>
  );
}

export default function TaskPanel({ taskId, onClose, onError, onOpenTask }) {
  const [data, setData] = React.useState(null);
  const [newCriterion, setNewCriterion] = React.useState('');
  const [editing, setEditing] = React.useState(false);
  const load = React.useCallback(() => call('task.get', { taskId }).then(setData).catch(() => onClose()), [taskId, onClose]);
  React.useEffect(() => { setData(null); setEditing(false); load(); }, [load]);
  React.useEffect(() => { window.addEventListener('nhanh-change', load); return () => window.removeEventListener('nhanh-change', load); }, [load]);
  if (!data) return <aside className="panel"><p className="muted">Đang tải…</p></aside>;

  const { task: t, children, events } = data;
  const act = (name, args = {}) => call(name, { taskId: t.id, ...args }).catch(onError);
  const reason = (label) => window.prompt(label)?.trim();
  const setCriteria = (criteria) => act('task.update', { criteria });
  const isTask = t.kind === 'task';

  return (
    <aside className="panel" aria-label="Chi tiết">
      <header className="panel-head">
        <span className="muted">{isTask ? 'Việc' : 'Nhóm'} · {t.id}</span>
        <button className="icon-btn" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
      </header>

      <Editable className="panel-title" value={t.title} onSave={(title) => title && act('task.update', { title })} />

      <div className="panel-meta">
        <StatusChip status={t.rollup.status} />
        {isTask && (
          <select className="select" value={t.size || ''} onChange={(e) => act('task.update', { size: e.target.value || null })} aria-label="Cỡ">
            <option value="">Cỡ ?</option><option value="S">S · nhỏ</option><option value="M">M · vừa</option><option value="L">L · lớn</option>
          </select>
        )}
        {!isTask && <span className="muted">{pct(t.rollup.progress)}</span>}
        {t.owner && <span className="owner">{actorName(t.owner)}{t.agent ? ` · ${t.agent}` : ''}</span>}
        {t.branch && <span className="muted branch"><GitBranch size={13} /> {t.branch}</span>}
      </div>
      <div className="muted origin">
        {ORIGIN_LABEL[t.origin]}{t.reason ? `: ${t.reason}` : ''}
      </div>

      <QuestionBox task={t} onError={onError} />
      {t.status === 'blocked' && (
        <div className="blocked-box">
          <strong>Bị chặn:</strong> {t.blockedReason || '(không ghi lý do)'}
          <div><button className="btn" onClick={() => act('task.unblock', { note: reason('Đã gỡ chặn bằng cách nào? (agent sẽ đọc)') || undefined })}>Đã gỡ chặn</button></div>
        </div>
      )}

      {t.status === 'done' && (
        <section className="panel-section done-box">
          <h4>Kết quả</h4>
          <p>{t.summary || '(không có tóm tắt)'}</p>
          {t.evidence && <Evidence evidence={t.evidence} />}
          {t.unmet && <p className="warn">Đóng khi chưa đạt: {t.unmet}</p>}
        </section>
      )}

      <section className="panel-section">
        <h4>Mô tả <button className="link" onClick={() => setEditing(!editing)}>{editing ? 'Xong' : 'Sửa'}</button></h4>
        {editing
          ? <Editable multiline value={t.description} placeholder="Việc này là gì, vì sao cần (Ctrl+Enter để lưu)" onSave={(description) => act('task.update', { description })} />
          : t.description ? <div className="markdown"><Markdown>{t.description}</Markdown></div> : <p className="muted">Chưa có mô tả.</p>}
      </section>

      {isTask && (
        <section className="panel-section">
          <h4>Tiêu chí nghiệm thu {t.criteria.length > 0 && <span className="muted">{t.criteria.filter((c) => c.done).length}/{t.criteria.length}</span>}</h4>
          <ul className="criteria">
            {t.criteria.map((c) => (
              <li key={c.id}>
                <label>
                  <input type="checkbox" checked={c.done} onChange={() => setCriteria(t.criteria.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))} />
                  <span className={c.done ? 'crit-done' : ''}>{c.text}</span>
                </label>
                <button className="icon-btn subtle" aria-label="Xoá tiêu chí" onClick={() => setCriteria(t.criteria.filter((x) => x.id !== c.id))}><X size={14} /></button>
              </li>
            ))}
          </ul>
          <form className="row" onSubmit={(e) => { e.preventDefault(); if (newCriterion.trim()) { setCriteria([...t.criteria, { text: newCriterion.trim() }]); setNewCriterion(''); } }}>
            <input className="input grow" value={newCriterion} placeholder="Thêm tiêu chí kiểm tra được…" onChange={(e) => setNewCriterion(e.target.value)} />
            <button className="icon-btn" aria-label="Thêm tiêu chí"><Plus size={16} /></button>
          </form>
        </section>
      )}

      {children.length > 0 && (
        <section className="panel-section">
          <h4>Việc con</h4>
          <ul className="children">
            {children.map((c) => (
              <li key={c.id}><button className="link" onClick={() => onOpenTask(c.id)}>{c.title}</button> <StatusChip status={c.rollup.status} /></li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel-section">
        <h4>Nhật ký</h4>
        <Journal events={events} />
      </section>

      <footer className="panel-actions">
        {isTask && t.status !== 'done' && t.status !== 'dropped' && (
          <button className="btn" onClick={() => { const s = reason('Tóm tắt kết quả (bạn tự đánh dấu xong):'); if (s) act('task.done', { summary: s, check: 'all' }); }}>Đánh dấu xong</button>
        )}
        {(t.status === 'done' || t.status === 'dropped') && (
          <button className="btn" onClick={() => { const r = reason('Vì sao mở lại? (agent sẽ đọc)'); if (r) act('task.reopen', { reason: r }); }}><RotateCcw size={14} /> Mở lại</button>
        )}
        {t.status !== 'dropped' && t.status !== 'done' && (
          <button className="btn" onClick={() => { const r = reason('Vì sao bỏ việc này?'); if (r) act('task.drop', { reason: r }); }}><XCircle size={14} /> Bỏ</button>
        )}
        <button className="btn btn-danger" onClick={() => window.confirm(`Xoá hẳn "${t.title}" và các việc con?`) && act('task.delete').then(onClose)}><Trash2 size={14} /> Xoá</button>
      </footer>
    </aside>
  );
}
