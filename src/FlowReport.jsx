// The report of a flow: the overall report the agent wrote (flow.report, or the final message of a tracker run),
// and per task what is true now, with its proof, what is blocked and what waits for the user.
import React from 'react';
import Markdown from 'react-markdown';
import { X } from 'lucide-react';
import { flowTasks } from '../shared/model.js';
import { RunLine } from './Runs.jsx';
import { StatusIcon, actorName, clock, day } from './ui.jsx';

const EVIDENCE = { commit: 'commit', tests: 'test', report: 'báo cáo', screenshots: 'ảnh', notes: 'ghi chú' };

export default function FlowReport({ flow, tasks, runs, onOpenTask, onError, onClose }) {
  const reports = flow.reports || [];
  const [pick, setPick] = React.useState(reports.length - 1);
  const report = reports[pick];
  const items = flowTasks({ tasks, flows: [flow] }, flow);
  const flowRuns = runs.filter((r) => r.target.kind === 'flow' && r.target.id === flow.id).reverse();
  const count = (s) => items.filter((t) => t.status === s).length;

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="run-log flow-report" role="dialog" aria-modal="true" aria-label={`Báo cáo luồng ${flow.title}`}>
        <header className="dialog-head">
          <h2>Báo cáo · {flow.title}</h2>
          <button className="icon-btn" aria-label="Đóng" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="report-counts">
          <span><b>{count('done')}</b> xong</span>
          <span><b>{count('doing')}</b> đang làm</span>
          <span className="need"><b>{count('blocked')}</b> bị chặn</span>
          <span><b>{count('todo')}</b> chờ làm</span>
          {count('dropped') > 0 && <span className="muted"><b>{count('dropped')}</b> đã bỏ</span>}
        </div>

        <section>
          <h4 className="row">
            Báo cáo tổng
            {reports.length > 1 && (
              <select className="select" value={pick} onChange={(e) => setPick(Number(e.target.value))} aria-label="Chọn báo cáo">
                {reports.map((r, i) => <option key={r.at} value={i}>{day(r.at)} {clock(r.at)} · {actorName(r.by)}</option>)}
              </select>
            )}
          </h4>
          {report
            ? (
              <div className="report-text">
                <div className="muted small">{actorName(report.by)} · {day(report.at)} {clock(report.at)}{report.fromRun ? ' · tin nhắn cuối của lượt chạy' : ''}</div>
                <div className="markdown"><Markdown>{report.text}</Markdown></div>
              </div>
            )
            : <p className="muted">Chưa có báo cáo tổng. Agent ghi nó khi luồng chạy xong hoặc dừng (<code>flow.report</code>).</p>}
        </section>

        <section>
          <h4>Từng việc</h4>
          <table className="report-table">
            <tbody>
              {items.map((t) => (
                <tr key={t.id} className={`st-row-${t.status}`}>
                  <td><StatusIcon status={t.status} question={t.question && !t.question.answer} /></td>
                  <td>
                    <button className="link" onClick={() => { onClose(); onOpenTask(t.id); }}>{t.title}</button>
                    {t.owner && <span className="muted small"> · {actorName(t.owner)}</span>}
                  </td>
                  <td>
                    {t.status === 'done' && (t.summary || <span className="muted">(không có tóm tắt)</span>)}
                    {t.status === 'blocked' && <span className="warn">Bị chặn: {t.blockedReason}</span>}
                    {t.question && !t.question.answer && <span className="warn">Hỏi bạn: {t.question.text}</span>}
                    {t.unmet && <div className="warn small">Chưa đạt: {t.unmet}</div>}
                    {t.evidence && (
                      <div className="report-proof">
                        {Object.entries(t.evidence).map(([k, v]) => <span key={k} className="tag" title={v}>{EVIDENCE[k] || k}: {String(v).slice(0, 40)}</span>)}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {flowRuns.length > 0 && (
          <section>
            <h4>Các lượt chạy</h4>
            {flowRuns.map((r) => <RunLine key={r.id} run={r} onError={onError} />)}
          </section>
        )}
      </div>
    </div>
  );
}
