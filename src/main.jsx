// The web UI: a control room for one person running several agents.
//   #/            Tổng quan: every project at a glance
//   #/inbox       Cần bạn: questions to answer, blocked work, requests not picked up yet
//   #/p/<id>      one project: plan tree, journal, notes; #/p/<id>/t/<taskId> opens an item
import React from 'react';
import { createRoot } from 'react-dom/client';
import Markdown from 'react-markdown';
import { Bell, ChevronDown, ChevronRight, LayoutGrid, Plus, Send } from 'lucide-react';
import { call, subscribe } from './api.js';
import { childrenOf } from '../shared/model.js';
import TaskPanel, { Journal, QuestionBox } from './TaskPanel.jsx';
import { Bar, Editable, STAGE_LABEL, STATUS_LABEL, StatusIcon, actorName, pct, timeAgo } from './ui.jsx';
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
  const [attention, setAttention] = React.useState({ questions: [], blocked: [], pending: [] });
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

  const needsYou = attention.questions.length + attention.blocked.length;
  const active = (projects || []).filter((p) => !p.archived);

  const newProject = async () => {
    const title = window.prompt('Tên dự án mới:')?.trim();
    if (title) call('project.create', { title }).then((p) => go(projectPath(p.id))).catch(onError);
  };

  return (
    <div className="app">
      <nav className="side">
        <div className="brand">Nhánh</div>
        <a className={`nav ${route.view === 'home' ? 'on' : ''}`} href="#/"><LayoutGrid size={16} /> Tổng quan</a>
        <a className={`nav ${route.view === 'inbox' ? 'on' : ''}`} href="#/inbox">
          <Bell size={16} /> Cần bạn {needsYou > 0 && <span className="badge">{needsYou}</span>}
        </a>
        <div className="side-title">Dự án</div>
        {active.map((p) => (
          <a key={p.id} className={`nav ${route.projectId === p.id ? 'on' : ''}`} href={`#${projectPath(p.id)}`}>
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
          : route.view === 'inbox' ? <Inbox attention={attention} onError={onError} />
          : route.view === 'project' ? <Project key={route.projectId} projectId={route.projectId} taskId={route.taskId} onError={onError} />
          : <Home projects={active} onNew={newProject} />}
      </main>
    </div>
  );
}

// ---- Tổng quan -------------------------------------------------------------------------------------------------
function Home({ projects, onNew }) {
  if (!projects.length) {
    return (
      <div className="pad empty">
        <h1>Chưa có dự án nào</h1>
        <p className="muted">Tạo một dự án, rồi để agent lập kế hoạch bằng <code>plan.apply</code>, hoặc tự thêm việc.</p>
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
                {s.needsUser > 0 ? <span className="need">Cần bạn: {s.needsUser}</span> : <span />}
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
function Inbox({ attention, onError }) {
  const { questions, blocked, pending } = attention;
  const TaskLink = ({ t }) => <a className="link" href={`#${projectPath(t.projectId, t.id)}`}>{t.title}</a>;
  return (
    <div className="pad narrow">
      <h1>Cần bạn</h1>
      {!questions.length && !blocked.length && <p className="muted">Không có gì đang chờ bạn. Agent cứ thế làm tiếp.</p>}

      {questions.length > 0 && <h3>Câu hỏi chờ bạn trả lời</h3>}
      {questions.map((t) => (
        <div key={t.id} className="inbox-item">
          <div className="inbox-where"><span className="muted">{t.projectTitle} ·</span> <TaskLink t={t} /></div>
          <QuestionBox task={t} onError={onError} />
        </div>
      ))}

      {blocked.length > 0 && <h3>Việc bị chặn</h3>}
      {blocked.map((t) => (
        <div key={t.id} className="inbox-item">
          <div className="inbox-where"><span className="muted">{t.projectTitle} ·</span> <TaskLink t={t} /></div>
          <div className="blocked-box">
            {t.blockedReason || '(không ghi lý do)'}
            <div>
              <button className="btn" onClick={() => call('task.unblock', { taskId: t.id, note: window.prompt('Đã gỡ chặn bằng cách nào? (agent sẽ đọc)')?.trim() || undefined }).catch(onError)}>Đã gỡ chặn</button>
            </div>
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
  ['need', 'Cần bạn', (t) => t.needsUser],
  ['done', 'Xong', (t) => t.rollup.status === 'done'],
];

function Project({ projectId, taskId, onError }) {
  const [data, setData] = React.useState(null);
  const [tab, setTab] = React.useState('plan');
  const [filter, setFilter] = React.useState('all');
  const [closed, setClosed] = React.useState(() => new Set());
  const [request, setRequest] = React.useState('');
  const load = React.useCallback(() => call('project.get', { projectId, events: 300 }).then(setData).catch(onError), [projectId, onError]);
  React.useEffect(() => { load(); window.addEventListener('nhanh-change', load); return () => window.removeEventListener('nhanh-change', load); }, [load]);
  const openTask = React.useCallback((id) => go(projectPath(projectId, id)), [projectId]);
  const closeTask = React.useCallback(() => go(projectPath(projectId)), [projectId]);
  if (!data) return <p className="muted pad">Đang tải…</p>;

  const { project: p, summary: s, tasks, events } = data;
  const selected = tasks.find((t) => t.id === taskId);
  const match = FILTERS.find((f) => f[0] === filter)[2];
  // An item is shown when it or something below it matches the filter.
  const visible = new Set();
  const mark = (t) => {
    const kids = childrenOf(tasks, t.id).map(mark);
    const show = (t.kind === 'task' && match(t)) || kids.some(Boolean) || (filter === 'all');
    if (show) visible.add(t.id);
    return show;
  };
  childrenOf(tasks, null).forEach(mark);

  const addRequest = (e) => {
    e.preventDefault();
    if (!request.trim()) return;
    const parentId = selected?.kind === 'group' ? selected.id : undefined;
    call('task.add', { projectId, title: request.trim(), parentId }).then(() => setRequest('')).catch(onError);
  };
  const toggle = (id) => setClosed((old) => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const rows = [];
  const walk = (parentId, depth) => {
    for (const t of childrenOf(tasks, parentId)) {
      if (!visible.has(t.id)) continue;
      const kids = childrenOf(tasks, t.id).length > 0;
      rows.push(<Row key={t.id} t={t} depth={depth} hasKids={kids} closed={closed.has(t.id)} selected={t.id === taskId} onToggle={toggle} onOpen={openTask} />);
      if (kids && !closed.has(t.id)) walk(t.id, depth + 1);
    }
  };
  walk(null, 0);

  return (
    <div className="project">
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
          </div>
          <div className="tabs" role="tablist">
            {[['plan', 'Kế hoạch'], ['journal', 'Nhật ký'], ['notes', 'Ghi chú']].map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>
        </header>

        {tab === 'plan' && (
          <>
            <form className="request" onSubmit={addRequest}>
              <input className="input grow" value={request} onChange={(e) => setRequest(e.target.value)}
                placeholder={selected?.kind === 'group' ? `Thêm yêu cầu vào "${selected.title}"…` : 'Thêm yêu cầu cho agent… (Enter)'} />
              <button className="btn btn-primary" disabled={!request.trim()}><Send size={14} /> Gửi</button>
            </form>
            <div className="filters">
              {FILTERS.map(([id, label, test]) => {
                const n = id === 'all' ? null : tasks.filter((t) => t.kind === 'task' && test(t)).length;
                return <button key={id} className={`filter ${filter === id ? 'on' : ''}`} onClick={() => setFilter(id)}>{label}{n !== null && <span className="muted"> {n}</span>}</button>;
              })}
            </div>
            {tasks.length === 0
              ? <div className="empty"><p>Dự án chưa có kế hoạch.</p><p className="muted">Agent lập kế hoạch ở đầu phiên làm việc (<code>plan.apply</code>), hoặc bạn gõ yêu cầu đầu tiên ở ô phía trên.</p></div>
              : rows.length === 0 ? <p className="muted pad">Không có việc nào khớp bộ lọc.</p>
              : <div className="tree" role="tree">{rows}</div>}
          </>
        )}
        {tab === 'journal' && <div className="pad-x"><Journal events={events} tasks={tasks} onOpenTask={openTask} /></div>}
        {tab === 'notes' && <Notes project={p} onError={onError} />}
      </div>
      {taskId && <TaskPanel taskId={taskId} onClose={closeTask} onError={onError} onOpenTask={openTask} />}
    </div>
  );
}

function Row({ t, depth, hasKids, closed, selected, onToggle, onOpen }) {
  const group = t.kind === 'group';
  const r = t.rollup;
  const openQuestion = t.question && !t.question.answer;
  const crit = t.criteria.length ? `${t.criteria.filter((c) => c.done).length}/${t.criteria.length}` : '';
  return (
    <div role="treeitem" aria-selected={selected} tabIndex={0}
      className={`tr ${group ? 'tr-group' : ''} ${selected ? 'on' : ''} st-row-${r.status}`} style={{ paddingLeft: 12 + depth * 22 }}
      onClick={() => onOpen(t.id)} onKeyDown={(e) => e.key === 'Enter' && onOpen(t.id)}>
      {hasKids
        ? <button className="caret" aria-label={closed ? 'Mở' : 'Thu'} onClick={(e) => { e.stopPropagation(); onToggle(t.id); }}>{closed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}</button>
        : <span className="caret" />}
      {!group && <StatusIcon status={t.status} question={openQuestion} />}
      <span className="tr-title ellipsis">{t.title}</span>
      {t.origin === 'agent' && <span className="tag tag-agent" title={t.reason}>agent thêm</span>}
      {t.origin === 'user' && <span className="tag tag-user">bạn yêu cầu{t.needsAgent ? ' · chưa nhận' : ''}</span>}
      {t.labels?.slice(0, 2).map((l) => <span key={l} className="tag">{l}</span>)}
      <span className="tr-right">
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
