// "Luồng": canvases where the user lays out tasks and groups as nodes, draws order arrows between them and hands the
// flow to one agent to run in order. The arrows are the items' own "after" lists, so they hold everywhere; the flow
// keeps the place of each node, the actor and whether it runs.
import React from 'react';
import { Flag, LayoutGrid, Pause, Play, Plus, Search, Trash2, X } from 'lucide-react';
import { call } from './api.js';
import { childrenOf } from '../shared/model.js';
import { askText, confirmAction } from './Dialog.jsx';
import { Bar, Editable, StatusIcon, actorName, pct } from './ui.jsx';

const W = 220; // node size; the arrows attach at the middle of the left and right edges
const H = 84;
const STATE_LABEL = { draft: 'Nháp', running: 'Đang chạy', paused: 'Tạm dừng', done: 'Xong' };

const isFinished = (tasks, item) => {
  if (!item || item.status === 'dropped') return true;
  if (item.kind === 'task') return item.status === 'done';
  return item.rollup?.status === 'done' || childrenOf(tasks, item.id).every((c) => isFinished(tasks, c));
};

export default function FlowView({ projectId, tasks, flows, events, selectedTaskId, onOpenTask, onError }) {
  const [flowId, setFlowId] = React.useState(() => flows[0]?.id || null);
  const flow = flows.find((f) => f.id === flowId) || flows[0] || null;

  const newFlow = async () => {
    const title = await askText({ title: 'Luồng mới', label: 'Tên luồng', placeholder: 'Setup dự án', required: true, confirmLabel: 'Tạo' });
    if (title) call('flow.create', { projectId, title }).then((f) => setFlowId(f.id)).catch(onError);
  };

  return (
    <div className="flows">
      <aside className="flow-list">
        <button className="btn btn-primary flow-new" onClick={newFlow}><Plus size={14} /> Luồng mới</button>
        {flows.map((f) => (
          <button key={f.id} className={`flow-item ${flow?.id === f.id ? 'on' : ''}`} onClick={() => setFlowId(f.id)}>
            <span className="flow-item-title ellipsis">{f.title}</span>
            <span className="flow-item-meta">
              <span className={`chip chip-flow-${f.state}`}>{STATE_LABEL[f.state]}</span>
              <span className="muted small">{f.done}/{f.total}{f.assignee ? ` · ${f.assignee}` : ''}</span>
            </span>
          </button>
        ))}
        {!flows.length && <p className="muted small">Luồng là một bảng: kéo việc vào, nối mũi tên "xong cái này mới đến cái kia", rồi giao cho một agent chạy lần lượt.</p>}
      </aside>
      {flow
        ? <FlowCanvas key={flow.id} flow={flow} tasks={tasks} events={events} selectedTaskId={selectedTaskId} onOpenTask={onOpenTask} onError={onError} />
        : <div className="empty grow"><p>Chưa có luồng nào.</p><button className="btn btn-primary" onClick={newFlow}><Plus size={14} /> Tạo luồng đầu tiên</button></div>}
    </div>
  );
}

