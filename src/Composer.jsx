// The box at the top of the plan where the user adds work: a quick line (Enter), or the full form with the place
// in the tree, size, description, criteria and labels. A milestone (group) is added the same way.
import React from 'react';
import { ChevronDown, ChevronUp, Flag, ListTodo, Plus, X } from 'lucide-react';
import { call } from './api.js';
import { childrenOf } from '../shared/model.js';

/** Every item that can hold the new one, in tree order, with its depth. A milestone only goes under a milestone. */
function placesFor(tasks, kind) {
  const out = [];
  const walk = (parentId, depth) => {
    for (const t of childrenOf(tasks, parentId)) {
      if (t.status === 'dropped' || t.status === 'done') continue;
      if (kind === 'group' && t.kind !== 'group') continue;
      out.push({ id: t.id, title: t.title, kind: t.kind, depth });
      walk(t.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export const INDENT = String.fromCharCode(160).repeat(3); // a <select> drops ordinary spaces, so nesting is shown with no-break spaces
const EMPTY = { title: '', description: '', criteria: '', labels: '', size: '' };

export default function Composer({ projectId, tasks, preset, onError }) {
  const [kind, setKind] = React.useState('task');
  const [parentId, setParentId] = React.useState('');
  const [fields, setFields] = React.useState(EMPTY);
  const [details, setDetails] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const titleRef = React.useRef(null);

  // A "+" on a row or the "Mốc mới" button sets where the next item goes.
  React.useEffect(() => {
    if (!preset) return;
    setKind(preset.kind || 'task');
    setParentId(preset.parentId || '');
    titleRef.current?.focus();
  }, [preset]);

  const places = placesFor(tasks, kind);
  const parent = tasks.find((t) => t.id === parentId);
  React.useEffect(() => { if (parentId && !places.some((p) => p.id === parentId)) setParentId(''); }, [parentId, places]);
  const set = (key) => (e) => setFields((old) => ({ ...old, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const title = fields.title.trim();
    if (!title || busy) return;
    const lines = (text) => text.split('\n').map((x) => x.trim()).filter(Boolean);
    const args = { projectId, title, kind, parentId: parentId || undefined };
    if (fields.description.trim()) args.description = fields.description.trim();
    if (kind === 'task' && fields.size) args.size = fields.size;
    if (kind === 'task' && lines(fields.criteria).length) args.criteria = lines(fields.criteria);
    const labels = fields.labels.split(',').map((x) => x.trim()).filter(Boolean);
    if (labels.length) args.labels = labels;
    setBusy(true);
    try {
      await call('task.add', args);
      setFields(EMPTY); // the place and the kind stay, so several items go to the same milestone in a row
      titleRef.current?.focus();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const placeholder = kind === 'group'
    ? 'Tên mốc mới, ví dụ "M2 · Đủ các màn hình"… (Enter)'
    : `Thêm việc cho agent${parent ? ` vào "${parent.title}"` : ''}… (Enter)`;

  return (
    <form className="composer" onSubmit={submit}>
      <div className="composer-line">
        <div className="seg" role="radiogroup" aria-label="Loại">
          <button type="button" role="radio" aria-checked={kind === 'task'} className={kind === 'task' ? 'on' : ''} onClick={() => setKind('task')}><ListTodo size={14} /> Việc</button>
          <button type="button" role="radio" aria-checked={kind === 'group'} className={kind === 'group' ? 'on' : ''} onClick={() => setKind('group')}><Flag size={14} /> Mốc</button>
        </div>
        <input ref={titleRef} className="input grow" value={fields.title} onChange={set('title')} placeholder={placeholder} aria-label="Tiêu đề"
          onKeyDown={(e) => { if (e.key === 'Escape') setFields(EMPTY); }} />
        <button type="button" className="btn" aria-expanded={details} onClick={() => setDetails(!details)}>
          Chi tiết {details ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button className="btn btn-primary" disabled={!fields.title.trim() || busy}><Plus size={14} /> Thêm</button>
      </div>

      {!details && parent && (
        <div className="composer-where">
          Đặt vào <span className="chip">{parent.title}</span>
          <button type="button" className="icon-btn" aria-label="Đặt ở cấp cao nhất" onClick={() => setParentId('')}><X size={13} /></button>
        </div>
      )}

      {details && (
        <div className="composer-details">
          <label className="field">
            <span className="field-label">Nằm trong</span>
            <select className="select" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">— Cấp cao nhất —</option>
              {places.map((p) => <option key={p.id} value={p.id}>{`${INDENT.repeat(p.depth)}${p.kind === 'group' ? '▸ ' : '· '}${p.title}`}</option>)}
            </select>
          </label>
          {kind === 'task' && (
            <div className="field">
              <span className="field-label">Cỡ</span>
              <div className="seg" role="radiogroup" aria-label="Cỡ">
                {[['', '?'], ['S', 'S · nhỏ'], ['M', 'M · vừa'], ['L', 'L · lớn']].map(([value, label]) => (
                  <button key={value} type="button" role="radio" aria-checked={fields.size === value} className={fields.size === value ? 'on' : ''}
                    onClick={() => setFields((old) => ({ ...old, size: value }))}>{label}</button>
                ))}
              </div>
            </div>
          )}
          <label className="field">
            <span className="field-label">Nhãn <span className="muted">(cách nhau bằng dấu phẩy)</span></span>
            <input className="input" value={fields.labels} onChange={set('labels')} placeholder="ui, bug" />
          </label>
          <label className="field field-wide">
            <span className="field-label">Mô tả</span>
            <textarea className="input" rows={3} value={fields.description} onChange={set('description')} placeholder="Việc này là gì, vì sao cần (Markdown)" />
          </label>
          {kind === 'task' && (
            <label className="field field-wide">
              <span className="field-label">Tiêu chí nghiệm thu <span className="muted">(mỗi dòng một tiêu chí, kiểm tra được)</span></span>
              <textarea className="input" rows={3} value={fields.criteria} onChange={set('criteria')} placeholder={'Nút Mua trừ vàng và cập nhật bộ đếm\nTest EditMode chạy qua'} />
            </label>
          )}
        </div>
      )}
    </form>
  );
}
