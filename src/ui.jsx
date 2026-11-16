// Small display pieces shared by the views, and the words the UI uses.
import React from 'react';
import { AlertTriangle, CheckCircle2, Circle, CircleDot, MessageCircleQuestion, XCircle } from 'lucide-react';

export const STATUS_LABEL = { todo: 'Chờ làm', doing: 'Đang làm', blocked: 'Bị chặn', done: 'Xong', dropped: 'Đã bỏ' };
export const STAGE_LABEL = {
  idea: 'Ý tưởng', brief: 'Brief', gdd: 'GDD', playtest: 'Playtest', production: 'Sản xuất', release: 'Phát hành', live: 'Đã ra mắt',
};
export const EVENT_LABEL = {
  project: 'Dự án', plan: 'Lập kế hoạch', added: 'Thêm việc', edited: 'Sửa', started: 'Bắt đầu', progress: 'Tiến độ',
  blocked: 'Bị chặn', unblocked: 'Gỡ chặn', asked: 'Hỏi bạn', answered: 'Bạn trả lời', ack: 'Agent đã nhận', done: 'Xong',
  approved: 'Bạn duyệt', flow: 'Luồng', run: 'Chạy agent', report: 'Báo cáo', stopped: 'Dừng', reopened: 'Mở lại', dropped: 'Bỏ', released: 'Trả lại', deleted: 'Xoá', note: 'Ghi chú',
};
const STATUS_ICON = { todo: Circle, doing: CircleDot, blocked: AlertTriangle, done: CheckCircle2, dropped: XCircle };

export const pct = (n) => `${Math.round((n || 0) * 100)}%`;
export const actorName = (actor) => {
  if (actor === 'human') return 'Bạn';
  if (/^run-\d+$/.test(actor || '')) return `Nhánh #${actor.slice(4)}`; // a session the tracker started (Runs.jsx)
  return actor;
};

export function StatusIcon({ status, question }) {
  if (question) return <MessageCircleQuestion size={16} className="st st-ask" aria-label="Chờ bạn trả lời" />;
  const Icon = STATUS_ICON[status] || Circle;
  return <Icon size={16} className={`st st-${status}`} aria-label={STATUS_LABEL[status]} />;
}

export function StatusChip({ status }) {
  return <span className={`chip chip-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function Bar({ value, status }) {
  return (
    <span className="bar" title={pct(value)}>
      <span className={`bar-fill ${status === 'done' ? 'bar-done' : ''}`} style={{ width: pct(value) }} />
    </span>
  );
}

export function timeAgo(iso) {
  if (!iso) return '';
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} giờ trước`;
  return `${Math.round(minutes / 1440)} ngày trước`;
}

export const clock = (iso) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
export const day = (iso) => new Date(iso).toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric' });

/** A text field that saves on Enter or blur and restores on Escape. */
export function Editable({ value, onSave, className = '', multiline = false, placeholder = '' }) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  const commit = () => { if (draft.trim() !== value.trim()) onSave(draft.trim()); };
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <Tag
      className={`editable ${className}`}
      value={draft}
      placeholder={placeholder}
      rows={multiline ? Math.min(14, Math.max(3, draft.split('\n').length + 1)) : undefined}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { setDraft(value); e.currentTarget.blur(); }
        if (e.key === 'Enter' && (!multiline || e.ctrlKey)) e.currentTarget.blur();
      }}
    />
  );
}