function FlowCanvas({ flow, tasks, events, selectedTaskId, onOpenTask, onError }) {
  const byId = React.useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const [nodes, setNodes] = React.useState(flow.nodes);
  // The node being dragged lives in a ref: pointer events can come faster than React renders.
  const drag = React.useRef(null); // {taskId, dx, dy, startX, startY, moved}
  const [movingId, setMovingId] = React.useState(null);
  const [linking, setLinking] = React.useState(null); // {from, x, y}
  const [edge, setEdge] = React.useState(null); // selected arrow {from, to}
  const [query, setQuery] = React.useState('');
  const plane = React.useRef(null);

  // Follow the server unless the user is dragging a node right now.
  const serverNodes = JSON.stringify(flow.nodes);
  React.useEffect(() => { if (!drag.current) setNodes(JSON.parse(serverNodes)); }, [serverNodes]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveNodes = (next) => {
    setNodes(next);
    call('flow.update', { flowId: flow.id, nodes: next }).catch(onError);
  };
  const setAfter = (task, after) => call('task.update', { taskId: task.id, after }).catch(onError);
  const at = (e) => {
    const box = plane.current.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };

  const inFlow = new Set(nodes.map((n) => n.taskId));
  const live = nodes.filter((n) => byId.has(n.taskId));
  const place = new Map(live.map((n) => [n.taskId, n]));
  const next = new Set(flow.next);
  const width = Math.max(1600, ...live.map((n) => n.x + W + 300));
  const height = Math.max(900, ...live.map((n) => n.y + H + 240));

  // ---- nodes: add, move, remove ----
  const freeSpot = () => {
    const bottom = live.reduce((max, n) => Math.max(max, n.y + H), 0);
    return { x: 40, y: live.length ? bottom + 40 : 40 };
  };
  const addNode = (taskId, spot = freeSpot()) => {
    if (inFlow.has(taskId)) return;
    saveNodes([...nodes, { taskId, x: Math.max(0, Math.round(spot.x)), y: Math.max(0, Math.round(spot.y)) }]);
  };
  const removeNode = (taskId) => {
    // The arrows drawn between this node and the rest of the flow go with it; arrows to items elsewhere stay.
    const t = byId.get(taskId);
    if (t.after?.some((id) => inFlow.has(id))) setAfter(t, t.after.filter((id) => !inFlow.has(id)));
    for (const n of live) {
      const other = byId.get(n.taskId);
      if (other.after?.includes(taskId)) setAfter(other, other.after.filter((id) => id !== taskId));
    }
    saveNodes(nodes.filter((n) => n.taskId !== taskId));
  };
  const onNodeDown = (e, n) => {
    if (e.button !== 0 || e.target.closest('.port, .node-x, .node-mode')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = at(e);
    drag.current = { taskId: n.taskId, dx: p.x - n.x, dy: p.y - n.y, startX: p.x, startY: p.y, moved: false };
  };
  const placeAt = (d, p) => ({ x: Math.max(0, p.x - d.dx), y: Math.max(0, p.y - d.dy) });
  const onPlaneMove = (e) => {
    const d = drag.current;
    if (d) {
      const p = at(e);
      if (!d.moved && Math.abs(p.x - d.startX) + Math.abs(p.y - d.startY) > 4) {
        d.moved = true;
        setMovingId(d.taskId);
      }
      if (d.moved) setNodes((old) => old.map((n) => (n.taskId === d.taskId ? { ...n, ...placeAt(d, p) } : n)));
    }
    if (linking) setLinking({ ...linking, ...at(e) });
  };
  const onPlaneUp = (e) => {
    const d = drag.current;
    if (d) {
      drag.current = null;
      setMovingId(null);
      const p = at(e);
      const moved = d.moved || Math.abs(p.x - d.startX) + Math.abs(p.y - d.startY) > 4;
      if (moved) saveNodes(nodes.map((n) => (n.taskId === d.taskId ? { ...n, ...placeAt(d, p) } : n)));
      else onOpenTask(d.taskId);
    }
    if (linking) {
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-node]')?.dataset.node;
      const to = target && byId.get(target);
      if (to && to.id !== linking.from && !(to.after || []).includes(linking.from)) setAfter(to, [...(to.after || []), linking.from]);
      setLinking(null);
    }
  };

  // ---- auto layout: columns by arrow depth, rows in the current order ----
  const autoLayout = () => {
    const depth = new Map();
    const depthOf = (id, seen = new Set()) => {
      if (depth.has(id)) return depth.get(id);
      if (seen.has(id)) return 0;
      seen.add(id);
      const before = (byId.get(id).after || []).filter((x) => place.has(x));
      const d = before.length ? 1 + Math.max(...before.map((x) => depthOf(x, seen))) : 0;
      depth.set(id, d);
      return d;
    };
    const rows = new Map();
    const sorted = [...live].sort((a, b) => a.y - b.y || a.x - b.x);
    saveNodes(sorted.map((n) => {
      const d = depthOf(n.taskId);
      const row = rows.get(d) || 0;
      rows.set(d, row + 1);
      return { ...n, x: 40 + d * (W + 80), y: 40 + row * (H + 46) };
    }));
  };

  // ---- the arrows ----
  const edges = [];
  for (const n of live) {
    for (const from of byId.get(n.taskId).after || []) {
      const a = place.get(from);
      if (a) edges.push({ from, to: n.taskId, a, b: n, met: isFinished(tasks, byId.get(from)) });
    }
  }
  const curve = (x1, y1, x2, y2) => {
    const bend = Math.max(40, Math.abs(x2 - x1) / 2);
    return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
  };
  React.useEffect(() => {
    if (!edge) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (e.target.closest?.('input, textarea')) return;
      const to = byId.get(edge.to);
      setAfter(to, (to.after || []).filter((id) => id !== edge.from));
      setEdge(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---- toolbar ----
  const actors = [...new Set(events.map((e) => e.actor).filter((a) => a && a !== 'human' && a !== 'migration'))];
  const run = (status) => call('flow.update', { flowId: flow.id, status }).catch(onError);
  const remove = async () => {
    const ok = await confirmAction({ title: 'Xoá luồng', text: `Xoá luồng "${flow.title}"? Các việc và mũi tên thứ tự vẫn giữ nguyên.`, confirmLabel: 'Xoá luồng', danger: true });
    if (ok) call('flow.delete', { flowId: flow.id }).catch(onError);
  };

  // ---- the palette: items not on the canvas yet ----
  const palette = [];
  const q = query.trim().toLowerCase();
  const walk = (parentId, depth) => {
    for (const t of childrenOf(tasks, parentId)) {
      if (t.status === 'dropped') continue;
      if (!inFlow.has(t.id) && (!q || t.title.toLowerCase().includes(q))) palette.push({ t, depth: q ? 0 : depth });
      walk(t.id, depth + 1);
    }
  };
  walk(null, 0);

  return (
    <div className="flow">
      <div className="flow-bar">
        <Editable className="flow-title" value={flow.title} onSave={(title) => title && call('flow.update', { flowId: flow.id, title }).catch(onError)} />
        <span className={`chip chip-flow-${flow.state}`}>{STATE_LABEL[flow.state]}</span>
        <span className="muted small">{flow.done}/{flow.total} việc xong</span>
        <Bar value={flow.total ? flow.done / flow.total : 0} status={flow.state === 'done' ? 'done' : undefined} />
        <label className="flow-assignee" title="Actor sẽ chạy luồng này (tên agent ghi trong project.yaml, vd claude-cg01). Để trống: agent nào cũng được.">
          Giao cho
          <input className="input" list={`actors-${flow.id}`} defaultValue={flow.assignee || ''} key={flow.assignee || ''} placeholder="agent bất kỳ"
            onBlur={(e) => { if ((e.target.value.trim() || null) !== (flow.assignee || null)) call('flow.update', { flowId: flow.id, assignee: e.target.value.trim() }).catch(onError); }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          <datalist id={`actors-${flow.id}`}>{actors.map((a) => <option key={a} value={a} />)}</datalist>
        </label>
        {flow.status === 'running'
          ? <button className="btn" onClick={() => run('paused')}><Pause size={14} /> Tạm dừng</button>
          : <button className="btn btn-approve" disabled={!live.length || flow.state === 'done'} onClick={() => run('running')}><Play size={14} /> Chạy</button>}
        <button className="icon-btn" title="Sắp xếp tự động theo mũi tên" aria-label="Sắp xếp tự động" onClick={autoLayout}><LayoutGrid size={16} /></button>
        <button className="icon-btn" title="Xoá luồng" aria-label="Xoá luồng" onClick={remove}><Trash2 size={16} /></button>
      </div>

      <div className="flow-body">
        <aside className="palette">
          <div className="palette-search"><Search size={14} className="muted" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm việc, mốc…" /></div>
          <p className="muted small palette-hint">Kéo vào bảng, hoặc bấm + để thêm.</p>
          <ul className="palette-list">
            {palette.map(({ t, depth }) => (
              <li key={t.id} draggable style={{ paddingLeft: 8 + depth * 12 }} className={t.kind === 'group' ? 'palette-group' : ''}
                onDragStart={(e) => { e.dataTransfer.setData('application/x-nhanh-task', t.id); e.dataTransfer.effectAllowed = 'copy'; }}>
                {t.kind === 'group' ? <Flag size={13} className="muted" /> : <StatusIcon status={t.status} />}
                <span className="grow ellipsis" title={t.title}>{t.title}</span>
                <button className="mini" aria-label={`Thêm "${t.title}" vào luồng`} onClick={() => addNode(t.id)}><Plus size={13} /></button>
              </li>
            ))}
            {!palette.length && <li className="muted small">Mọi việc đã ở trong luồng.</li>}
          </ul>
        </aside>

        <div className="canvas" onClick={(e) => { if (e.target === e.currentTarget || e.target === plane.current) setEdge(null); }}>
          <div ref={plane} className={`plane ${linking ? 'linking' : ''}`} style={{ width, height }}
            onPointerMove={onPlaneMove} onPointerUp={onPlaneUp}
            onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-nhanh-task')) e.preventDefault(); }}
            onDrop={(e) => {
              const id = e.dataTransfer.getData('application/x-nhanh-task');
              if (!id) return;
              e.preventDefault();
              const p = at(e);
              addNode(id, { x: p.x - W / 2, y: p.y - H / 2 });
            }}>
            <svg className="edges" width={width} height={height}>
              <defs>
                {['met', 'open', 'on'].map((k) => (
                  <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0,0 L10,5 L0,10 z" className={`arrowhead-${k}`} />
                  </marker>
                ))}
              </defs>
              {edges.map((g) => {
                const on = edge?.from === g.from && edge?.to === g.to;
                const d = curve(g.a.x + W, g.a.y + H / 2, g.b.x, g.b.y + H / 2);
                return (
                  <g key={`${g.from}>${g.to}`} className="edge-hit" onClick={(e) => { e.stopPropagation(); setEdge({ from: g.from, to: g.to }); }}>
                    <path d={d} className="edge-wide" />
                    <path d={d} className={`edge ${on ? 'edge-on' : g.met ? 'edge-met' : 'edge-open'}`} markerEnd={`url(#arrow-${on ? 'on' : g.met ? 'met' : 'open'})`} />
                  </g>
                );
              })}
              {linking && (() => {
                const a = place.get(linking.from);
                return <path d={curve(a.x + W, a.y + H / 2, linking.x, linking.y)} className="edge edge-on edge-draft" markerEnd="url(#arrow-on)" />;
              })()}
            </svg>

            {edge && (() => {
              const a = place.get(edge.from);
              const b = place.get(edge.to);
              if (!a || !b) return null;
              const to = byId.get(edge.to);
              return (
                <button className="edge-x" style={{ left: (a.x + W + b.x) / 2 - 12, top: (a.y + b.y + H) / 2 - 12 }} title="Xoá mũi tên (Delete)" aria-label="Xoá mũi tên"
                  onClick={(e) => { e.stopPropagation(); setAfter(to, (to.after || []).filter((id) => id !== edge.from)); setEdge(null); }}><X size={14} /></button>
              );
            })()}

            {live.map((n) => (
              <Node key={n.taskId} n={n} t={byId.get(n.taskId)} tasks={tasks} inFlow={inFlow} byId={byId}
                next={next.has(n.taskId) || (byId.get(n.taskId).kind === 'group' && flow.next.some((id) => isUnder(tasks, id, n.taskId)))}
                selected={selectedTaskId === n.taskId} dragging={movingId === n.taskId}
                onDown={(e) => onNodeDown(e, n)}
                onLink={(e) => { e.stopPropagation(); e.currentTarget.closest('.plane').setPointerCapture?.(e.pointerId); setLinking({ from: n.taskId, ...at(e) }); }}
                onRemove={() => removeNode(n.taskId)}
                onMode={() => call('task.update', { taskId: n.taskId, afterMode: byId.get(n.taskId).afterMode === 'any' ? 'all' : 'any' }).catch(onError)} />
            ))}

            {!live.length && (
              <div className="plane-empty">
                <p><strong>Kéo việc hoặc mốc từ danh sách bên trái vào đây.</strong></p>
                <p className="muted">Kéo từ chấm tròn bên phải một ô sang ô khác để nối mũi tên: ô sau chỉ chạy khi ô trước xong.<br />
                  Nối từ một mốc = chờ cả mốc xong. Nhiều mũi tên vào một ô: mặc định chờ tất cả, bấm nhãn ở cạnh trái để đổi thành "một trong".<br />
                  Xong thì điền "Giao cho" và bấm Chạy: agent đó nhận từng việc theo thứ tự ở đầu mỗi phiên.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const isUnder = (tasks, id, groupId) => {
  for (let t = tasks.find((x) => x.id === id); t; t = tasks.find((x) => x.id === t.parentId)) if (t.parentId === groupId) return true;
  return false;
};

function Node({ n, t, tasks, inFlow, byId, next, selected, dragging, onDown, onLink, onRemove, onMode }) {
  const group = t.kind === 'group';
  const incoming = (t.after || []).filter((id) => inFlow.has(id)).length;
  const outside = (t.after || []).filter((id) => !inFlow.has(id)).map((id) => byId.get(id)?.title).filter(Boolean);
  const kids = group ? tasks.filter((x) => x.kind === 'task' && isUnder(tasks, x.id, t.id) && x.status !== 'dropped') : [];
  const doneKids = kids.filter((x) => x.status === 'done').length;
  const waiting = t.waitingOn?.length > 0 && t.status !== 'done' && t.status !== 'dropped';
  const state = isFinished(tasks, t) ? 'done' : t.status === 'doing' ? 'doing' : t.status === 'blocked' ? 'blocked' : next ? 'next' : waiting ? 'waiting' : 'todo';
  const crit = t.criteria?.length ? `${t.criteria.filter((c) => c.done).length}/${t.criteria.length}` : '';
  return (
    <div data-node={t.id} className={`node node-${state} ${group ? 'node-group' : ''} ${t.review === 'pending' ? 'node-pending' : ''} ${selected ? 'on' : ''} ${dragging ? 'node-dragging' : ''}`}
      style={{ left: n.x, top: n.y, width: W, height: H }} onPointerDown={onDown}>
      <span className="port port-in" aria-hidden="true" />
      {incoming > 1 && (
        <button className="node-mode" title="Bấm để đổi: chờ tất cả các ô trước, hay chỉ cần một ô xong" onClick={(e) => { e.stopPropagation(); onMode(); }}>
          {t.afterMode === 'any' ? 'một trong' : 'tất cả'}
        </button>
      )}
      <div className="node-head">
        {group ? <Flag size={14} className="muted" /> : <StatusIcon status={t.status} question={t.question && !t.question.answer} />}
        <span className="node-title" title={t.title}>{t.title}</span>
        <button className="node-x" title="Bỏ khỏi luồng (việc vẫn còn trong kế hoạch)" aria-label="Bỏ khỏi luồng" onClick={(e) => { e.stopPropagation(); onRemove(); }}><X size={13} /></button>
      </div>
      <div className="node-foot">
        {state === 'next' && <span className="node-badge badge-next">▶ kế tiếp</span>}
        {state === 'waiting' && <span className="node-badge" title={`Chờ: ${t.waitingOn.map((id) => byId.get(id)?.title || id).join(', ')}`}>chờ {t.waitingOn.length}</span>}
        {state === 'doing' && t.owner && <span className="owner">{actorName(t.owner)}</span>}
        {t.review === 'pending' && <span className="tag tag-review">chờ duyệt</span>}
        {outside.length > 0 && <span className="node-badge" title={`Cũng chờ (ngoài luồng): ${outside.join(', ')}`}>+{outside.length} ngoài luồng</span>}
        <span className="grow" />
        {group ? <span className="muted small">{doneKids}/{kids.length} · {pct(kids.length ? doneKids / kids.length : 0)}</span> : crit && <span className="muted small">{crit}</span>}
        {t.size && <span className={`size size-${t.size}`}>{t.size}</span>}
      </div>
      <span className="port port-out" title="Kéo sang ô khác để nối mũi tên" onPointerDown={onLink} />
    </div>
  );
}
