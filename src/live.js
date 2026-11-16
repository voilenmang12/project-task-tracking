// When a change hits work in progress, the server refuses it (423) and says what runs. The user is asked to stop that
// work; on yes it is stopped (work.stop) and the refused change is made again.
import { call } from './api.js';
import { confirmAction } from './Dialog.jsx';
import { actorName } from './ui.jsx';
import { runName } from './Runs.jsx';

function explain(live) {
  const who = live.owner ? actorName(live.owner) : 'một agent';
  const item = live.itemTitle && live.itemTitle !== live.title ? `"${live.itemTitle}" nằm trong việc "${live.title}"` : `"${live.title}"`;
  if (live.kind === 'flow') {
    return `Luồng "${live.title}" đang chạy (${who}). Đổi người chạy, chuyển về nháp, xoá hay chạy lại luồng thì phải dừng luồng: luồng tạm dừng, lượt chạy của nó (nếu có) bị tắt, việc đang làm dở trở về Chờ làm.`;
  }
  if (live.kind === 'run' || live.runFlowId) {
    const flow = live.runFlowId ? ' Phiên đó đang chạy cả luồng nên luồng cũng tạm dừng.' : '';
    return `${item} đang được ${runName(live.runId)} (phiên tracker mở) làm. Dừng sẽ tắt phiên đó và trả việc dở về Chờ làm; những gì đã commit vẫn còn trên nhánh.${flow}`;
  }
  return `${item} đang được ${who} làm. Dừng chỉ dừng việc này: việc trở về Chờ làm, agent không ghi tiếp được vào nó; luồng (nếu có) vẫn chạy các việc khác. Khi bạn bảo làm tiếp, agent tiếp tục trên nhánh cũ và áp những gì bạn đã đổi.`;
}

/** Returns true when it handled the error (asked the user, and stopped and retried on yes). */
export async function handleLive(error, onError) {
  const live = error?.live;
  if (!live) return false;
  const ok = await confirmAction({
    title: 'Đang chạy, cần dừng trước',
    text: `${explain(live)} Sau khi dừng, thao tác vừa rồi được làm lại.`,
    confirmLabel: 'Dừng rồi làm tiếp',
    danger: true,
  });
  if (!ok) return true;
  try {
    const target = live.kind === 'flow' || (!live.taskId && live.flowId) ? { flowId: live.flowId } : { taskId: live.taskId };
    await call('work.stop', { ...target, reason: `Stopped by the user to ${live.verb}` });
    if (error.retry) await call(error.retry.name, error.retry.args);
  } catch (e) {
    onError(e);
  }
  return true;
}
