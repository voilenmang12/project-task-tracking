// The side panel of one item: what it is, where it stands, the proof, the question for the user and its journal.
import React from 'react';
import Markdown from 'react-markdown';
import { ArrowDown, ArrowUp, Check, GitBranch, Plus, RotateCcw, Trash2, X, XCircle } from 'lucide-react';
import { call } from './api.js';
import { childrenOf, descendantIds } from '../shared/model.js';
import { askText, confirmAction } from './Dialog.jsx';
import { INDENT } from './Composer.jsx';
import { approve, isPending, rejectProposal } from './review.js';
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

/** Where an item sits: its parent (any milestone or task that may hold it) and its place among its siblings. */
function Place({ task, tasks, onMove }) {
  const below = descendantIds(tasks, task.id);
  const options = [];
  const walk = (parentId, depth) => {
    for (const t of childrenOf(tasks, parentId)) {
      if (t.id === task.id || below.has(t.id) || t.status === 'dropped') continue;
      if (task.kind === 'group' && t.kind !== 'group') continue;
      options.push({ id: t.id, label: `${INDENT.repeat(depth)}${t.kind === 'group' ? '▸ ' : '· '}${t.title}` });
      walk(t.id, depth + 1);
    }
  };
  walk(null, 0);
  const siblings = childrenOf(tasks, task.parentId);
  const at = siblings.findIndex((t) => t.id === task.id);
  return (
    <div className="row place">
      <select className="select grow" value={task.parentId || ''} aria-label="Nằm trong"
        onChange={(e) => onMove({ parentId: e.target.value || null, index: undefined })}>
        <option value="">— Cấp cao nhất —</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <button className="icon-btn" aria-label="Lên" title="Lên (làm trước)" disabled={at <= 0} onClick={() => onMove({ parentId: task.parentId, index: at - 1 })}><ArrowUp size={16} /></button>
      <button className="icon-btn" aria-label="Xuống" title="Xuống (làm sau)" disabled={at < 0 || at >= siblings.length - 1} onClick={() => onMove({ parentId: task.parentId, index: at + 1 })}><ArrowDown size={16} /></button>
    </div>
  );
}

