// The web UI: a control room for one person running several agents.
//   #/            Tổng quan: every project at a glance
//   #/inbox       Cần bạn: questions to answer, proposals to review, blocked work, requests not picked up yet
//   #/p/<id>      one project: plan tree, flows (graph of order arrows), journal, notes; #/p/<id>/t/<taskId> opens an item
import React from 'react';
import { createRoot } from 'react-dom/client';
import Markdown from 'react-markdown';
import { Bell, Check, ChevronDown, ChevronRight, Flag, GitFork, GripVertical, LayoutGrid, Plus, X } from 'lucide-react';
import { call, subscribe } from './api.js';
import { childrenOf, descendantIds } from '../shared/model.js';
import TaskPanel, { Journal, QuestionBox } from './TaskPanel.jsx';
import Composer from './Composer.jsx';
import FlowView from './FlowView.jsx';
import { DialogHost, askText } from './Dialog.jsx';
import { Bar, Editable, STAGE_LABEL, STATUS_LABEL, StatusIcon, actorName, pct, timeAgo } from './ui.jsx';
import { approve, isPending, pendingRoots, rejectProposal } from './review.js';
import './style.css';

const parseRoute = () => {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  if (parts[0] === 'inbox') return { view: 'inbox' };
  if (parts[0] === 'p' && parts[1]) return { view: 'project', projectId: parts[1], taskId: parts[2] === 't' ? parts[3] : null };
  return { view: 'home' };
};
const go = (path) => { window.location.hash = path; };
const projectPath = (id, taskId) => `/p/${encodeURIComponent(id)}${taskId ? `/t/${encodeURIComponent(taskId)}` : ''}`;

