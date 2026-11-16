// The user's side of review: approving or turning down what an agent proposed.
import { call } from './api.js';
import { askText } from './Dialog.jsx';

export const isPending = (t) => t.review === 'pending' && t.status !== 'done' && t.status !== 'dropped';

/** The proposals whose parent is not itself a proposal: approving these approves everything under them. */
export function pendingRoots(items) {
  const ids = new Set(items.map((t) => t.id));
  return items.filter((t) => !ids.has(t.parentId));
}

export async function approve(items) {
  for (const t of items) await call('task.approve', { taskId: t.id });
}

export async function rejectProposal(t) {
  const reason = await askText({
    title: 'Bỏ đề xuất', text: `"${t.title}" và các mục bên trong sẽ thành "Đã bỏ"; agent đọc được lý do.`,
    label: 'Vì sao không làm?', placeholder: 'Ngoài phạm vi GDD', confirmLabel: 'Bỏ', danger: true,
  });
  if (reason === null) return;
  await call('task.drop', { taskId: t.id, reason: reason || 'Not approved by the user' });
}