/** The items this one runs after (its "after" arrows), and whether all of them or any one must be finished. */
function RunsAfter({ task, tasks, onChange, onOpenTask }) {
  const after = task.after || [];
  const titleOf = (id) => tasks.find((t) => t.id === id)?.title || id;
  const waiting = new Set(task.waitingOn || []);
  const options = [];
  const walk = (parentId, depth) => {
    for (const t of childrenOf(tasks, parentId)) {
      if (t.id === task.id || t.status === 'dropped') continue;
      if (!after.includes(t.id)) options.push({ id: t.id, label: `${INDENT.repeat(depth)}${t.kind === 'group' ? '▸ ' : '· '}${t.title}` });
      walk(t.id, depth + 1);
    }
  };
  walk(null, 0);
  return (
    <>
      {after.length > 0 && (
        <ul className="children">
          {after.map((id) => (
            <li key={id}>
              <button className="link ellipsis" onClick={() => onOpenTask(id)}>{titleOf(id)}</button>
              <span className="row">
                <span className={`chip ${waiting.has(id) ? '' : 'chip-done'}`}>{waiting.has(id) ? 'chưa xong' : 'đã xong'}</span>
                <button className="icon-btn" aria-label="Bỏ mũi tên" onClick={() => onChange({ after: after.filter((x) => x !== id) })}><X size={14} /></button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <select className="select grow" value="" aria-label="Thêm việc phải xong trước" onChange={(e) => e.target.value && onChange({ after: [...after, e.target.value] })}>
          <option value="">+ Chạy sau việc hoặc mốc…</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        {after.length > 1 && (
          <select className="select" value={task.afterMode || 'all'} aria-label="Điều kiện" onChange={(e) => onChange({ afterMode: e.target.value })}>
            <option value="all">khi tất cả xong</option>
            <option value="any">khi một trong số đó xong</option>
          </select>
        )}
      </div>
    </>
  );
}

export default function TaskPanel({ taskId, tasks = [], onClose, onError, onOpenTask }) {
  const [data, setData] = React.useState(null);
  const [newCriterion, setNewCriterion] = React.useState('');
  const [editing, setEditing] = React.useState(false);
  const load = React.useCallback(() => call('task.get', { taskId }).then(setData).catch(() => onClose()), [taskId, onClose]);
  React.useEffect(() => { setData(null); setEditing(false); load(); }, [load]);
  React.useEffect(() => { window.addEventListener('nhanh-change', load); return () => window.removeEventListener('nhanh-change', load); }, [load]);
  if (!data) return <aside className="panel"><p className="muted">Đang tải…</p></aside>;

  const { task: t, children, events } = data;
  const act = (name, args = {}) => call(name, { taskId: t.id, ...args }).catch(onError);
  const setCriteria = (criteria) => act('task.update', { criteria });
  const isTask = t.kind === 'task';
  const pending = isPending(t);
  const unblock = async () => {
    const note = await askText({ title: 'Gỡ chặn', label: 'Đã gỡ chặn bằng cách nào? (agent sẽ đọc)', confirmLabel: 'Gỡ chặn' });
    if (note !== null) act('task.unblock', { note: note || undefined });
  };
  const markDone = async () => {
    const summary = await askText({ title: 'Đánh dấu xong', label: 'Tóm tắt kết quả', multiline: true, required: true, confirmLabel: 'Xong' });
    if (summary) act('task.done', { summary, check: 'all' });
  };
  const reopen = async () => {
    const why = await askText({ title: 'Mở lại', label: 'Vì sao mở lại? (agent sẽ đọc)', required: true, confirmLabel: 'Mở lại' });
    if (why) act('task.reopen', { reason: why });
  };
  const drop = async () => {
    const why = await askText({ title: 'Bỏ việc này', text: 'Việc và các mục bên trong thành "Đã bỏ", không tính vào tiến độ nhưng vẫn hiện kèm lý do.', label: 'Vì sao bỏ?', required: true, confirmLabel: 'Bỏ', danger: true });
    if (why) act('task.drop', { reason: why });
  };
  const remove = async () => {
    const ok = await confirmAction({ title: 'Xoá hẳn', text: `Xoá hẳn "${t.title}" và các mục bên trong? Không hoàn tác được; muốn giữ lại dấu vết thì dùng "Bỏ".`, confirmLabel: 'Xoá hẳn', danger: true });
    if (ok) act('task.delete').then(onClose);
  };
  const move = (place) => call('task.move', { taskId: t.id, parentId: place.parentId, index: place.index }).catch(onError);

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

      {pending && (
        <div className="review-box">
          <strong>{actorName(t.createdBy)} đề xuất {isTask ? 'việc' : 'mốc'} này, chờ bạn duyệt.</strong>
          <span className="muted small">Agent không bắt đầu trước khi bạn duyệt. Có thể sửa tiêu đề, cỡ, tiêu chí trước khi duyệt.</span>
          <div className="row">
            <button className="btn btn-approve" onClick={() => approve([t]).catch(onError)}><Check size={14} /> Duyệt{children.length ? ' cả mục bên trong' : ''}</button>
            <button className="btn" onClick={() => rejectProposal(t).catch(onError)}><X size={14} /> Bỏ đề xuất</button>
          </div>
        </div>
      )}

      <QuestionBox task={t} onError={onError} />
      {t.status === 'blocked' && (
        <div className="blocked-box">
          <strong>Bị chặn:</strong> {t.blockedReason || '(không ghi lý do)'}
          <div><button className="btn" onClick={unblock}>Đã gỡ chặn</button></div>
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

      {tasks.length > 0 && (
        <section className="panel-section">
          <h4>Vị trí <span className="muted normal">agent làm từ trên xuống</span></h4>
          <Place task={t} tasks={tasks} onMove={move} />
        </section>
      )}

      {tasks.length > 0 && (
        <section className="panel-section">
          <h4>Chạy sau {t.waitingOn?.length > 0 && t.status === 'todo' && <span className="need normal">đang chờ {t.waitingOn.length}</span>}</h4>
          <RunsAfter task={t} tasks={tasks} onOpenTask={onOpenTask} onChange={(change) => act('task.update', change)} />
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
                <input type="checkbox" checked={c.done} aria-label={c.done ? 'Bỏ đánh dấu' : 'Đánh dấu đạt'} onChange={() => setCriteria(t.criteria.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))} />
                <Editable className={`crit-text ${c.done ? 'crit-done' : ''}`} value={c.text}
                  onSave={(text) => text && setCriteria(t.criteria.map((x) => (x.id === c.id ? { ...x, text } : x)))} />
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

      <section className="panel-section">
        <h4>Nhãn</h4>
        <Editable className="labels-edit" value={(t.labels || []).join(', ')} placeholder="Thêm nhãn, cách nhau bằng dấu phẩy"
          onSave={(text) => act('task.update', { labels: text.split(',').map((x) => x.trim()).filter(Boolean) })} />
      </section>

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
          <button className="btn" onClick={markDone}><Check size={14} /> Đánh dấu xong</button>
        )}
        {(t.status === 'done' || t.status === 'dropped') && (
          <button className="btn" onClick={reopen}><RotateCcw size={14} /> Mở lại</button>
        )}
        {t.status !== 'dropped' && t.status !== 'done' && (
          <button className="btn" onClick={drop}><XCircle size={14} /> Bỏ</button>
        )}
        <button className="btn btn-danger" onClick={remove}><Trash2 size={14} /> Xoá</button>
      </footer>
    </aside>
  );
}