function App() {
  const [route, setRoute] = React.useState(parseRoute);
  const [projects, setProjects] = React.useState(null);
  const [attention, setAttention] = React.useState({ questions: [], blocked: [], pending: [], review: [] });
  const [online, setOnline] = React.useState(true);
  const [error, setError] = React.useState('');
  const onError = React.useCallback((e) => { setError(e.message); setTimeout(() => setError(''), 6000); }, []);

  React.useEffect(() => {
    const onHash = () => setRoute(parseRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  React.useEffect(() => subscribe(() => {
    call('projects.list').then(setProjects).catch(onError);
    call('attention').then(setAttention).catch(onError);
    window.dispatchEvent(new Event('nhanh-change'));
  }, setOnline), [onError]);

  const reviewRoots = pendingRoots(attention.review || []);
  const needsYou = attention.questions.length + attention.blocked.length + reviewRoots.length;
  const active = (projects || []).filter((p) => !p.archived);

  const newProject = async () => {
    const title = await askText({ title: 'Dự án mới', label: 'Tên dự án', placeholder: 'CG03 Tên game', required: true, confirmLabel: 'Tạo' });
    // Projects made here start with review on: what agents add waits for the user's approval.
    if (title) call('project.create', { title, review: true }).then((p) => go(projectPath(p.id))).catch(onError);
  };

  return (
    <div className="app">
      <nav className="side">
        <div className="brand">Nhánh</div>
        <a className={`nav ${route.view === 'home' ? 'on' : ''}`} href="#/" title="Tổng quan"><LayoutGrid size={16} /> <span className="nav-label">Tổng quan</span></a>
        <a className={`nav ${route.view === 'inbox' ? 'on' : ''}`} href="#/inbox" title="Cần bạn">
          <Bell size={16} /> <span className="nav-label">Cần bạn</span> {needsYou > 0 && <span className="badge">{needsYou}</span>}
        </a>
        <div className="side-title">Dự án</div>
        {active.map((p) => (
          <a key={p.id} className={`nav ${route.projectId === p.id ? 'on' : ''}`} href={`#${projectPath(p.id)}`} title={p.title}>
            <span className={`dot ${p.summary.doing.length ? 'dot-doing' : ''}`} />
            <span className="grow ellipsis">{p.title}</span>
            <span className="muted">{pct(p.summary.progress)}</span>
          </a>
        ))}
        <button className="nav nav-add" onClick={newProject}><Plus size={16} /> Dự án mới</button>
        <div className={`conn ${online ? '' : 'off'}`}>{online ? 'Đang kết nối' : 'Mất kết nối với server…'}</div>
      </nav>

      <main className="main">
        {error && <div className="toast" role="alert">{error}</div>}
        {projects === null ? <p className="muted pad">Đang tải…</p>
          : route.view === 'inbox' ? <Inbox attention={attention} reviewRoots={reviewRoots} onError={onError} />
          : route.view === 'project' ? <Project key={route.projectId} projectId={route.projectId} taskId={route.taskId} onError={onError} />
          : <Home projects={active} onNew={newProject} />}
      </main>
      <DialogHost />
    </div>
  );
}

// ---- Tổng quan -------------------------------------------------------------------------------------------------
function Home({ projects, onNew }) {
  if (!projects.length) {
    return (
      <div className="pad empty">
        <h1>Chưa có dự án nào</h1>
        <p className="muted">Tạo một dự án, rồi tự thêm mốc và việc, hoặc để agent đề xuất kế hoạch cho bạn duyệt.</p>
        <button className="btn btn-primary" onClick={onNew}><Plus size={16} /> Dự án mới</button>
      </div>
    );
  }
  return (
    <div className="pad">
      <h1>Tổng quan</h1>
      <div className="cards">
        {projects.map((p) => {
          const s = p.summary;
          return (
            <a key={p.id} className="card" href={`#${projectPath(p.id)}`}>
              <div className="card-head">
                <h2>{p.title}</h2>
                <span className="chip">{STAGE_LABEL[p.stage] || p.stage}</span>
              </div>
              <div className="card-progress"><Bar value={s.progress} /><strong>{pct(s.progress)}</strong></div>
              <div className="card-counts">
                {['doing', 'blocked', 'todo', 'done'].map((k) => <span key={k} className={`count count-${k}`}><b>{s.counts[k]}</b> {STATUS_LABEL[k].toLowerCase()}</span>)}
              </div>
              <div className="card-now">
                {s.doing.length
                  ? s.doing.slice(0, 2).map((t) => <div key={t.id} className="ellipsis"><span className="dot dot-doing" /> {t.title} <span className="muted">· {actorName(t.owner)}</span></div>)
                  : <span className="muted">Không có việc nào đang làm</span>}
              </div>
              <div className="card-foot">
                {s.needsUser > 0 ? <span className="need">Cần bạn: {s.needsUser}{s.awaitingReview ? ` (${s.awaitingReview} chờ duyệt)` : ''}</span> : <span />}
                <span className="muted">{s.lastEventAt ? `Hoạt động ${timeAgo(s.lastEventAt)}` : 'Chưa có hoạt động'}</span>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

// ---- Cần bạn ---------------------------------------------------------------------------------------------------
function Inbox({ attention, reviewRoots, onError }) {
  const { questions, blocked, pending, review = [] } = attention;
  const TaskLink = ({ t }) => <a className="link" href={`#${projectPath(t.projectId, t.id)}`}>{t.title}</a>;
  const unblock = async (t) => {
    const note = await askText({ title: 'Gỡ chặn', label: 'Đã gỡ chặn bằng cách nào? (agent sẽ đọc)', confirmLabel: 'Gỡ chặn' });
    if (note !== null) call('task.unblock', { taskId: t.id, note: note || undefined }).catch(onError);
  };
  const nothing = !questions.length && !blocked.length && !reviewRoots.length;
  return (
    <div className="pad narrow">
      <h1>Cần bạn</h1>
      {nothing && <p className="muted">Không có gì đang chờ bạn. Agent cứ thế làm tiếp.</p>}

      {questions.length > 0 && <h3>Câu hỏi chờ bạn trả lời</h3>}
      {questions.map((t) => (
        <div key={t.id} className="inbox-item">
          <div className="inbox-where"><span className="muted">{t.projectTitle} ·</span> <TaskLink t={t} /></div>
          <QuestionBox task={t} onError={onError} />
        </div>
      ))}

      {reviewRoots.length > 0 && <h3>Agent đề xuất, chờ bạn duyệt</h3>}
      {reviewRoots.map((t) => {
        const under = review.filter((x) => x.id !== t.id && x.projectId === t.projectId && descendantIds(review, t.id).has(x.id)).length;
        return (
          <div key={t.id} className="inbox-item review-item">
            <div className="grow">
              <div><span className="muted">{t.projectTitle} ·</span> {t.kind === 'group' && <Flag size={13} className="muted" />} <TaskLink t={t} />
                {under > 0 && <span className="muted"> · và {under} mục bên trong</span>}</div>
              {t.reason && <div className="muted small">Lý do: {t.reason}</div>}
            </div>
            <button className="btn btn-approve" onClick={() => approve([t]).catch(onError)}><Check size={14} /> Duyệt</button>
            <button className="btn" onClick={() => rejectProposal(t).catch(onError)}><X size={14} /> Bỏ</button>
          </div>
        );
      })}

      {blocked.length > 0 && <h3>Việc bị chặn</h3>}
      {blocked.map((t) => (
        <div key={t.id} className="inbox-item">
          <div className="inbox-where"><span className="muted">{t.projectTitle} ·</span> <TaskLink t={t} /></div>
          <div className="blocked-box">
            {t.blockedReason || '(không ghi lý do)'}
            <div><button className="btn" onClick={() => unblock(t)}>Đã gỡ chặn</button></div>
          </div>
        </div>
      ))}

      {pending.length > 0 && <h3>Bạn đã gửi, agent chưa nhận</h3>}
      {pending.map((t) => (
        <div key={t.id} className="inbox-item slim">
          <span className="muted">{t.projectTitle} ·</span> <TaskLink t={t} />
          <span className="muted"> · {t.question?.answer ? 'câu trả lời của bạn' : 'yêu cầu của bạn'}, sẽ được đọc ở đầu phiên làm việc tới</span>
        </div>
      ))}
    </div>
  );
}

// ---- One project -----------------------------------------------------------------------------------------------
const FILTERS = [
  ['all', 'Tất cả', () => true],
  ['doing', 'Đang làm', (t) => t.rollup.status === 'doing'],
  ['todo', 'Chờ làm', (t) => t.rollup.status === 'todo'],
  ['review', 'Chờ duyệt', isPending],
  ['need', 'Cần bạn', (t) => t.needsUser],
  ['done', 'Xong', (t) => t.rollup.status === 'done'],
];

/** Where a dragged item lands: before or after a row (same parent), or inside it (last child). */
function dropTarget(tasks, draggedId, target, zone) {
  const dragged = tasks.find((t) => t.id === draggedId);
  if (!dragged || dragged.id === target.id || descendantIds(tasks, dragged.id).has(target.id)) return null;
  const parentId = zone === 'inside' ? target.id : target.parentId;
  const parent = tasks.find((t) => t.id === parentId);
  if (dragged.kind === 'group' && parent && parent.kind !== 'group') return null; // a milestone never goes under a task
  if (zone === 'inside') return { parentId, index: undefined };
  const siblings = childrenOf(tasks, parentId).filter((t) => t.id !== dragged.id);
  const at = siblings.findIndex((t) => t.id === target.id);
  return { parentId, index: zone === 'after' ? at + 1 : at };
}

function Project({ projectId, taskId, onError }) {
  const [data, setData] = React.useState(null);
  const [tab, setTab] = React.useState('plan');
  const [filter, setFilter] = React.useState('all');
  const [closed, setClosed] = React.useState(() => new Set());
  const [preset, setPreset] = React.useState(null);
  const [drag, setDrag] = React.useState(null);
  const [drop, setDrop] = React.useState(null);
  const [flowId, setFlowId] = React.useState(null);
  // Luồng tab: the tree on the left, the board on the right; the user drags the divider, the width is remembered.
  const [split, setSplit] = React.useState(() => Number(localStorage.getItem('nhanh-split')) || 0.42);
  const splitBox = React.useRef(null);
  const load = React.useCallback(() => call('project.get', { projectId, events: 300 }).then(setData).catch(onError), [projectId, onError]);
  React.useEffect(() => { load(); window.addEventListener('nhanh-change', load); return () => window.removeEventListener('nhanh-change', load); }, [load]);
  const openTask = React.useCallback((id) => go(projectPath(projectId, id)), [projectId]);
  const closeTask = React.useCallback(() => go(projectPath(projectId)), [projectId]);
  if (!data) return <p className="muted pad">Đang tải…</p>;

  const { project: p, summary: s, tasks, events, flows = [] } = data;
  const match = FILTERS.find((f) => f[0] === filter)[2];
  // An item is shown when it or something below it matches the filter.
  const visible = new Set();
  const mark = (t) => {
    const kids = childrenOf(tasks, t.id).map(mark);
    const own = (t.kind === 'task' || filter === 'review') && match(t);
    const show = filter === 'all' || own || kids.some(Boolean);
    if (show) visible.add(t.id);
    return show;
  };
  childrenOf(tasks, null).forEach(mark);

  const toggle = (id) => setClosed((old) => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const move = (id, place) => place && call('task.move', { taskId: id, parentId: place.parentId, index: place.index }).catch(onError);
  const shift = (t, step) => {
    const siblings = childrenOf(tasks, t.parentId);
    const at = siblings.findIndex((x) => x.id === t.id) + step;
    if (at >= 0 && at < siblings.length) move(t.id, { parentId: t.parentId, index: at });
  };
  const addInside = (t) => setPreset({ parentId: t.id, kind: 'task', n: Date.now() });
  const newMilestone = () => setPreset({ parentId: null, kind: 'group', n: Date.now() });
  const reviewItems = tasks.filter(isPending);
  const flow = flows.find((f) => f.id === flowId) || flows[0] || null;
  const onBoard = tab === 'flow' && flow ? new Set(flow.nodes.map((n) => n.taskId)) : null;
  const onSplitDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const box = splitBox.current.getBoundingClientRect();
    const onMove = (m) => setSplit(Math.min(0.75, Math.max(0.2, (m.clientX - box.left) / box.width)));
    const onUp = (u) => {
      u.currentTarget.removeEventListener('pointermove', onMove);
      u.currentTarget.removeEventListener('pointerup', onUp);
      setSplit((value) => { localStorage.setItem('nhanh-split', String(value)); return value; });
    };
    e.currentTarget.addEventListener('pointermove', onMove);
    e.currentTarget.addEventListener('pointerup', onUp);
  };

  const rowActions = {
    onToggle: toggle, onOpen: openTask, onAddInside: addInside, onShift: shift,
    onApprove: (t) => approve([t]).catch(onError),
    onReject: (t) => rejectProposal(t).catch(onError),
    onDragStart: (t) => setDrag(t.id),
    onDragEnd: () => { setDrag(null); setDrop(null); },
    onDragOver: (t, zone) => {
      if (!drag || !dropTarget(tasks, drag, t, zone)) { setDrop(null); return false; }
      if (drop?.id !== t.id || drop?.zone !== zone) setDrop({ id: t.id, zone });
      return true;
    },
    onDrop: (t, zone) => {
      move(drag, dropTarget(tasks, drag, t, zone));
      if (zone === 'inside') setClosed((old) => { const next = new Set(old); next.delete(t.id); return next; });
      setDrag(null); setDrop(null);
    },
  };

  const rows = [];
  const walk = (parentId, depth) => {
    for (const t of childrenOf(tasks, parentId)) {
      if (!visible.has(t.id)) continue;
      const kids = childrenOf(tasks, t.id).length > 0;
      rows.push(<Row key={t.id} t={t} depth={depth} hasKids={kids} closed={closed.has(t.id)} selected={t.id === taskId}
        dragging={drag === t.id} dropZone={drop?.id === t.id ? drop.zone : null} onBoard={onBoard?.has(t.id)} actions={rowActions} />);
      if (kids && !closed.has(t.id)) walk(t.id, depth + 1);
    }
  };
  walk(null, 0);

  return (
    <div className={`project ${tab === 'flow' ? 'project-flow' : ''}`}>
      <div className="project-main">
        <header className="project-head">
          <div className="row">
            <Editable className="project-title" value={p.title} onSave={(title) => title && call('project.update', { projectId, title }).catch(onError)} />
            <select className="select" value={p.stage} onChange={(e) => call('project.update', { projectId, stage: e.target.value }).catch(onError)} aria-label="Giai đoạn">
              {Object.entries(STAGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="project-progress">
            <Bar value={s.progress} /><strong>{pct(s.progress)}</strong>
            <span className="muted">{s.counts.done}/{s.counts.done + s.counts.todo + s.counts.doing + s.counts.blocked} việc xong</span>
            {s.doing.length > 0 && <span className="doing-now"><span className="dot dot-doing" /> {s.doing.length} đang làm</span>}
            {s.needsUser > 0 && <span className="need">Cần bạn: {s.needsUser}</span>}
            <label className="toggle" title="Bật: mọi mốc và việc agent thêm phải được bạn duyệt trước khi agent bắt đầu làm">
              <input type="checkbox" checked={Boolean(p.review)} onChange={(e) => call('project.update', { projectId, review: e.target.checked }).catch(onError)} />
              Duyệt trước việc agent thêm
            </label>
          </div>
          <div className="tabs" role="tablist">
            {[['plan', 'Kế hoạch'], ['flow', `Luồng${flows.some((f) => f.state === 'running') ? ' ▶' : ''}`], ['journal', 'Nhật ký'], ['notes', 'Ghi chú']].map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>
        </header>

        {(tab === 'plan' || tab === 'flow') && (() => {
          const planView = (
          <>
            <Composer projectId={projectId} tasks={tasks} preset={preset} onError={onError} />
            {reviewItems.length > 0 && (
              <div className="review-banner">
                <div className="grow">
                  <strong>Agent đề xuất {reviewItems.length} mục, chờ bạn duyệt.</strong>
                  <div className="muted small">Agent không bắt đầu các mục này trước khi bạn duyệt. Sửa, sắp xếp hoặc bỏ bớt trước nếu cần.</div>
                </div>
                {filter !== 'review' && <button className="btn" onClick={() => setFilter('review')}>Xem các mục</button>}
                <button className="btn btn-approve" onClick={() => approve(pendingRoots(reviewItems)).catch(onError)}><Check size={14} /> Duyệt tất cả</button>
              </div>
            )}
            <div className="filters">
              {FILTERS.map(([id, label, test]) => {
                if (id === 'review' && !reviewItems.length) return null;
                const n = id === 'all' ? null : id === 'review' ? reviewItems.length : tasks.filter((t) => t.kind === 'task' && test(t)).length;
                return <button key={id} className={`filter ${filter === id ? 'on' : ''}`} onClick={() => setFilter(id)}>{label}{n !== null && <span className="muted"> {n}</span>}</button>;
              })}
              <button className="filter filter-add" onClick={newMilestone}><Flag size={13} /> Mốc mới</button>
            </div>
            {tasks.length === 0
              ? <div className="empty"><p>Dự án chưa có kế hoạch.</p><p className="muted">Thêm mốc và việc ở ô phía trên, hoặc để agent đề xuất kế hoạch ở đầu phiên làm việc (<code>plan.apply</code>).</p></div>
              : rows.length === 0 ? <p className="muted pad">Không có việc nào khớp bộ lọc.</p>
              : (
                <>
                  <div className="tree" role="tree">{rows}</div>
                  <p className="muted small tree-hint">{tab === 'flow'
                    ? 'Kéo một dòng sang bảng bên phải để thêm vào luồng. Trong cây: kéo để đổi thứ tự hoặc chuyển mốc.'
                    : 'Kéo một dòng để đổi thứ tự hoặc chuyển mốc (thả vào giữa dòng để đặt bên trong). Alt+↑/↓ để dời lên xuống. Agent làm theo thứ tự từ trên xuống.'}</p>
                </>
              )}
          </>
          );
          if (tab === 'plan') return planView;
          return (
            <div className="split" ref={splitBox}>
              <div className="split-left" style={{ width: `${split * 100}%` }}>{planView}</div>
              <div className="splitter" role="separator" aria-orientation="vertical" aria-label="Kéo để đổi độ rộng" onPointerDown={onSplitDown} />
              <div className="split-right">
                <FlowView projectId={projectId} tasks={tasks} flows={flows} flow={flow} onSelectFlow={setFlowId} events={events}
                  selectedTaskId={taskId} onOpenTask={openTask} onError={onError} />
              </div>
            </div>
          );
        })()}
        {tab === 'journal' && <div className="pad-x"><Journal events={events} tasks={tasks} onOpenTask={openTask} /></div>}
        {tab === 'notes' && <Notes project={p} onError={onError} />}
      </div>
      {taskId && <TaskPanel taskId={taskId} tasks={tasks} onClose={closeTask} onError={onError} onOpenTask={openTask} />}
    </div>
  );
}

function Row({ t, depth, hasKids, closed, selected, dragging, dropZone, onBoard, actions }) {
  const group = t.kind === 'group';
  const r = t.rollup;
  const openQuestion = t.question && !t.question.answer;
  const crit = t.criteria.length ? `${t.criteria.filter((c) => c.done).length}/${t.criteria.length}` : '';
  const pending = isPending(t);
  const zoneOf = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - box.top) / box.height;
    return y < 0.3 ? 'before' : y > 0.7 ? 'after' : 'inside';
  };
  const stop = (fn) => (e) => { e.stopPropagation(); fn(t); };
  return (
    <div role="treeitem" aria-selected={selected} aria-expanded={hasKids ? !closed : undefined} tabIndex={0} draggable
      className={`tr ${group ? 'tr-group' : ''} ${selected ? 'on' : ''} ${pending ? 'tr-pending' : ''} ${dragging ? 'tr-dragging' : ''} ${dropZone ? `drop-${dropZone}` : ''} st-row-${r.status}`}
      style={{ paddingLeft: 12 + depth * 22 }}
      onClick={() => actions.onOpen(t.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') actions.onOpen(t.id);
        if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); actions.onShift(t, -1); }
        if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); actions.onShift(t, 1); }
      }}
      onDragStart={(e) => {
        // Moving within the tree, or copying onto a flow board (application/x-nhanh-task).
        e.dataTransfer.effectAllowed = 'copyMove';
        e.dataTransfer.setData('text/plain', t.id);
        e.dataTransfer.setData('application/x-nhanh-task', t.id);
        actions.onDragStart(t);
      }}
      onDragEnd={actions.onDragEnd}
      onDragOver={(e) => { if (actions.onDragOver(t, zoneOf(e))) e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); actions.onDrop(t, zoneOf(e)); }}>
      <span className="grip" aria-hidden="true"><GripVertical size={14} /></span>
      {hasKids
        ? <button className="caret" aria-label={closed ? 'Mở' : 'Thu'} onClick={stop(() => actions.onToggle(t.id))}>{closed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}</button>
        : <span className="caret" />}
      {group ? <Flag size={14} className="st muted" /> : <StatusIcon status={t.status} question={openQuestion} />}
      <span className="tr-title ellipsis">{t.title}</span>
      {onBoard && <span className="tag tag-board" title="Đã có trong luồng đang mở"><GitFork size={11} /> trong luồng</span>}
      {pending && (
        <>
          <span className="tag tag-review" title={t.reason || 'Agent đề xuất'}>chờ duyệt</span>
          <button className="mini mini-approve" title="Duyệt" aria-label="Duyệt" onClick={stop(actions.onApprove)}><Check size={14} /></button>
          <button className="mini" title="Bỏ đề xuất" aria-label="Bỏ đề xuất" onClick={stop(actions.onReject)}><X size={14} /></button>
        </>
      )}
      {!pending && t.origin === 'agent' && <span className="tag tag-agent" title={t.reason}>agent thêm</span>}
      {t.origin === 'user' && <span className="tag tag-user">bạn yêu cầu{t.needsAgent ? ' · chưa nhận' : ''}</span>}
      {t.waitingOn?.length > 0 && t.status === 'todo' && <span className="tag tag-wait" title="Chạy sau khi các việc trước xong (xem Luồng hoặc chi tiết)">chờ {t.waitingOn.length} việc trước</span>}
      {t.labels?.slice(0, 2).map((l) => <span key={l} className="tag">{l}</span>)}
      <span className="tr-right">
        <button className="mini row-add" title={group ? 'Thêm việc vào mốc này' : 'Thêm việc con'} aria-label="Thêm bên trong" onClick={stop(actions.onAddInside)}><Plus size={14} /></button>
        {t.status === 'doing' && t.owner && <span className="owner">{actorName(t.owner)}</span>}
        {crit && !group && <span className="muted crit">{crit}</span>}
        {t.size && <span className={`size size-${t.size}`}>{t.size}</span>}
        {(group || hasKids) && <><Bar value={r.progress} status={r.status} /><span className="muted pctnum">{pct(r.progress)}</span></>}
      </span>
    </div>
  );
}

function Notes({ project, onError }) {
  const [editing, setEditing] = React.useState(false);
  const save = (brief) => call('project.update', { projectId: project.id, brief }).catch(onError);
  return (
    <div className="pad-x notes">
      <div className="row">
        <span className="muted grow">Ghi chú của dự án (Markdown): mục tiêu, phạm vi, liên kết tới GDD trong repo{project.repo ? ` ${project.repo}` : ''}.</span>
        <button className="btn" onClick={() => setEditing(!editing)}>{editing ? 'Xem' : 'Sửa'}</button>
      </div>
      {editing
        ? <Editable multiline className="notes-edit" value={project.brief || ''} placeholder="Viết ghi chú… (Ctrl+Enter hoặc bấm ra ngoài để lưu)" onSave={save} />
        : project.brief ? <div className="markdown"><Markdown>{project.brief}</Markdown></div> : <p className="muted">Chưa có ghi chú.</p>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
