// When a change hits work in progress, the server refuses it (423) and says what runs. The user is asked to stop that
// work; on yes it is stopped (work.stop) and the refused change is made again.
import { call } from './api.js';
import { confirmAction } from './Dialog.jsx';
import { actorName } from './ui.jsx';

function explain(live) {
  const who = live.owner ? actorName(live.owner) : 'một agent';
  if (live.kind === 'flow') {
    const item = live.itemTitle && live.itemTitle !== live.title ? `"${live.itemTitle}" nằm trong luồng` : 'Luồng';
    return `${item} "${live.title}" đang chạy (${who}). Muốn đổi thì phải dừng luồng: luồng tạm dừng, lượt chạy của nó (nếu có) bị tắt, việc đang làm dở trở về Chờ làm.`;
  }
  if (live.kind === 'run') {
    return `${who} đang chạy "${live.title}" (phiên tracker mở). Dừng sẽ tắt phiên đó và trả việc dở về Chờ làm; những gì đã commit vẫn còn trên nhánh.`;
  }
  return `${who} đang làm "${live.itemTitle || live.title}". Dừng sẽ trả việc về Chờ làm; agent đó không ghi tiếp được vào việc này cho tới khi bạn bấm Chạy hoặc bảo nó làm tiếp trong chat.`;
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
    const target = live.flowId && live.kind !== 'task' ? { flowId: live.flowId } : { taskId: live.taskId };
    await call('work.stop', { ...target, reason: `Stopped by the user to ${live.verb}` });
    if (error.retry) await call(error.retry.name, error.retry.args);
  } catch (e) {
    onError(e);
  }
  return true;
}
