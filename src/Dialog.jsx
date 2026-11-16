// In-app dialogs that replace window.prompt and window.confirm. Mount <DialogHost /> once; then
//   const text = await askText({ title, label, placeholder, required, multiline })   → string, or null when cancelled
//   const ok = await confirmAction({ title, text, confirmLabel, danger })            → true or false
import React from 'react';
import { X } from 'lucide-react';

let open = null; // set by the mounted host

export const askText = (options) => new Promise((resolve) => open({ ...options, kind: 'text', resolve }));
export const confirmAction = (options) => new Promise((resolve) => open({ ...options, kind: 'confirm', resolve }));

export function DialogHost() {
  const [dialog, setDialog] = React.useState(null);
  const [value, setValue] = React.useState('');
  const field = React.useRef(null);

  React.useEffect(() => {
    open = (next) => { setValue(next.initial || ''); setDialog(next); };
    return () => { open = null; };
  }, []);
  React.useEffect(() => { if (dialog) setTimeout(() => field.current?.focus(), 0); }, [dialog]);
  if (!dialog) return null;

  const close = (result) => { dialog.resolve(result); setDialog(null); };
  const text = value.trim();
  const canSubmit = dialog.kind === 'confirm' || !dialog.required || Boolean(text);
  const submit = (e) => {
    e?.preventDefault();
    if (!canSubmit) return;
    close(dialog.kind === 'confirm' ? true : text);
  };
  const onKeyDown = (e) => {
    if (e.key === 'Escape') close(dialog.kind === 'confirm' ? false : null);
    if (e.key === 'Enter' && e.ctrlKey) submit(e);
  };
  const Field = dialog.multiline ? 'textarea' : 'input';

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close(dialog.kind === 'confirm' ? false : null)}>
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onSubmit={submit} onKeyDown={onKeyDown}>
        <header className="dialog-head">
          <h2 id="dialog-title">{dialog.title}</h2>
          <button type="button" className="icon-btn" aria-label="Đóng" onClick={() => close(dialog.kind === 'confirm' ? false : null)}><X size={18} /></button>
        </header>
        {dialog.text && <p className="dialog-text">{dialog.text}</p>}
        {dialog.kind === 'text' && (
          <label className="field">
            {dialog.label && <span className="field-label">{dialog.label}{!dialog.required && <span className="muted"> (không bắt buộc)</span>}</span>}
            <Field ref={field} className="input" value={value} placeholder={dialog.placeholder || ''} rows={dialog.multiline ? 4 : undefined}
              onChange={(e) => setValue(e.target.value)} />
          </label>
        )}
        <footer className="dialog-actions">
          <span className="muted small">{dialog.kind === 'text' && dialog.multiline ? 'Ctrl+Enter để gửi · Esc để huỷ' : 'Esc để huỷ'}</span>
          <button type="button" className="btn" onClick={() => close(dialog.kind === 'confirm' ? false : null)}>Huỷ</button>
          <button ref={dialog.kind === 'confirm' ? field : undefined} className={`btn ${dialog.danger ? 'btn-danger-solid' : 'btn-primary'}`} disabled={!canSubmit}>
            {dialog.confirmLabel || 'Đồng ý'}
          </button>
        </footer>
      </form>
    </div>
  );
}
